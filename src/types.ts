export type LayerType = "vector" | "raster" | "geojson" | "tile" | "custom";

export interface MapBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface MapCenter {
  lng: number;
  lat: number;
}

export interface MapState {
  bounds: MapBounds;
  center: MapCenter;
  zoom: number;
  bearing?: number;
  pitch?: number;
  selectedFeatureIds: string[];
}

export interface LayerFieldSummary {
  name: string;
  type: "string" | "number" | "boolean" | "date" | "geometry" | "unknown";
  alias?: string;
}

export interface LayerSummary {
  id: string;
  name: string;
  type: LayerType;
  visible: boolean;
  description?: string;
  source?: string;
}

export interface LayerSchema {
  layerId: string;
  geometryType?: "point" | "line" | "polygon" | "raster";
  fields: LayerFieldSummary[];
  /** Authored rules, never inferred from field names or descriptive prose. */
  summary?: SummarySemantics;
}

export type SummaryScope = "authoritative_dataset" | "loaded_tiles";

export interface SummarySemantics {
  recordMeaning: string;
  entityKey: string;
  groupField: string;
  statusField: string;
  statusMapping: Record<string, string>;
  scope: SummaryScope;
  operations: ["count"];
}

export interface SummarizeFeaturesArgs {
  layerId: string;
  groupBy: string;
  countBy: "entity" | "feature";
  filter?: { field: string; value: string };
}

export interface SummaryResult {
  status: "complete" | "incomplete" | "unavailable" | "ambiguous";
  scope: SummaryScope | "unknown";
  completeness: "complete" | "partial" | "unknown";
  groups: Array<{ group: string; count: number }>;
  matchedFeatures: number;
  counted: number;
  warnings: string[];
  receipt: {
    adapter: string;
    source: string;
    executedAt: string;
    operation: string;
    method: string;
    args: SummarizeFeaturesArgs;
    inputFeatures: number;
    uniqueFeatures: number;
    viewport: MapBounds;
  };
}

export interface FeatureSample {
  id: string;
  layerId: string;
  properties: Record<string, unknown>;
  geometry?: unknown;
}

export interface QueryVisibleFeaturesArgs {
  layerId: string;
  limit?: number;
}

export interface QueryFeaturesArgs {
  layerId: string;
  where?: string;
  limit?: number;
}

export interface SetViewArgs {
  bounds?: MapBounds;
  center?: MapCenter;
  zoom?: number;
  bearing?: number;
  pitch?: number;
}

export interface SelectFeaturesArgs {
  layerId: string;
  featureIds: string[];
}

export interface SetFilterArgs {
  layerId: string;
  where: string;
}
