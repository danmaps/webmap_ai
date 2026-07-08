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
} from "./types.js";

export interface MapAssistantAdapter {
  getMapState(): Promise<MapState>;
  listLayers(): Promise<LayerSummary[]>;
  getLayerSchema(layerId: string): Promise<LayerSchema>;
  queryVisibleFeatures(args: QueryVisibleFeaturesArgs): Promise<FeatureSample[]>;
  queryFeatures(args: QueryFeaturesArgs): Promise<FeatureSample[]>;
  setView(args: SetViewArgs): Promise<void>;
  selectFeatures(args: SelectFeaturesArgs): Promise<void>;
  clearSelection(): Promise<void>;
  setLayerVisibility(layerId: string, visible: boolean): Promise<void>;
  setFilter(args: SetFilterArgs): Promise<void>;
}
