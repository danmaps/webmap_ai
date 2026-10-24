import { MemoryMapAssistantAdapter } from "./memory.js";
import type { FeatureSample, LayerSchema, LayerSummary, MapState, SummarizeFeaturesArgs, SummaryResult } from "../types.js";

export interface LocalSummaryLayer {
  summary: LayerSummary;
  schema: LayerSchema;
  features: FeatureSample[];
  /** Optional provider-local read, e.g. a synthetic loaded-tile snapshot. */
  readFeatures?: (state: MapState) => Promise<FeatureSample[]>;
}

/** Reference implementation only. Completeness is authored, never inferred from row count. */
export class LocalSummaryMapAssistantAdapter extends MemoryMapAssistantAdapter {
  private readonly datasets: Map<string, LocalSummaryLayer>;

  public constructor(args: { mapState: MapState; layers: LocalSummaryLayer[] }) {
    super(args);
    this.datasets = new Map(args.layers.map((layer) => [layer.summary.id, layer]));
  }

  public async summarizeFeatures(args: SummarizeFeaturesArgs): Promise<SummaryResult> {
    const state = await this.getMapState();
    const layer = this.datasets.get(args.layerId);
    const rules = layer?.schema.summary;
    const result: SummaryResult = {
      status: "unavailable", scope: rules?.scope ?? "unknown", completeness: "unknown",
      groups: [], matchedFeatures: 0, counted: 0, warnings: [],
      receipt: {
        adapter: "local-summary", source: args.layerId, executedAt: new Date().toISOString(),
        operation: "capability_check", method: `${args.countBy} count; attribute grouping; reject conflicts; no SQL executed`,
        args, inputFeatures: 0, uniqueFeatures: 0, viewport: state.bounds,
      },
    };
    if (!layer || !rules || !rules.operations.includes("count")) {
      result.warnings.push("No declared local count capability for this layer.");
      return result;
    }
    if (args.groupBy !== rules.groupField || (args.filter && args.filter.field !== rules.statusField)) {
      result.warnings.push("Only the declared grouping field and status equality filter are supported.");
      return result;
    }
    const rows = layer.readFeatures ? await layer.readFeatures(state) : layer.features;
    result.receipt.operation = "local read → stable feature ID deduplication → entity consistency check → mapped status equality → grouped count";
    result.receipt.inputFeatures = rows.length;
    const unique = new Map<string, FeatureSample>();
    const fail = (warning: string): SummaryResult => {
      result.status = "ambiguous";
      result.warnings.push(warning);
      return result;
    };
    const signature = (row: FeatureSample) => JSON.stringify([
      row.properties[rules.entityKey], row.properties[rules.groupField], row.properties[rules.statusField],
    ]);
    for (const row of rows) {
      if (!row.id || row.layerId !== args.layerId) return fail("Missing stable feature identity or mismatched layer.");
      const prior = unique.get(row.id);
      if (prior && signature(prior) !== signature(row)) return fail("Conflicting records share a feature ID.");
      unique.set(row.id, row);
    }
    result.receipt.uniqueFeatures = unique.size;
    const normalize = (value: unknown): unknown => typeof value === "string" &&
      Object.prototype.hasOwnProperty.call(rules.statusMapping, value) ? rules.statusMapping[value] : value;
    const entities = new Map<string, { group: string; status: unknown }>();
    const groups = new Map<string, number>();
    for (const row of unique.values()) {
      const entity = row.properties[rules.entityKey];
      const group = row.properties[rules.groupField];
      const status = normalize(row.properties[rules.statusField]);
      // Validate before filtering so contradictory segments cannot disappear behind a filter.
      if (typeof entity !== "string" || !entity.trim() || typeof group !== "string" || !group.trim() || typeof status !== "string") {
        return fail("Missing entity, district, or status; nulls cannot silently disappear from totals.");
      }
      const prior = entities.get(entity);
      if (prior && (prior.group !== group || prior.status !== status)) return fail("Segments disagree on an entity's district or normalized status.");
      entities.set(entity, { group, status });
    }
    for (const row of unique.values()) {
      if (!args.filter || normalize(row.properties[rules.statusField]) === normalize(args.filter.value)) result.matchedFeatures++;
    }
    if (args.countBy === "entity") {
      for (const { group, status } of entities.values()) {
        if (!args.filter || status === normalize(args.filter.value)) groups.set(group, (groups.get(group) ?? 0) + 1);
      }
    } else {
      for (const row of unique.values()) {
        if (!args.filter || normalize(row.properties[rules.statusField]) === normalize(args.filter.value)) {
          const group = row.properties[rules.groupField] as string;
          groups.set(group, (groups.get(group) ?? 0) + 1);
        }
      }
    }
    if (rules.scope !== "authoritative_dataset") {
      // Refuse totals: entities can have unseen segments or district conflicts in other tiles.
      result.status = "incomplete";
      result.completeness = "partial";
      result.warnings.push("Loaded tiles only. A complete answer is unavailable; no district totals are returned.");
      return result;
    }
    result.status = "complete";
    result.completeness = "complete";
    result.groups = [...groups].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([group, count]) => ({ group, count }));
    result.counted = result.groups.reduce((total, group) => total + group.count, 0);
    return result;
  }
}
