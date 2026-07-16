# feat(loop): register channel loops as Automations

## Context

`alva loop create` previously created only a cronjob. The loop could run in a
channel but remained absent from the Automation UI and normal Automation
lifecycle commands.

## Goals

- Register every successfully created channel loop as an Automation.
- Keep the cron schedule as the only run-admission source.
- Avoid leaving an invisible cronjob when Automation registration fails.
- Return both product-level and scheduler-level identifiers for diagnostics.

## Non-goals

- Generic `alva deploy create` remains a low-level cronjob operation.
- This change does not add Alerts delivery or high-frequency tick coalescing.

## Design

Loop creation seeds the shared runner, creates the cronjob, then publishes an
Automation with `skip_auto_trigger: true`. A publish failure rolls back the new
cronjob. If that rollback also fails, the CLI reports the orphan cronjob ID and
an exact cleanup command.

Normal lifecycle management uses the returned `automation_id`; deleting the
Automation also removes its producer cronjob.

## Verification

- Gateway request-forwarding test for `skip_auto_trigger`.
- Toolkit success, rollback, rollback-failure, and request-shape tests.
- Channel profile tests for Automation visibility, cleanup, and cadence
  guidance.
