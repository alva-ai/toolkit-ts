# feat: publish SDK artifacts with an admin API key

Adds `alva sdk publish` as a repository-independent producer entrypoint for
ALFS-backed SDK artifacts. The command reads a built CommonJS bundle, publishes
it through the gateway with the caller's normal Alva API key, updates `latest`
by default, and requests consumer-path readback verification.

The command is intentionally unavailable in jagent mode because publishing
requires access to a local build artifact. The gateway currently restricts the
operation to API keys owned by admin users, and ALFS retains its package
allowlist.
