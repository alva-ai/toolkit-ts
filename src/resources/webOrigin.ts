/**
 * Derive the user-facing web origin (where playbooks and theses are browsable) from the
 * API base URL. Playbooks live at `<web-origin>/u/<owner>/playbooks/<name>`, theses at
 * `<web-origin>/thesis/<id>`.
 * Mirrors the env family: `api-llm.prd.alva.ai` → `https://alva.ai`,
 * `api-llm.stg.alva.ai` → `https://stg.alva.ai`. Falls back to
 * `https://alva.ai` for unrecognized hosts (custom base URLs, local-dev).
 */
export function webOriginFromApiBase(apiBaseUrl: string): string {
  try {
    const host = new URL(apiBaseUrl).hostname;
    const match = /^api-llm\.([a-z0-9-]+)\.alva\.ai$/i.exec(host);
    if (match) {
      const env = match[1].toLowerCase();
      return env === 'prd' ? 'https://alva.ai' : `https://${env}.alva.ai`;
    }
  } catch {
    // Malformed base URL — fall through to the default origin.
  }
  return 'https://alva.ai';
}
