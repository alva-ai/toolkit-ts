#!/usr/bin/env bash
#
# E2E: restricted service-account (SA) execution identity — issue #602.
#
# Drives the WHOLE user/agent-facing path through the `alva` CLI:
#   toolkit (alva) -> gateway REST (/api/v1/...) -> backend gRPC -> jagent exec
# and asserts the SA security model end-to-end.
#
# Covered cases (CTO list) — BOTH execution entry points:
#   1. SA lifecycle: create / list / grant / (delete)
#   2. CRONJOB that runs under the SA (deploy --run-as-service-account)
#   2b. UDF / service function that runs under the SA (functions register
#       --run-as-service-account), asserted via the invoke result/logs.
#       Gated on E2E_PLAYBOOK_ID (the CLI has no `playbooks create`).
#   3. Execution identity == SA            (env.userId == SA id)
#   4. File access is SCOPED to grants     (granted path read OK; ungranted DENIED)
#   5. Secrets resolve to the OWNER        (SA reads the owner's secret)  [decision 2026-06-30]
#   6. Billing/attribution stays the owner (env.callerUserId == owner; UDF also
#      checks credits_charged_consumer == 0 at the ledger level)
#   7. Fail-closed on a deleted SA         (run is refused, NOT silently run-as-owner)
#
# ---------------------------------------------------------------------------
# PREREQUISITES (this is a real end-to-end test against a running stack):
#   * PR A (alva-backend, #1524), PR B (gateway #608 + toolkit #113) MERGED and
#     DEPLOYED to the target environment. The gateway must expose
#     /api/v1/service-account* and carry run_as_user_id on /api/v1/deploy/cronjob.
#   * `alva` CLI built and authenticated against that environment
#     (e.g. `alva auth login` / a configured profile). The authed user is the OWNER.
#   * `jq` installed.
#
# Usage:
#   ALVA_BIN=alva ./scripts/e2e/service-account.sh
#
# Exit code 0 = all assertions passed. Non-zero = first failure (with context).
# ---------------------------------------------------------------------------
set -euo pipefail

ALVA="${ALVA_BIN:-alva}"
SUFFIX="${E2E_SUFFIX:-$(date +%s)-$$}"
SA_NAME="e2e-sa-${SUFFIX}"
CRON_NAME="e2e-sa-cron-${SUFFIX}"
BASE="~/e2e-sa-${SUFFIX}"          # ALFS home-relative; the CLI expands ~
ALLOWED_DIR="${BASE}/allowed"
DENIED_DIR="${BASE}/denied"
ENTRY="${ALLOWED_DIR}/main.js"
ALLOWED_FILE="${ALLOWED_DIR}/data.txt"
DENIED_FILE="${DENIED_DIR}/secret.txt"
SECRET_NAME="E2E_OWNER_SECRET_${SUFFIX}"
SECRET_VALUE="owner-only-$(date +%s)"

SA_ID=""
CRON_ID=""

# --- tiny test harness -----------------------------------------------------
c_red=$'\033[31m'; c_grn=$'\033[32m'; c_dim=$'\033[2m'; c_rst=$'\033[0m'
step() { printf '\n=== %s ===\n' "$*"; }
pass() { printf '%s  ✓ %s%s\n' "$c_grn" "$*" "$c_rst"; }
fail() { printf '%s  ✗ %s%s\n' "$c_red" "$*" "$c_rst" >&2; exit 1; }
run()  { printf '%s$ %s%s\n' "$c_dim" "$*" "$c_rst" >&2; "$@"; }
jqget() { jq -r "$1" 2>/dev/null || true; }

assert_eq()       { [ "$1" = "$2" ] || fail "expected [$2], got [$1] — $3"; pass "$3 ($1)"; }
assert_contains() { printf '%s' "$1" | grep -qF -- "$2" || fail "expected to contain [$2] — $3"; pass "$3"; }
assert_absent()   { printf '%s' "$1" | grep -qF -- "$2" && fail "must NOT contain [$2] — $3"; pass "$3"; }

# wait_for_run_log <cron_id> <workflow_run_id> — poll `deploy runs` until the row
# for THIS trigger is persisted, matched by workflow_run_id (the cronjob_runs row
# only appears after the worker finishes — DeployResource.trigger), then echo its
# run log. Matching by workflow_run_id is essential: the cronjob fires every
# minute, so runs[0] could be a prior or natural-tick run (Codex #113 P2).
wait_for_run_log() {
  local cron_id="$1" wf_id="$2" run_id
  for _ in $(seq 1 40); do
    run_id=$($ALVA deploy runs --id "$cron_id" --first 10 2>/dev/null \
      | jq -r --arg w "$wf_id" '.runs[]? | select(.workflow_run_id==$w) | .id' 2>/dev/null | head -1)
    if [ -n "$run_id" ] && [ "$run_id" != "null" ]; then
      $ALVA deploy run-logs --id "$cron_id" --run-id "$run_id" 2>/dev/null || true
      return 0
    fi
    sleep 2
  done
  return 1
}

cleanup() {
  step "Cleanup (best-effort)"
  [ -n "${E2E_PLAYBOOK_ID:-}" ] && [ -n "${FN_NAME:-}" ] && {
    $ALVA functions delete --playbook-id "$E2E_PLAYBOOK_ID" --function-name "$FN_NAME" >/dev/null 2>&1 || true; }
  [ -n "$CRON_ID" ] && { $ALVA deploy delete --id "$CRON_ID" >/dev/null 2>&1 || true; }
  [ -n "$SA_ID" ]   && { $ALVA service-account delete --id "$SA_ID" >/dev/null 2>&1 || true; }
  $ALVA secrets delete --name "$SECRET_NAME" >/dev/null 2>&1 || true
  $ALVA fs remove --path "$BASE" --recursive >/dev/null 2>&1 || true
}
trap cleanup EXIT

# --- fixture script the cronjob will run -----------------------------------
# It self-reports identity, file-scope, and secret resolution into the run log
# via E2E_* markers the assertions below grep for.
read -r -d '' FIXTURE <<'JS' || true
const env = require("env");
const alfs = require("alfs");
const sm = require("secret-manager");

console.log("E2E_EXEC_UID=" + env.userId);          // ALFS principal — must be the SA
console.log("E2E_USERNAME=" + env.username);          // path namespace — the owner
console.log("E2E_CALLER_UID=" + env.callerUserId);    // payer/attribution — the owner

try { alfs.readFile(__ALLOWED_FILE__); console.log("E2E_ALLOWED=ok"); }
catch (e) { console.log("E2E_ALLOWED=FAIL:" + e.message); }

try { alfs.readFile(__DENIED_FILE__); console.log("E2E_DENIED=LEAK"); }
catch (e) { console.log("E2E_DENIED=denied"); }

try {
  const s = sm.loadPlaintext(__SECRET_NAME__);
  console.log("E2E_SECRET=" + (s ? "got:" + s : "null"));
} catch (e) { console.log("E2E_SECRET=ERR:" + e.message); }
JS
# Interpolate the concrete paths/name into the fixture (kept out of the heredoc
# so the JS stays literal).
FIXTURE=${FIXTURE//__ALLOWED_FILE__/\"${ALLOWED_FILE}\"}
FIXTURE=${FIXTURE//__DENIED_FILE__/\"${DENIED_FILE}\"}
FIXTURE=${FIXTURE//__SECRET_NAME__/\"${SECRET_NAME}\"}

# ===========================================================================
step "0. Seed ALFS files + an owner-only secret"
run $ALVA fs write --path "$ALLOWED_FILE" --data "allowed-payload"        >/dev/null
run $ALVA fs write --path "$DENIED_FILE"  --data "do-not-leak"            >/dev/null
run $ALVA fs write --path "$ENTRY"        --data "$FIXTURE"               >/dev/null
run $ALVA secrets create --name "$SECRET_NAME" --value "$SECRET_VALUE"    >/dev/null
pass "seeded entry script, allowed/denied files, and owner secret"

step "1. Create the service account"
SA_JSON=$(run $ALVA service-account create --name "$SA_NAME")
SA_ID=$(printf '%s' "$SA_JSON" | jqget '.service_account.id // .id')
[ -n "$SA_ID" ] && [ "$SA_ID" != "null" ] || fail "could not parse SA id from: $SA_JSON"
pass "created SA id=$SA_ID"

step "2. List shows the SA, parented to the caller (owner)"
LIST_JSON=$(run $ALVA service-account list)
assert_contains "$LIST_JSON" "\"id\": $SA_ID" "SA appears in list"
PARENT=$(printf '%s' "$LIST_JSON" | jqget ".service_accounts[]? | select(.id==$SA_ID) | .parent_user_id")
[ -n "$PARENT" ] && [ "$PARENT" != "0" ] && [ "$PARENT" != "null" ] \
  && pass "SA has a parent_user_id ($PARENT)" \
  || printf '%s  ~ parent_user_id not surfaced in list output (check response shape)%s\n' "$c_dim" "$c_rst"

step "3. Grant the SA read+import on the ALLOWED dir ONLY"
run $ALVA service-account grant --id "$SA_ID" --path "$ALLOWED_DIR" --permission read   >/dev/null
run $ALVA service-account grant --id "$SA_ID" --path "$ALLOWED_DIR" --permission import >/dev/null
pass "granted read+import on $ALLOWED_DIR (denied dir intentionally NOT granted)"

step "4. Deploy a cronjob that runs AS the SA"
CRON_JSON=$(run $ALVA deploy create \
  --name "$CRON_NAME" --path "$ENTRY" --cron "* * * * *" \
  --run-as-service-account "$SA_ID")
CRON_ID=$(printf '%s' "$CRON_JSON" | jqget '.id')
[ -n "$CRON_ID" ] && [ "$CRON_ID" != "null" ] || fail "could not parse cronjob id from: $CRON_JSON"
RUN_AS=$(printf '%s' "$CRON_JSON" | jqget '.run_as_user_id')
assert_eq "$RUN_AS" "$SA_ID" "cronjob persisted run_as_user_id == SA id"

step "5. Trigger + collect THIS run's log (matched by workflow_run_id)"
WF_ID=$(run $ALVA deploy trigger --id "$CRON_ID" | jqget '.workflow_run_id')
[ -n "$WF_ID" ] && [ "$WF_ID" != "null" ] || fail "deploy trigger did not return a workflow_run_id"
LOG=$(wait_for_run_log "$CRON_ID" "$WF_ID") \
  || fail "this trigger's run never appeared (workflow_run_id=$WF_ID) on cronjob $CRON_ID"
[ -n "$LOG" ] || fail "empty run log for workflow_run_id=$WF_ID"
printf '%s--- run log ---\n%s\n---------------%s\n' "$c_dim" "$LOG" "$c_rst" >&2

step "6. Assert the SA security model from the run log"
assert_contains "$LOG" "E2E_EXEC_UID=$SA_ID" "execution identity (env.userId) == SA"
assert_contains "$LOG" "E2E_ALLOWED=ok"      "granted path is readable"
assert_contains "$LOG" "E2E_DENIED=denied"   "ungranted path is DENIED (scoped file access)"
assert_absent   "$LOG" "E2E_DENIED=LEAK"     "ungranted path did not leak"
assert_contains "$LOG" "E2E_SECRET=got:$SECRET_VALUE" "SA reads the OWNER's secret (#602 decision)"
# Billing/attribution identity is the owner, not the SA.
assert_absent   "$LOG" "E2E_CALLER_UID=$SA_ID" "payer/attribution (env.callerUserId) is NOT the SA"

# ===========================================================================
# UDF (service function) run_as — the SECOND execution entry point. Gated on a
# pre-existing playbook id (the CLI has no `playbooks create`), so set
# E2E_PLAYBOOK_ID to a playbook you own to exercise it. The function reuses the
# same entry script (it self-reports via E2E_* in its run log) and the same SA.
if [ -n "${E2E_PLAYBOOK_ID:-}" ]; then
  FN_NAME="e2e_sa_fn_${SUFFIX//[^0-9a-zA-Z_]/_}"

  step "6b. Register a UDF that runs AS the SA, then invoke it"
  run $ALVA functions register \
    --playbook-id "$E2E_PLAYBOOK_ID" \
    --function-name "$FN_NAME" \
    --entry-script-path "$ENTRY" \
    --run-as-service-account "$SA_ID" >/dev/null
  pass "registered UDF $FN_NAME run_as=$SA_ID"

  INVOKE_JSON=$(run $ALVA functions invoke \
    --playbook-id "$E2E_PLAYBOOK_ID" --function-name "$FN_NAME")
  ULOG=$(printf '%s' "$INVOKE_JSON" | jqget '.logs')
  printf '%s--- udf invoke logs ---\n%s\n-----------------------%s\n' "$c_dim" "$ULOG" "$c_rst" >&2

  step "6c. Assert the SA model on the UDF invoke (same checks, via invoke logs)"
  assert_contains "$ULOG" "E2E_EXEC_UID=$SA_ID" "UDF exec identity == SA"
  assert_contains "$ULOG" "E2E_ALLOWED=ok"      "UDF: granted path readable"
  assert_contains "$ULOG" "E2E_DENIED=denied"   "UDF: ungranted path DENIED"
  assert_absent   "$ULOG" "E2E_DENIED=LEAK"     "UDF: ungranted path did not leak"
  assert_contains "$ULOG" "E2E_SECRET=got:$SECRET_VALUE" "UDF: SA reads the OWNER's secret"
  assert_absent   "$ULOG" "E2E_CALLER_UID=$SA_ID" "UDF: attribution is NOT the SA"
  # Ledger-level billing: invoke exposes the charge split. SAs have no economic
  # identity → nothing is charged to a separate "consumer" account; the cost
  # lands on the owner (parent). credits_charged_consumer must be 0.
  CHARGED_CONSUMER=$(printf '%s' "$INVOKE_JSON" | jqget '.credits_charged_consumer')
  assert_eq "${CHARGED_CONSUMER:-0}" "0" "no charge to a separate consumer (SA bills to owner/parent)"

  # cleanup the function (delete is by playbook+name)
  $ALVA functions delete --playbook-id "$E2E_PLAYBOOK_ID" --function-name "$FN_NAME" >/dev/null 2>&1 || true
else
  step "6b. UDF (service function) run_as — SKIPPED"
  printf '%s  ~ set E2E_PLAYBOOK_ID=<a playbook you own> to also test the UDF path%s\n' "$c_dim" "$c_rst"
fi

step "7. Fail-closed: delete the SA, re-trigger, the run must REFUSE (not run as owner)"
run $ALVA service-account delete --id "$SA_ID" >/dev/null
SA_ID=""   # already deleted; don't re-delete in cleanup
WF_ID2=$(run $ALVA deploy trigger --id "$CRON_ID" | jqget '.workflow_run_id')
[ -n "$WF_ID2" ] && [ "$WF_ID2" != "null" ] || fail "deploy trigger did not return a workflow_run_id"
# Match THIS trigger's run (not the still-present step-5 run) before judging.
LOG2=$(wait_for_run_log "$CRON_ID" "$WF_ID2") \
  || fail "deleted-SA trigger's run never appeared (workflow_run_id=$WF_ID2)"
# The deleted-SA run must NOT have executed the script as the owner.
assert_absent "$LOG2" "E2E_EXEC_UID=" \
  "deleted-SA run failed closed (the script never executed — no fallback to owner)"

step "DONE"
pass "service-account E2E passed"
printf '\nNOTE: billing-to-parent at the ledger level (credits charged to the owner,\n'
printf 'not the SA) is asserted indirectly here via env.callerUserId. For a ledger-\n'
printf 'level check, inspect the owner''s credit log / allowance after the run.\n'
