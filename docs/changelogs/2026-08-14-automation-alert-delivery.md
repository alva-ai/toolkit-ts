# feat(cli): manage per-Automation delivery destinations

- Add `client.automation.delivery.get()` and `.update()` GraphQL resources.
- Add `alva automation delivery get --id <id>`.
- Add partial updates through `--email-enabled`, `--no-email-enabled`, and
  `--alva-channel-ids <ids>`; `--alva-channel-ids=` clears only Alva
  destinations.
- Email-only updates omit Alva input and response selection, avoiding
  client-side read-modify-write and unrelated Channel hydration.
- Validate snowflake-safe Automation IDs, Channel IDs, no-op updates, GraphQL
  errors, command parsing, help drift, and explicit empty Channel lists.
