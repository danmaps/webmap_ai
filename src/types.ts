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
}

export interface FeatureSample {
  id: string;
  layerId: string;
  properties: Record<string, unknown>;
  geometry?: GeoJSON.Geometry;
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
