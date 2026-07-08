import {
  MemoryMapAssistantAdapter,
  type FeatureSample,
  type LayerSchema,
  type LayerSummary,
  type MapState,
} from "../src/index.js";

export function makeMapState(overrides: Partial<MapState> = {}): MapState {
  return {
    bounds: { west: -123, south: 37, east: -121, north: 38 },
    center: { lng: -122, lat: 37.5 },
    zoom: 9,
    bearing: 0,
    pitch: 0,
    selectedFeatureIds: [],
    ...overrides,
  };
}

export function citiesSchema(): LayerSchema {
  return {
    layerId: "cities",
    geometryType: "point",
    fields: [
      { name: "name", type: "string" },
      { name: "population", type: "number", alias: "Population" },
    ],
  };
}

export function citiesFeatures(): FeatureSample[] {
  return [
    { id: "c1", layerId: "cities", properties: { name: "Oakland", population: 440000 } },
    { id: "c2", layerId: "cities", properties: { name: "Fresno", population: 540000 } },
    { id: "c3", layerId: "cities", properties: { name: "San Jose", population: 1000000 } },
  ];
}

export interface MemoryLayerFixture {
  summary: LayerSummary;
  schema: LayerSchema;
  features: FeatureSample[];
  filter?: string;
}

export function citiesLayer(overrides: Partial<LayerSummary> = {}): MemoryLayerFixture {
  return {
    summary: {
      id: "cities",
      name: "Major US Cities",
      type: "geojson",
      visible: true,
      description: "City points",
      source: "citiesSource",
      ...overrides,
    },
    schema: citiesSchema(),
    features: citiesFeatures(),
  };
}

export function roadsLayer(overrides: Partial<LayerSummary> = {}): MemoryLayerFixture {
  return {
    summary: {
      id: "roads",
      name: "Interstate Highways",
      type: "vector",
      visible: false,
      source: "roadsSource",
      ...overrides,
    },
    schema: {
      layerId: "roads",
      geometryType: "line",
      fields: [{ name: "ref", type: "string" }],
    },
    features: [{ id: "r1", layerId: "roads", properties: { ref: "I-80" } }],
  };
}

export function makeMemoryAdapter(
  layers: MemoryLayerFixture[] = [citiesLayer(), roadsLayer()],
  mapState: MapState = makeMapState(),
): MemoryMapAssistantAdapter {
  return new MemoryMapAssistantAdapter({ mapState, layers });
}
