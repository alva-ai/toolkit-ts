import { AlvaError } from '../error.js';

/**
 * Reads every page of an /api/v2 list from `pageToken` on, into one page
 * that ends the list: `{items, nextPageToken: null}`.
 */
export async function allPages<T>(
  read: (
    pageToken: string | undefined
  ) => Promise<{ items: T[]; nextPageToken: string | null }>,
  pageToken?: string
): Promise<{ items: T[]; nextPageToken: null }> {
  const items: T[] = [];
  let token = pageToken || undefined;
  for (;;) {
    const page = await read(token);
    items.push(...page.items);
    if (!page.nextPageToken) return { items, nextPageToken: null };
    if (page.nextPageToken === token) {
      throw new AlvaError(
        'INVALID_RESPONSE',
        'the list returned the page token it was sent',
        502
      );
    }
    token = page.nextPageToken;
  }
}
