import { describe, expect, it, vi } from 'vitest';
import { AlvaClient } from '../../src/client.js';
import { AlvaError } from '../../src/error.js';

const ID = '9451';

function stubbed(...responses: unknown[]) {
  const client = new AlvaClient({ apiKey: 'key' }) as AlvaClient & {
    _request: ReturnType<typeof vi.fn>;
  };
  const request = vi.fn();
  for (const response of responses) {
    if (response instanceof Error) request.mockRejectedValueOnce(response);
    else request.mockResolvedValueOnce(response);
  }
  client._request = request;
  return client;
}

const CONDITION = {
  id: '4412',
  label: 'W3',
  kind: 'numeric',
  entity_id: '501',
  ticker: 'NVDA',
  metric: 'price',
  comparison: 'lte',
  threshold: 150,
  state: 'triggered',
  triggered_at_ms: 1795530000000,
  observed_value: 149.6,
  decision: 'proposed',
};
const CHANGES = [
  {
    entity_id: '501',
    ticker: 'NVDA',
    from_direction: 'none',
    direction: 'long',
    weight: 0.25,
  },
  {
    entity_id: '502',
    ticker: 'AMD',
    from_direction: 'long',
    from_weight: 0.5,
    direction: 'long',
    weight: 0.5,
  },
];
// /api/v2 wire (alva-gateway pkg/v2/api/theses/rebalance.go): opaque ids,
// every member present, null without a value, decimals as strings.
const V2_THESIS = 'thesis_0ab3c';
const V2_PROPOSAL = 'thesis_rebalance_proposal_09x2k';
const BY_NUMBER = { id: V2_THESIS, number: 9451 };
const V2_CONDITION = {
  id: 'thesis_watchpoint_condition_04g7m',
  label: 'W3',
  kind: 'NUMERIC',
  assetId: 'asset_0fz1',
  symbol: 'NVDA',
  metric: 'PRICE',
  comparison: 'LTE',
  threshold: '150',
  event: null,
  state: 'TRIGGERED',
  closeReason: null,
  triggeredAt: '2026-11-25T14:20:00.000Z',
  observedValue: '149.6',
  decision: 'PROPOSED',
};
const V2_PROPOSAL_BODY = {
  id: V2_PROPOSAL,
  thesisId: V2_THESIS,
  state: 'WAITING',
  condition: V2_CONDITION,
  changes: [
    {
      assetId: 'asset_0fz1',
      symbol: 'NVDA',
      fromDirection: 'NONE',
      fromWeight: null,
      direction: 'BULLISH',
      weight: '0.25',
    },
    {
      assetId: 'asset_0fz2',
      symbol: 'AMD',
      fromDirection: 'BULLISH',
      fromWeight: '0.5',
      direction: 'BULLISH',
      weight: '0.5',
    },
  ],
  reasoning: 'NVDA closed at 149.6, under the 150 level (W3).',
  importance: 'MAJOR',
  confident: true,
  mode: 'MANUAL',
  createdAt: '2026-11-25T14:21:00.000Z',
  deliveredAt: '2026-11-25T14:22:00.000Z',
  expiresAt: '2026-11-26T14:22:00.000Z',
  versionId: null,
};
const PROPOSAL_OUT = {
  id: V2_PROPOSAL,
  state: 'waiting',
  condition: {
    id: 'thesis_watchpoint_condition_04g7m',
    label: 'W3',
    kind: 'numeric',
    state: 'triggered',
    entity_id: 'asset_0fz1',
    ticker: 'NVDA',
    metric: 'price',
    comparison: 'lte',
    decision: 'proposed',
    threshold: 150,
    observed_value: 149.6,
    triggered_at_ms: Date.parse('2026-11-25T14:20:00.000Z'),
  },
  changes: [
    {
      entity_id: 'asset_0fz1',
      ticker: 'NVDA',
      from_direction: 'none',
      direction: 'long',
      weight: 0.25,
    },
    {
      entity_id: 'asset_0fz2',
      ticker: 'AMD',
      from_direction: 'long',
      direction: 'long',
      from_weight: 0.5,
      weight: 0.5,
    },
  ],
  reasoning: 'NVDA closed at 149.6, under the 150 level (W3).',
  importance: 'major',
  confident: true,
  mode: 'manual',
  created_at_ms: Date.parse('2026-11-25T14:21:00.000Z'),
  delivered_at_ms: Date.parse('2026-11-25T14:22:00.000Z'),
  expires_at_ms: Date.parse('2026-11-26T14:22:00.000Z'),
};

describe('Thesis decision mode over /api/v2', () => {
  it('resolves the Thesis number, then reads and patches the mode', async () => {
    const client = stubbed(BY_NUMBER, { mode: 'MANUAL' }, BY_NUMBER, {
      mode: 'YOLO',
    });
    await expect(client.theses.getDecisionMode(ID)).resolves.toEqual({
      thesis_id: ID,
      decision_mode: 'manual',
    });
    expect(client._request.mock.calls).toEqual([
      ['GET', `/api/v2/theses/by-number/${ID}`],
      ['GET', `/api/v2/theses/${V2_THESIS}/decision-mode`],
    ]);
    await expect(client.theses.setDecisionMode(ID, 'yolo')).resolves.toEqual({
      thesis_id: ID,
      decision_mode: 'yolo',
    });
    expect(client._request).toHaveBeenLastCalledWith(
      'PATCH',
      `/api/v2/theses/${V2_THESIS}/decision-mode`,
      { body: { mode: 'YOLO' } }
    );
  });

  it('rejects bad input before any request and odd responses after', async () => {
    const client = stubbed(
      BY_NUMBER,
      { mode: 'RECKLESS' },
      { id: 'playbook_0ab', number: 9451 },
      { id: V2_THESIS, number: 1 },
      BY_NUMBER,
      { mode: 'MANUAL' }
    );
    await expect(
      client.theses.setDecisionMode(ID, 'reckless' as never)
    ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    await expect(client.theses.getDecisionMode('x')).rejects.toMatchObject({
      code: 'INVALID_ARGUMENT',
    });
    expect(client._request).not.toHaveBeenCalled();
    // An unknown mode, a by-number answer without a Thesis id, another
    // Thesis, and a mode that was not applied.
    for (let i = 0; i < 3; i++) {
      await expect(client.theses.getDecisionMode(ID)).rejects.toMatchObject({
        code: 'INVALID_RESPONSE',
      });
    }
    await expect(
      client.theses.setDecisionMode(ID, 'auto')
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it("passes the gateway's problem through", async () => {
    const client = stubbed(
      BY_NUMBER,
      new AlvaError('PERMISSION_DENIED', 'only the author', 403)
    );
    await expect(client.theses.getDecisionMode(ID)).rejects.toMatchObject({
      code: 'PERMISSION_DENIED',
      status: 403,
    });
    const missing = stubbed(new AlvaError('NOT_FOUND', 'no Thesis', 404));
    await expect(missing.theses.getDecisionMode(ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

describe('Thesis rebalance proposals over /api/v2', () => {
  it('lists one page newest first with its token', async () => {
    const client = stubbed(
      BY_NUMBER,
      { items: [V2_PROPOSAL_BODY], nextPageToken: 'c2' },
      BY_NUMBER,
      { items: [], nextPageToken: null }
    );
    await expect(client.theses.listRebalanceProposals(ID)).resolves.toEqual({
      proposals: [PROPOSAL_OUT],
      next_cursor: 'c2',
    });
    expect(client._request).toHaveBeenLastCalledWith(
      'GET',
      `/api/v2/theses/${V2_THESIS}/rebalance-proposals`,
      { query: { pageSize: 20 } }
    );
    await expect(
      client.theses.listRebalanceProposals(ID, { first: 100, cursor: 'c2' })
    ).resolves.toEqual({ proposals: [], next_cursor: '' });
    expect(client._request).toHaveBeenLastCalledWith(
      'GET',
      `/api/v2/theses/${V2_THESIS}/rebalance-proposals`,
      { query: { pageSize: 100, pageToken: 'c2' } }
    );
  });

  it('omits every null member of a sparse proposal', async () => {
    const sparse = {
      ...V2_PROPOSAL_BODY,
      state: 'NO_CHANGE',
      importance: 'UNKNOWN',
      changes: [],
      condition: {
        id: 'thesis_watchpoint_condition_04g7n',
        label: 'W5',
        kind: 'INFORMATIONAL',
        assetId: null,
        symbol: null,
        metric: null,
        comparison: null,
        threshold: null,
        event: 'NVIDIA announces a share buyback',
        state: 'TRIGGERED',
        closeReason: null,
        triggeredAt: null,
        observedValue: null,
        decision: null,
      },
      deliveredAt: null,
      expiresAt: null,
      versionId: null,
    };
    const client = stubbed(BY_NUMBER, { items: [sparse], nextPageToken: null });
    const page = await client.theses.listRebalanceProposals(ID);
    expect(page.proposals[0]).toEqual({
      id: V2_PROPOSAL,
      state: 'no_change',
      condition: {
        id: 'thesis_watchpoint_condition_04g7n',
        label: 'W5',
        kind: 'informational',
        state: 'triggered',
        event: 'NVIDIA announces a share buyback',
      },
      changes: [],
      reasoning: PROPOSAL_OUT.reasoning,
      importance: 'unknown',
      confident: true,
      mode: 'manual',
      created_at_ms: PROPOSAL_OUT.created_at_ms,
    });
  });

  it('accepts and declines with no body and checks the proposal returned', async () => {
    const client = stubbed(
      BY_NUMBER,
      {
        ...V2_PROPOSAL_BODY,
        state: 'ACCEPTED',
        versionId: 'thesis_version_0k2p',
      },
      BY_NUMBER,
      { ...V2_PROPOSAL_BODY, state: 'DECLINED' },
      BY_NUMBER,
      { ...V2_PROPOSAL_BODY, id: 'thesis_rebalance_proposal_09x2m' }
    );
    await expect(
      client.theses.acceptRebalanceProposal(ID, V2_PROPOSAL)
    ).resolves.toMatchObject({
      proposal: {
        id: V2_PROPOSAL,
        state: 'accepted',
        version_id: 'thesis_version_0k2p',
      },
    });
    expect(client._request).toHaveBeenLastCalledWith(
      'POST',
      `/api/v2/theses/${V2_THESIS}/rebalance-proposals/${V2_PROPOSAL}/accept`
    );
    await expect(
      client.theses.declineRebalanceProposal(ID, V2_PROPOSAL)
    ).resolves.toMatchObject({ proposal: { state: 'declined' } });
    expect(client._request).toHaveBeenLastCalledWith(
      'POST',
      `/api/v2/theses/${V2_THESIS}/rebalance-proposals/${V2_PROPOSAL}/decline`
    );
    await expect(
      client.theses.acceptRebalanceProposal(ID, V2_PROPOSAL)
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('surfaces a refused answer (409 problem) once, without retrying', async () => {
    const problem = {
      type: 'https://alva.ai/problems/conflict',
      title: 'Conflict',
      status: 409,
      detail: 'the proposal is expired',
      code: 'CONFLICT',
      reason: null,
      requiredPermission: null,
      invalidParams: null,
      retryAfter: null,
    };
    const client = new AlvaClient({ apiKey: 'key' });
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(BY_NUMBER), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(problem), {
          status: 409,
          headers: { 'content-type': 'application/problem+json' },
        })
      );
    const original = globalThis.fetch;
    globalThis.fetch = fetch;
    try {
      await expect(
        client.theses.acceptRebalanceProposal(ID, V2_PROPOSAL)
      ).rejects.toMatchObject({
        code: 'CONFLICT',
        message: 'the proposal is expired',
        status: 409,
      });
      expect(fetch).toHaveBeenCalledTimes(2);
      const [url, init] = fetch.mock.calls[1] as [string, RequestInit];
      expect(url).toMatch(
        new RegExp(
          `/api/v2/theses/${V2_THESIS}/rebalance-proposals/${V2_PROPOSAL}/accept$`
        )
      );
      expect(init.method).toBe('POST');
      expect(init.body).toBeUndefined();
      expect(init.headers).toMatchObject({ 'X-Alva-Api-Key': 'key' });
    } finally {
      globalThis.fetch = original;
    }
  });

  it('rejects bad input before any request', async () => {
    const client = stubbed();
    for (const params of [
      { first: 0 },
      { first: 101 },
      { first: 1.5 },
      { cursor: '' },
    ]) {
      await expect(
        client.theses.listRebalanceProposals(ID, params)
      ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    }
    for (const proposal of [
      '77',
      'W3',
      'thesis_0ab3c',
      'thesis_rebalance_proposal_0IL',
    ]) {
      await expect(
        client.theses.acceptRebalanceProposal(ID, proposal)
      ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    }
    await expect(
      client.theses.declineRebalanceProposal('0', V2_PROPOSAL)
    ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    expect(client._request).not.toHaveBeenCalled();
  });

  it('fails closed on malformed proposals', async () => {
    for (const bad of [
      { ...V2_PROPOSAL_BODY, state: 'UNKNOWN' },
      { ...V2_PROPOSAL_BODY, id: '77' },
      { ...V2_PROPOSAL_BODY, thesisId: 'thesis_0zz' },
      { ...V2_PROPOSAL_BODY, condition: { ...V2_CONDITION, kind: 'UNKNOWN' } },
      { ...V2_PROPOSAL_BODY, condition: { ...V2_CONDITION, threshold: 150 } },
      { ...V2_PROPOSAL_BODY, createdAt: 1795530060000 },
      {
        ...V2_PROPOSAL_BODY,
        changes: [{ ...V2_PROPOSAL_BODY.changes[0], direction: 'UNKNOWN' }],
      },
      {
        ...V2_PROPOSAL_BODY,
        changes: [{ ...V2_PROPOSAL_BODY.changes[0], weight: '1.5' }],
      },
      { ...V2_PROPOSAL_BODY, versionId: '145991' },
    ]) {
      const client = stubbed(BY_NUMBER, { items: [bad], nextPageToken: null });
      await expect(
        client.theses.listRebalanceProposals(ID)
      ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    }
  });
});

describe('rebalance Updates on Thesis reads', () => {
  const REBALANCE = {
    proposal_id: '77',
    condition: CONDITION,
    decided_by: 'yolo',
    reasoning: 'NVDA closed at 149.6, under the 150 level (W3).',
    importance: 'major',
    changes: CHANGES,
  };
  const version = (extra: Record<string, unknown>) => ({
    id: ID,
    author_version_id: '145991',
    material_version_id: '145990',
    title: 'Long AMD',
    body: 'Long AMD. Buy NVDA at 150.',
    entity_ids: ['501', '502'],
    visibility: 'public',
    closed: false,
    archived: false,
    closing_note: '',
    author_kind: 'user',
    author_ref: 'alice',
    ...extra,
  });

  it('passes rebalance through on version reads and leaves it off other Updates', async () => {
    const client = stubbed(
      {
        versions: [
          version({ change_kind: 'rebalance', rebalance: REBALANCE }),
          version({ author_version_id: '145990', change_kind: 'material' }),
        ],
        next_cursor: '',
      },
      { thesis: version({ change_kind: 'rebalance', rebalance: REBALANCE }) }
    );
    const list = await client.theses.listUpdates(ID);
    expect(list.versions[0].change_kind).toBe('rebalance');
    expect(list.versions[0].rebalance).toEqual(REBALANCE);
    expect(list.versions[1].rebalance).toBeUndefined();
    const got = await client.theses.getVersion(ID, '145991');
    expect(got.thesis.rebalance).toEqual(REBALANCE);
  });

  it('fails closed on a malformed rebalance', async () => {
    const client = stubbed({
      thesis: version({
        change_kind: 'rebalance',
        rebalance: { ...REBALANCE, proposal_id: 77 },
      }),
    });
    await expect(client.theses.getVersion(ID, '145991')).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
  });
});

describe('watchpoint conditions', () => {
  const watchpoints = (items: unknown[]) => ({
    data: {
      node: {
        latestRelease: { thesisPublication: { watchpoints: items } },
      },
    },
  });

  it('reads each condition and leaves it off entries without one', async () => {
    const client = stubbed(
      watchpoints([
        {
          label: 'W3',
          text: 'NVDA pulls back to 150',
          origin: 'stated',
          condition: {
            kind: 'numeric',
            ticker: 'NVDA',
            metric: 'price',
            comparison: 'lte',
            threshold: 150,
            event: null,
            state: 'watching',
            closeReason: null,
            triggeredAtMs: null,
            observedValue: null,
            decision: null,
          },
        },
        {
          label: 'W5',
          text: 'NVIDIA returns cash',
          origin: 'inferred',
          condition: {
            kind: 'informational',
            event: 'NVIDIA announces a share buyback',
            state: 'triggered',
            triggeredAtMs: 1795530000000,
          },
        },
        {
          label: 'W6',
          text: 'AI capex peaks',
          origin: 'agent',
          condition: null,
        },
      ])
    );
    const got = await client.theses.watchpoints(ID);
    expect(client._request).toHaveBeenCalledTimes(1);
    const [, , options] = client._request.mock.calls[0];
    expect(options.body.query).toContain(
      'condition { kind ticker metric comparison threshold event state closeReason triggeredAtMs observedValue decision }'
    );
    expect(got.watchpoints).toEqual([
      {
        label: 'W3',
        text: 'NVDA pulls back to 150',
        origin: 'stated',
        condition: {
          kind: 'numeric',
          ticker: 'NVDA',
          metric: 'price',
          comparison: 'lte',
          threshold: 150,
          state: 'watching',
        },
      },
      {
        label: 'W5',
        text: 'NVIDIA returns cash',
        origin: 'inferred',
        condition: {
          kind: 'informational',
          event: 'NVIDIA announces a share buyback',
          state: 'triggered',
          triggeredAtMs: 1795530000000,
        },
      },
      { label: 'W6', text: 'AI capex peaks', origin: 'agent' },
    ]);
  });

  it('retries once without conditions when the Gateway does not know the field', async () => {
    const client = stubbed(
      {
        errors: [
          {
            message:
              'Cannot query field "condition" on type "ThesisWatchpoint".',
            extensions: { code: 'GRAPHQL_VALIDATION_FAILED' },
          },
        ],
      },
      watchpoints([{ label: 'W1', text: 'AI capex peaks', origin: 'stated' }])
    );
    await expect(client.theses.watchpoints(ID)).resolves.toEqual({
      playbookId: ID,
      watchpoints: [{ label: 'W1', text: 'AI capex peaks', origin: 'stated' }],
    });
    expect(client._request).toHaveBeenCalledTimes(2);
    const [, , retry] = client._request.mock.calls[1];
    expect(retry.body.query).not.toContain('condition');
  });

  it('does not retry other GraphQL errors and fails closed on a bad condition', async () => {
    const other = stubbed({
      errors: [
        {
          message:
            'Cannot query field "watchpoints" on type "ThesisPublication".',
          extensions: { code: 'GRAPHQL_VALIDATION_FAILED' },
        },
      ],
    });
    await expect(other.theses.watchpoints(ID)).rejects.toMatchObject({
      code: 'GRAPHQL_ERROR',
    });
    expect(other._request).toHaveBeenCalledTimes(1);
    const bad = stubbed(
      watchpoints([
        {
          label: 'W1',
          text: 'x',
          origin: 'stated',
          condition: { kind: 'numeric', state: 'fired' },
        },
      ])
    );
    await expect(bad.theses.watchpoints(ID)).rejects.toMatchObject({
      code: 'GRAPHQL_INVALID_RESPONSE',
    });
  });
});
