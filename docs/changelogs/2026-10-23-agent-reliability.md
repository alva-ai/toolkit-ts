# fix: third-batch agent reliability

Remove AI Digest from CLI help examples. Existing get/file compatibility stays.

Primary design: mono-meta/code/backend/alva-backend/docs/changelogs/2026-10-23-agent-reliability.md. User approved the minimal scope on 2026-10-23. No production deployment.

## Verification

CLI tests386/386 and typecheck passed. Help uses generic identifiers; exact retrieval API unchanged. Release must also update embedded Toolkit and Dispatch before ALPI sees the new help. git diff --check passed. Complete local diff reviewed; no make lint-fix target. No production rollout or push.
