import { afterEach, describe, expect, it, vi } from 'vitest';
import { AlvaClient } from '../../src/client.js';
import { dispatch as terminal } from '../../src/cli/index.js';
import { dispatch as embedded } from '../../src/cli/embeddedDispatch.js';
import {
  THESIS,
  VERSION,
  v2Fetch,
  wireThesis,
  wireVersion,
} from '../contentV2.js';

afterEach(() => vi.unstubAllGlobals());
for (const [name, dispatch] of [
  ['terminal', terminal],
  ['embedded', embedded],
] as const) {
  describe(`${name} Thesis Updates`, () => {
    it('lists visible Updates with paging', async () => {
      const previous = wireVersion({
        id: 'thesis_version_0prev',
        number: 1,
        materialVersionId: 'thesis_version_0prev',
        title: '',
        body: 'Previous view',
        assets: [],
      });
      const { calls } = v2Fetch({
        [`GET /theses/${THESIS}`]: wireThesis({
          visibility: 'PRIVATE',
          author: null,
        }),
        [`GET /theses/${THESIS}/updates`]: {
          items: [previous],
          nextPageToken: 'next',
        },
      });
      const client = new AlvaClient({
        apiKey: 'test',
        baseUrl: 'https://example.test',
      });
      expect(
        await dispatch(client, [
          'thesis',
          'version',
          'list',
          '--id',
          THESIS,
          '--first',
          '1',
        ])
      ).toEqual({
        versions: [
          {
            id: THESIS,
            number: 42,
            author_version_id: 'thesis_version_0prev',
            author_version_number: 1,
            material_version_id: 'thesis_version_0prev',
            title: '',
            body: 'Previous view',
            entity_ids: [],
            entity_stances: [],
            visibility: 'private',
            medias: [],
            closed: false,
            closing_note: '',
            author_kind: '',
            author_ref: '',
            archived: false,
            note: '',
          },
        ],
        next_cursor: 'next',
      });
      const list = calls.find((c) => c.path.endsWith('/updates'));
      expect(Object.fromEntries(list!.query)).toEqual({ pageSize: '1' });
      expect(VERSION).not.toBe('thesis_version_0prev');
    });
  });
}
