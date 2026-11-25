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
const PROPOSAL = {
  id: '77',
  state: 'waiting',
  condition: CONDITION,
  changes: CHANGES,
  reasoning: 'NVDA closed at 149.6, under the 150 level (W3).',
  importance: 'major',
  confident: true,
  mode: 'manual',
  created_at_ms: 1795530060000,
  delivered_at_ms: 1795530120000,
  expires_at_ms: 1795616520000,
};

describe('Thesis decision mode', () => {
  it('reads and writes the mode over REST', async () => {
    const client = stubbed(
      { thesis_id: ID, decision_mode: 'manual' },
      { thesis_id: ID, decision_mode: 'yolo' }
    );
    await expect(client.theses.getDecisionMode(ID)).resolves.toEqual({
      thesis_id: ID,
      decision_mode: 'manual',
    });
    expect(client._request).toHaveBeenLastCalledWith(
      'GET',
      `/api/v1/theses/${ID}/decision-mode`
    );
    await expect(client.theses.setDecisionMode(ID, 'yolo')).resolves.toEqual({
      thesis_id: ID,
      decision_mode: 'yolo',
    });
    expect(client._request).toHaveBeenLastCalledWith(
      'PUT',
      `/api/v1/theses/${ID}/decision-mode`,
      { body: { decision_mode: 'yolo' } }
    );
  });

  it('rejects bad input before any request and odd responses after', async () => {
    const client = stubbed(
      { thesis_id: ID, decision_mode: 'reckless' },
      { thesis_id: '1', decision_mode: 'manual' }
    );
    await expect(
      client.theses.setDecisionMode(ID, 'reckless' as never)
    ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    await expect(client.theses.getDecisionMode('x')).rejects.toMatchObject({
      code: 'INVALID_ARGUMENT',
    });
    expect(client._request).not.toHaveBeenCalled();
    for (let i = 0; i < 2; i++) {
      await expect(client.theses.getDecisionMode(ID)).rejects.toMatchObject({
        code: 'INVALID_RESPONSE',
      });
    }
  });

  it("passes the gateway's refusal through", async () => {
    const client = stubbed(
      new AlvaError('PERMISSION_DENIED', 'only the author', 403)
    );
    await expect(client.theses.getDecisionMode(ID)).rejects.toMatchObject({
      code: 'PERMISSION_DENIED',
      status: 403,
    });
  });
});

describe('Thesis rebalance proposals', () => {
  it('lists one page newest first with its cursor', async () => {
    const client = stubbed(
      { proposals: [PROPOSAL], next_cursor: 'c2' },
      { proposals: [], next_cursor: '' }
    );
    await expect(client.theses.listRebalanceProposals(ID)).resolves.toEqual({
      proposals: [PROPOSAL],
      next_cursor: 'c2',
    });
    expect(client._request).toHaveBeenLastCalledWith(
      'GET',
      `/api/v1/theses/${ID}/rebalance-proposals`,
      { query: { first: 20 } }
    );
    await client.theses.listRebalanceProposals(ID, {
      first: 100,
      cursor: 'c2',
    });
    expect(client._request).toHaveBeenLastCalledWith(
      'GET',
      `/api/v1/theses/${ID}/rebalance-proposals`,
      { query: { first: 100, cursor: 'c2' } }
    );
  });

  it('accepts and declines with no body and checks the proposal returned', async () => {
    const client = stubbed(
      { proposal: { ...PROPOSAL, state: 'accepted', version_id: '145991' } },
      { proposal: { ...PROPOSAL, state: 'declined' } },
      { proposal: { ...PROPOSAL, id: '78' } }
    );
    await expect(
      client.theses.acceptRebalanceProposal(ID, '77')
    ).resolves.toMatchObject({
      proposal: { id: '77', state: 'accepted', version_id: '145991' },
    });
    expect(client._request).toHaveBeenLastCalledWith(
      'POST',
      `/api/v1/theses/${ID}/rebalance-proposals/77/accept`
    );
    await expect(
      client.theses.declineRebalanceProposal(ID, '77')
    ).resolves.toMatchObject({ proposal: { state: 'declined' } });
    expect(client._request).toHaveBeenLastCalledWith(
      'POST',
      `/api/v1/theses/${ID}/rebalance-proposals/77/decline`
    );
    await expect(
      client.theses.acceptRebalanceProposal(ID, '77')
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('surfaces a refused answer with the state the server names', async () => {
    const client = stubbed(
      new AlvaError('FAILED_PRECONDITION', 'rebalance proposal is expired', 400)
    );
    await expect(
      client.theses.acceptRebalanceProposal(ID, '77')
    ).rejects.toMatchObject({
      code: 'FAILED_PRECONDITION',
      message: 'rebalance proposal is expired',
    });
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
    await expect(
      client.theses.acceptRebalanceProposal(ID, 'W3')
    ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    await expect(
      client.theses.declineRebalanceProposal('0', '77')
    ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    expect(client._request).not.toHaveBeenCalled();
  });

  it('fails closed on malformed proposals', async () => {
    for (const bad of [
      { ...PROPOSAL, state: 'pending' },
      { ...PROPOSAL, id: 77 },
      { ...PROPOSAL, condition: { ...CONDITION, kind: 'script' } },
      {
        ...PROPOSAL,
        changes: [{ ...CHANGES[0], direction: 'bullish' }],
      },
      { ...PROPOSAL, changes: [{ ...CHANGES[0], weight: 1.5 }] },
    ]) {
      const client = stubbed({ proposals: [bad], next_cursor: '' });
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
