# Add playbook functions CLI

Adds creator-side playbook function management to the SDK and CLI.

## What changed

- Added `client.functions` with `register`, `list`, `delete`, and `invoke`.
- Added `alva functions register|list|delete|invoke`.
- Added REST-backed allowance helpers with `getAllowance`, `listAllowances`,
  `createAllowance`, and `revokeAllowance`.
- Added `alva functions allowance get|list|create|revoke`.
- `alva functions allowance list` uses gateway REST
  `/api/v1/service/allowances`.
- Accepts inline `--params-schema` or local `--params-schema-file`, validates
  JSON locally, and forwards the schema string expected by the gateway.
- Supports `--allow-charges` and `--no-allow-charges` for explicit UDF billing
  behavior.
- Parses `invoke` result JSON so CLI/SDK users get the same usable result shape
  as the browser UDF runtime.

## Examples

```bash
alva functions register \
  --playbook-id 123 \
  --function-name analyze \
  --entry-script-path /alva/home/alice/playbooks/my-playbook/udf/analyze.js \
  --params-schema-file ./schema.json \
  --no-allow-charges

alva functions list --playbook-id 123
alva functions invoke --playbook-id 123 --function-name analyze --params '{"ticker":"AAPL"}'
alva functions delete --playbook-id 123 --function-name analyze
alva functions allowance create --playbook-id 123 --amount 25
alva functions allowance get --playbook-id 123
alva functions allowance list
alva functions allowance revoke --playbook-id 123
```
