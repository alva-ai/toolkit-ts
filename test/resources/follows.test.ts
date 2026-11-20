import { afterEach, describe, it, expect } from 'vitest';
import { AlvaClient } from '../../src/client.js';
import { fakeV2, problem } from '../fakeV2.js';
import { anAssetFollow, aProfile, BTC, NVDA, PROFILE } from '../socialV2.js';

let restore: (() => void) | undefined;
afterEach(() => restore?.());

function client() {
  return new AlvaClient({ apiKey: 'key', baseUrl: 'https://api.test' });
}

describe('FollowsResource', () => {
  it('watchlist() and followCounts() return the FollowedAssetList and FollowCounts', async () => {
    const page = {
      items: [
        {
          id: NVDA,
          symbol: 'NVDA',
          name: 'NVIDIA Corporation',
          kind: 'STOCK' as const,
          followedAt: '2026-11-01T00:00:00Z',
        },
      ],
      nextPageToken: 'p2',
    };
    const fake = fakeV2({
      'GET /me/followed-assets': () => page,
      'GET /me/follow-counts': () => ({ assetCount: 7 }),
    });
    restore = fake.restore;
    const c = client();
    expect(await c.follows.watchlist({ pageSize: 1 })).toEqual(page);
    expect(await c.follows.followCounts()).toEqual({ assetCount: 7 });
    expect(fake.calls[0].query.get('pageSize')).toBe('1');
  });

  it('followAssets() posts the Asset IDs in one batch with a key', async () => {
    const answer = { assets: [anAssetFollow()] };
    const fake = fakeV2({ 'POST /me/followed-assets': () => answer });
    restore = fake.restore;
    expect(
      await client().follows.followAssets([NVDA], { idempotencyKey: 'f1' })
    ).toEqual(answer);
    expect(fake.calls[0].body).toEqual({ assetIds: [NVDA] });
    expect(fake.calls[0].headers['Idempotency-Key']).toBe('"f1"');
  });

  it('unfollowAssets() deletes each Asset and returns their AssetFollows in order', async () => {
    const btc = anAssetFollow({
      asset: { id: BTC, symbol: 'BTC', name: 'Bitcoin', kind: 'CRYPTO' },
      following: false,
      changed: false,
    });
    const fake = fakeV2({
      [`DELETE /me/followed-assets/${NVDA}`]: () =>
        anAssetFollow({ following: false }),
      [`DELETE /me/followed-assets/${BTC}`]: () => btc,
    });
    restore = fake.restore;
    expect(await client().follows.unfollowAssets([NVDA, BTC])).toEqual({
      assets: [anAssetFollow({ following: false }), btc],
    });
  });

  it('unfollowAssets() reports the first failure', async () => {
    const fake = fakeV2({
      [`DELETE /me/followed-assets/${NVDA}`]: () => problem(404, 'NOT_FOUND'),
    });
    restore = fake.restore;
    await expect(client().follows.unfollowAssets([NVDA])).rejects.toMatchObject(
      { code: 'NOT_FOUND' }
    );
  });

  it('searchProfiles() and profiles() return ProfileList pages', async () => {
    const page = { items: [aProfile()], nextPageToken: null };
    const fake = fakeV2({
      'GET /profiles': () => page,
      'GET /me/followed-profiles': () => page,
    });
    restore = fake.restore;
    const c = client();
    expect(
      await c.follows.searchProfiles({ query: 'alice', kind: 'USER' })
    ).toEqual(page);
    expect(await c.follows.profiles({ kind: 'PERSON' })).toEqual(page);
    expect(fake.calls.map((call) => call.query.toString())).toEqual([
      'query=alice&kind=USER',
      'kind=PERSON',
    ]);
  });

  it('followProfile() and unfollowProfile() take the Profile ID', async () => {
    const followed = { following: true, profile: aProfile() };
    const fake = fakeV2({
      'POST /me/followed-profiles': () => followed,
      [`DELETE /me/followed-profiles/${PROFILE}`]: () => ({
        following: false,
        profile: null,
      }),
    });
    restore = fake.restore;
    const c = client();
    expect(await c.follows.followProfile(PROFILE)).toEqual(followed);
    expect(await c.follows.unfollowProfile(PROFILE)).toEqual({
      following: false,
      profile: null,
    });
    expect(fake.calls[0].body).toEqual({ profileId: PROFILE });
  });
});
