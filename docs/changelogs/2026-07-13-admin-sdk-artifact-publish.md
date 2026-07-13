# feat: publish user-scoped SDK artifacts

Adds `alva sdk publish` as a repository-independent producer entrypoint for
ALFS-backed SDK artifacts. The command reads a built CommonJS bundle, publishes
it through the gateway with the caller's normal Alva API key, updates `latest`
by default, and requests consumer-path readback verification.

The command is intentionally unavailable in jagent mode because publishing
requires access to a local build artifact. Any real-user API key may publish;
the server derives the immutable scope from that user's username. Admin users
may pass `--platform` to publish under `@alva`. The username is never accepted
in the request body.
