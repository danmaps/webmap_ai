import type { MapAssistantAdapter } from "../adapter.js";
import type {
  FeatureSample,
  LayerSchema,
  LayerSummary,
  MapState,
  QueryFeaturesArgs,
  QueryVisibleFeaturesArgs,
  SelectFeaturesArgs,
  SetFilterArgs,
  SetViewArgs,
} from "../types.js";

interface MemoryLayer {
  summary: LayerSummary;
  schema: LayerSchema;
  features: FeatureSample[];
  filter?: string;
}

export class MemoryMapAssistantAdapter implements MapAssistantAdapter {
  private readonly layerById = new Map<string, MemoryLayer>();
  private state: MapState;

  public constructor(args: { mapState: MapState; layers: MemoryLayer[] }) {
    this.state = args.mapState;

    for (const layer of args.layers) {
      this.layerById.set(layer.summary.id, layer);
    }
  }

  public async getMapState(): Promise<MapState> {
    return this.state;
  }

  public async listLayers(): Promise<LayerSummary[]> {
    return Array.from(this.layerById.values()).map((layer) => layer.summary);
  }

  public async getLayerSchema(layerId: string): Promise<LayerSchema> {
    return this.requireLayer(layerId).schema;
  }

  public async queryVisibleFeatures(args: QueryVisibleFeaturesArgs): Promise<FeatureSample[]> {
    const layer = this.requireVisibleLayer(args.layerId);
    return layer.features.slice(0, args.limit ?? 50);
  }

  public async queryFeatures(args: QueryFeaturesArgs): Promise<FeatureSample[]> {
    const layer = this.requireLayer(args.layerId);

    if (args.where && !this.supportsWhereFilter(args.where)) {
      throw new Error("Memory adapter supports only empty or `id IN (...)` where clauses.");
    }

    const filtered = args.where ? this.filterByIdInClause(layer.features, args.where) : layer.features;
    return filtered.slice(0, args.limit ?? 50);
  }

  public async setView(args: SetViewArgs): Promise<void> {
    this.state = {
      ...this.state,
      ...args,
      center: args.center ?? this.state.center,
      bounds: args.bounds ?? this.state.bounds,
      selectedFeatureIds: this.state.selectedFeatureIds,
    };
  }

  public async selectFeatures(args: SelectFeaturesArgs): Promise<void> {
    this.requireLayer(args.layerId);
    this.state = { ...this.state, selectedFeatureIds: [...args.featureIds] };
  }

  public async clearSelection(): Promise<void> {
    this.state = { ...this.state, selectedFeatureIds: [] };
  }

  public async setLayerVisibility(layerId: string, visible: boolean): Promise<void> {
    const layer = this.requireLayer(layerId);
    layer.summary.visible = visible;
  }

  public async setFilter(args: SetFilterArgs): Promise<void> {
    const layer = this.requireLayer(args.layerId);
    layer.filter = args.where;
  }

  private requireLayer(layerId: string): MemoryLayer {
    const layer = this.layerById.get(layerId);

    if (!layer) {
      throw new Error(`Unknown layer: ${layerId}`);
    }

    return layer;
  }

  private requireVisibleLayer(layerId: string): MemoryLayer {
    const layer = this.requireLayer(layerId);

    if (!layer.summary.visible) {
      throw new Error(`Layer is not visible: ${layerId}`);
    }

    return layer;
  }

  private supportsWhereFilter(where: string): boolean {
    return /^\s*id\s+IN\s*\(.+\)\s*$/i.test(where);
  }

  private filterByIdInClause(features: FeatureSample[], where: string): FeatureSample[] {
    const match = where.match(/^\s*id\s+IN\s*\((.+)\)\s*$/i);

    if (!match) {
      return features;
    }

    const rawIds = match[1] ?? "";
    const ids = new Set(
      rawIds
        .split(",")
        .map((entry) => entry.trim().replace(/^['"]|['"]$/g, ""))
        .filter(Boolean),
    );

    return features.filter((feature) => ids.has(feature.id));
  }
}
