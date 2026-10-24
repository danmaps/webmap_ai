import { describe, expect, it, vi } from 'vitest';
import {
  LocalSummaryMapAssistantAdapter, MapAssistantRouter, buildAssistantContext,
  parseToolCall, runSummaryConversation, type SummaryProvider, type SummaryResult,
} from '../src/index.js';
// Shared plain-JS fixture is also consumed by the built, offline example.
// @ts-expect-error Example fixture intentionally has no TypeScript build dependency.
import { EXPECTED, STATE, OTHER_VIEW, SUMMARY_ARGS, PROMPT, projectLayer, mockProvider } from '../examples/active-projects/fixture.mjs';
import { makeMemoryAdapter } from './fixtures.js';

function setup(scope = 'authoritative_dataset', mutate = (_layer: ReturnType<typeof projectLayer>) => {}) {
  const layer = projectLayer(scope);
  mutate(layer);
  const adapter = new LocalSummaryMapAssistantAdapter({ mapState: structuredClone(STATE), layers: [layer] });
  return { layer, adapter, router: new MapAssistantRouter(adapter) };
}
async function summarize(router: MapAssistantRouter, args = SUMMARY_ARGS) {
  const response = await router.run({ message: PROMPT, toolCalls: [{ name: 'summarize_features', args }] });
  return response.toolResults[0]!;
}

describe('active projects integration proof (#33)', () => {
  it('counts all 81 active segments as 27 entities, independent of the capped query and viewport', async () => {
    const { adapter, router } = setup();
    expect((await adapter.queryFeatures({ layerId: 'projects' })).length).toBe(50);
    const before = (await summarize(router)).data as SummaryResult;
    expect(before).toMatchObject({ status: 'complete', completeness: 'complete', groups: EXPECTED,
      counted: 27, matchedFeatures: 81, receipt: { inputFeatures: 94, uniqueFeatures: 90 } });
    await adapter.setView(OTHER_VIEW);
    const after = (await summarize(router)).data as SummaryResult;
    expect(after.groups).toEqual(EXPECTED);
    expect(after.receipt.viewport).not.toEqual(before.receipt.viewport);
    const features = (await summarize(router, { ...SUMMARY_ARGS, countBy: 'feature' })).data as SummaryResult;
    expect(features.groups).toEqual([{ group: 'North', count: 36 }, { group: 'South', count: 27 }, { group: 'West', count: 18 }]);
  });

  it('refuses loaded-tile totals before and after viewport movement, even on an empty snapshot', async () => {
    const { adapter, router, layer } = setup('loaded_tiles');
    const before = (await summarize(router)).data as SummaryResult;
    expect(before).toMatchObject({ status: 'incomplete', scope: 'loaded_tiles', completeness: 'partial', groups: [], counted: 0 });
    await adapter.setView(OTHER_VIEW);
    const after = (await summarize(router)).data as SummaryResult;
    expect(after.status).toBe('incomplete');
    expect(after.groups).toEqual([]);
    expect(after.receipt.inputFeatures).not.toBe(before.receipt.inputFeatures);
    layer.readFeatures = async () => [];
    expect((await summarize(router)).data).toMatchObject({ status: 'incomplete', completeness: 'partial' });
  });

  it('keeps empty success, unavailable, ambiguous, and execution failure distinct with evidence', async () => {
    const { router } = setup();
    const empty = await summarize(router, { ...SUMMARY_ARGS, filter: { field: 'status', value: 'Cancelled' } });
    expect(empty).toMatchObject({ ok: true, data: { status: 'complete', counted: 0, groups: [] } });
    const missing = await summarize(router, { ...SUMMARY_ARGS, layerId: 'missing' });
    expect(missing).toMatchObject({ ok: true, data: { status: 'unavailable', completeness: 'unknown' } });
    const { router: conflict } = setup('authoritative_dataset', (layer) => { layer.features[1].properties.district = 'West'; });
    expect(await summarize(conflict)).toMatchObject({ ok: true, data: { status: 'ambiguous', groups: [] } });
    const { router: broken } = setup('authoritative_dataset', (layer) => { layer.readFeatures = async () => { throw new Error('Synthetic read failure'); }; });
    expect(await summarize(broken)).toMatchObject({ ok: false, error: 'Synthetic read failure', execution: { outcome: 'failed' } });
    expect(empty).toHaveProperty('execution.executedAt');
    expect(empty).toHaveProperty('data.receipt.operation');
    const unsupported = new MapAssistantRouter(makeMemoryAdapter());
    expect(await summarize(unsupported)).toMatchObject({ ok: true, data: { status: 'unavailable' }, execution: { operation: 'capability_check' } });
  });

  it.each(['district', 'project_id', 'status', 'id', 'duplicate'])('rejects ambiguous %s identities and values', async (field) => {
    const { router } = setup('authoritative_dataset', (layer) => {
      if (field === 'id') layer.features[0].id = '';
      else if (field === 'duplicate') layer.features.at(-1).properties.district = 'West';
      else layer.features[1].properties[field] = field === 'status' ? 'Inactive' : null;
    });
    expect((await summarize(router)).data).toMatchObject({ status: 'ambiguous', groups: [] });
  });

  it('rejects district conflicts before a status filter can conceal them', async () => {
    const { router } = setup('authoritative_dataset', (layer) => {
      layer.features[1].properties.status = 'Inactive';
      layer.features[1].properties.district = 'West';
    });
    expect((await summarize(router)).data).toMatchObject({ status: 'ambiguous', groups: [] });
  });

  it('normalizes only explicitly configured values; metadata survives without feature payloads', async () => {
    const { adapter, router } = setup('authoritative_dataset', (layer) => { layer.schema.summary.statusMapping = {}; });
    // Without the mapping Active and ACTIVE disagree within each entity.
    expect((await summarize(router)).data).toMatchObject({ status: 'ambiguous' });
    const context = await buildAssistantContext(adapter);
    expect(context.layers[0]).toMatchObject({ description: expect.stringContaining('project segment'), summary: { entityKey: 'project_id' } });
    expect(JSON.stringify(context)).not.toContain('internal_note');
    expect(JSON.stringify(context)).not.toContain('North-1');
  });

  it('does not accept sample limits, arbitrary filters, undeclared grouping, or invalid modes', async () => {
    for (const args of [{ ...SUMMARY_ARGS, limit: 50 }, { ...SUMMARY_ARGS, countBy: 'guessed' },
      { ...SUMMARY_ARGS, filter: { field: 'status', value: 42 } }]) {
      expect(parseToolCall('summarize_features', args)).toBeNull();
    }
    const { router } = setup();
    expect((await summarize(router, { ...SUMMARY_ARGS, groupBy: 'internal_note' })).data).toMatchObject({ status: 'unavailable' });
    expect((await summarize(router, { ...SUMMARY_ARGS, filter: { field: 'internal_note', value: 'x' } })).data).toMatchObject({ status: 'unavailable' });
  });

  it('runs schema → summary → final answer, preserving IDs and inspectable evidence', async () => {
    const { router } = setup();
    const provider = vi.fn(mockProvider);
    const answer = await runSummaryConversation(router, provider, PROMPT);
    expect(provider).toHaveBeenCalledTimes(3);
    expect(answer.text).toContain('North: 12; South: 9; West: 6');
    expect(answer.text).toContain('[Evidence 2](#receipt-2)');
    expect(answer.text).not.toContain('Unverified');
    expect(answer.evidence.map((item) => item.id)).toEqual(['schema', 'summary']);
    const finalRequest = provider.mock.calls[2]![0];
    expect(finalRequest.history[1].feedback[0].result.data.receipt.method).toContain('no SQL');
    expect(JSON.stringify(finalRequest)).not.toContain('internal_note');
    expect(JSON.stringify(finalRequest)).not.toContain('geometry');
  });

  it('overrides unsupported authoritative prose after incomplete, ambiguous, unavailable, and failed execution', async () => {
    for (const mode of ['loaded_tiles', 'ambiguous', 'unavailable', 'failure']) {
      const { router } = setup(mode === 'loaded_tiles' ? mode : 'authoritative_dataset', (layer) => {
        if (mode === 'ambiguous') layer.features[1].properties.district = 'West';
        if (mode === 'unavailable') delete layer.schema.summary;
        if (mode === 'failure') layer.readFeatures = async () => { throw new Error('Synthetic failure'); };
      });
      const provider: SummaryProvider = async (state) => state.history.length
        ? { text: 'There are definitely 999 active projects.' }
        : { calls: [{ id: 'count', name: 'summarize_features', args: SUMMARY_ARGS }] };
      const answer = await runSummaryConversation(router, provider, PROMPT);
      expect(answer.text).not.toContain('999');
      expect(answer.text).toContain('Evidence 1');
    }
  });

  it('aligns invalid calls and does not re-execute a repeated call ID', async () => {
    const { router, adapter } = setup();
    const spy = vi.spyOn(adapter, 'summarizeFeatures');
    const provider: SummaryProvider = async (state) => state.history.length >= 2 ? { text: 'Done.' } : {
      calls: [{ id: 'bad', name: 'set_view', args: {} }, { id: 'same', name: 'summarize_features', args: SUMMARY_ARGS }],
    };
    const result = await runSummaryConversation(router, provider, PROMPT);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(result.evidence.map(({ id, result }) => [id, result.ok])).toEqual([['bad', false], ['same', true], ['bad', false], ['same', true]]);
  });

  it('terminates on round exhaustion, ungrounded answers, provider errors, and payload limits', async () => {
    const { router } = setup();
    await expect(runSummaryConversation(router, async () => ({ calls: [{ id: 'again', name: 'get_layer_schema', args: { layerId: 'projects' } }] }), PROMPT)).rejects.toThrow('round limit');
    await expect(runSummaryConversation(router, async () => ({ text: '27' }), PROMPT)).rejects.toThrow('No grounded');
    await expect(runSummaryConversation(router, async () => { throw new Error('Provider unavailable'); }, PROMPT)).rejects.toThrow('Provider unavailable');
    const { router: large } = setup('authoritative_dataset', (layer) => { layer.schema.summary.recordMeaning = 'x'.repeat(33_000); });
    const provider = vi.fn(mockProvider);
    await expect(runSummaryConversation(large, provider, PROMPT)).rejects.toThrow('feedback limit');
    expect(provider).toHaveBeenCalledTimes(1);
  });
});
