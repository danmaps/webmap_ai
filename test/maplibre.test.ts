import { describe, expect, it } from "vitest";

import { MapLibreMapAssistantAdapter } from "../src/index.js";

class MockBounds {
  getWest() {
    return -123;
  }

  getSouth() {
    return 37;
  }

  getEast() {
    return -121;
  }

  getNorth() {
    return 38;
  }
}

class MockMap {
  flyToCalls: unknown[] = [];
  fitBoundsCalls: unknown[] = [];
  setFeatureStateCalls: unknown[] = [];
  removeFeatureStateCalls: unknown[] = [];
  setLayoutPropertyCalls: unknown[] = [];
  setFilterCalls: unknown[] = [];
  querySourceFeaturesCalls: unknown[] = [];
  renderedFeaturesByLayerId: Record<string, unknown[]> = {
    cities: [{ id: 1, layer: { id: "cities" }, properties: { name: "Oakland" } }],
    empty: [],
  };
  sourceFeaturesBySourceId: Record<string, unknown[]> = {
    citiesSource: [{ id: "city-1", properties: { name: "Oakland" } }],
    roadsSource: [
      { id: 5, properties: { class: "primary", lanes: 2 } },
      { id: 6, properties: { class: "secondary", lanes: 1 } },
    ],
    emptySource: [],
  };
  style = {
    sources: {
      citiesSource: {
        type: "geojson",
        metadata: {
          schema: {
            geometryType: "Point",
            fields: [
              { name: "name", type: "string" },
              { name: "population", type: "number", alias: "Population" },
            ],
          },
        },
      },
      roadsSource: {
        type: "vector",
        vector_layers: [
          {
            id: "roads_layer",
            fields: {
              class: "String",
              lanes: "Number",
            },
            geometry_type: "LineString",
          },
        ],
      },
      emptySource: {
        type: "geojson",
      },
    },
    layers: [
      {
        id: "cities",
        type: "circle",
        source: "citiesSource",
        layout: { visibility: "visible" },
        metadata: { name: "Cities", description: "City points" },
      },
      {
        id: "roads",
        type: "line",
        source: "roadsSource",
        "source-layer": "roads_layer",
        layout: { visibility: "none" },
      },
      {
        id: "empty",
        type: "fill",
        source: "emptySource",
        layout: { visibility: "visible" },
      },
      {
        id: "background",
        type: "background",
        layout: { visibility: "visible" },
      },
    ],
  };

  getBounds() {
    return new MockBounds();
  }

  getCenter() {
    return { lng: -122, lat: 37.5 };
  }

  getZoom() {
    return 9;
  }

  getBearing() {
    return 15;
  }

  getPitch() {
    return 30;
  }

  getStyle() {
    return this.style;
  }

  queryRenderedFeatures(_geometry: unknown, options: { layers?: string[] } = {}) {
    const [layerId] = options.layers ?? [];
    return this.renderedFeaturesByLayerId[layerId as string] ?? [];
  }

  querySourceFeatures(sourceId: string, parameters: Record<string, unknown> = {}) {
    this.querySourceFeaturesCalls.push({ sourceId, parameters });
    return this.sourceFeaturesBySourceId[sourceId] ?? [];
  }

  flyTo(options: unknown) {
    this.flyToCalls.push(options);
  }

  fitBounds(bounds: unknown, options: Record<string, unknown> = {}) {
    this.fitBoundsCalls.push({ bounds, options });
  }

  setFeatureState(feature: unknown, state: unknown) {
    this.setFeatureStateCalls.push({ feature, state });
  }

  removeFeatureState(feature: unknown, key: unknown) {
    this.removeFeatureStateCalls.push({ feature, key });
  }

  setLayoutProperty(layerId: string, name: string, value: unknown) {
    this.setLayoutPropertyCalls.push({ layerId, name, value });
  }

  setFilter(layerId: string, filter: unknown) {
    this.setFilterCalls.push({ layerId, filter });
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asMap = (map: MockMap): any => map;

describe("MapLibreMapAssistantAdapter", () => {
  it("getMapState and listLayers reflect the live map", async () => {
    const adapter = new MapLibreMapAssistantAdapter(asMap(new MockMap()));

    expect(await adapter.getMapState()).toEqual({
      bounds: { west: -123, south: 37, east: -121, north: 38 },
      center: { lng: -122, lat: 37.5 },
      zoom: 9,
      bearing: 15,
      pitch: 30,
      selectedFeatureIds: [],
    });

    expect(await adapter.listLayers()).toEqual([
      {
        id: "cities",
        name: "Cities",
        type: "geojson",
        visible: true,
        description: "City points",
        source: "citiesSource",
      },
      {
        id: "roads",
        name: "roads",
        type: "vector",
        visible: false,
        source: "roadsSource",
      },
      {
        id: "empty",
        name: "empty",
        type: "geojson",
        visible: true,
        source: "emptySource",
      },
      {
        id: "background",
        name: "background",
        type: "custom",
        visible: true,
      },
    ]);
  });

  it("getLayerSchema reads source-backed metadata and vector layer fields", async () => {
    const adapter = new MapLibreMapAssistantAdapter(asMap(new MockMap()));

    expect(await adapter.getLayerSchema("cities")).toEqual({
      layerId: "cities",
      geometryType: "point",
      fields: [
        { name: "name", type: "string" },
        { name: "population", type: "number", alias: "Population" },
      ],
    });

    expect(await adapter.getLayerSchema("roads")).toEqual({
      layerId: "roads",
      geometryType: "line",
      fields: [
        { name: "class", type: "string" },
        { name: "lanes", type: "number" },
      ],
    });
  });

  it("getLayerSchema rejects unknown layers and missing schema metadata", async () => {
    const adapter = new MapLibreMapAssistantAdapter(asMap(new MockMap()));

    await expect(adapter.getLayerSchema("missing")).rejects.toThrow(/Unknown layer: missing/);
    await expect(adapter.getLayerSchema("empty")).rejects.toThrow(/does not expose schema details/);
  });

  it("queryVisibleFeatures and queryFeatures return normalized feature samples", async () => {
    const map = new MockMap();
    const adapter = new MapLibreMapAssistantAdapter(asMap(map));

    expect(await adapter.queryVisibleFeatures({ layerId: "cities", limit: 1 })).toEqual([
      {
        id: "1",
        layerId: "cities",
        properties: { name: "Oakland" },
        geometry: undefined,
      },
    ]);

    expect(await adapter.queryVisibleFeatures({ layerId: "empty" })).toEqual([]);

    expect(
      await adapter.queryFeatures({ layerId: "roads", where: "id IN ('5', '6')", limit: 1 }),
    ).toEqual([
      { id: "5", layerId: "roads", properties: { class: "primary", lanes: 2 }, geometry: undefined },
    ]);

    expect(map.querySourceFeaturesCalls.at(-1)).toEqual({
      sourceId: "roadsSource",
      parameters: {
        sourceLayer: "roads_layer",
        filter: ["in", ["id"], ["literal", ["5", "6"]]],
      },
    });
  });

  it("queryVisibleFeatures rejects hidden and unknown layers", async () => {
    const adapter = new MapLibreMapAssistantAdapter(asMap(new MockMap()));

    await expect(adapter.queryVisibleFeatures({ layerId: "roads" })).rejects.toThrow(
      /Layer is not visible: roads/,
    );
    await expect(adapter.queryVisibleFeatures({ layerId: "missing" })).rejects.toThrow(
      /Unknown layer: missing/,
    );
  });

  it("setView chooses flyTo or fitBounds depending on arguments", async () => {
    const map = new MockMap();
    const adapter = new MapLibreMapAssistantAdapter(asMap(map));

    await adapter.setView({ center: { lng: -120, lat: 36 }, zoom: 7, bearing: 5, pitch: 10 });
    await adapter.setView({
      bounds: { west: -125, south: 35, east: -120, north: 40 },
      zoom: 8,
      bearing: 12,
      pitch: 20,
    });

    expect(map.flyToCalls).toEqual([{ center: [-120, 36], zoom: 7, bearing: 5, pitch: 10 }]);
    expect(map.fitBoundsCalls).toEqual([
      {
        bounds: [
          [-125, 35],
          [-120, 40],
        ],
        options: { maxZoom: 8, bearing: 12, pitch: 20 },
      },
    ]);
  });

  it("selectFeatures, clearSelection, setLayerVisibility, and setFilter mutate map state through MapLibre APIs", async () => {
    const map = new MockMap();
    const adapter = new MapLibreMapAssistantAdapter(asMap(map));

    await adapter.selectFeatures({ layerId: "cities", featureIds: ["city-1", "city-1", "city-2"] });

    expect(map.setFeatureStateCalls).toEqual([
      { feature: { source: "citiesSource", id: "city-1" }, state: { selected: true } },
      { feature: { source: "citiesSource", id: "city-2" }, state: { selected: true } },
    ]);
    expect((await adapter.getMapState()).selectedFeatureIds).toEqual(["city-1", "city-2"]);

    await adapter.clearSelection();

    expect(map.removeFeatureStateCalls).toEqual([
      { feature: { source: "citiesSource", id: "city-1" }, key: "selected" },
      { feature: { source: "citiesSource", id: "city-2" }, key: "selected" },
    ]);
    expect((await adapter.getMapState()).selectedFeatureIds).toEqual([]);

    await adapter.setLayerVisibility("cities", false);
    await adapter.setFilter({ layerId: "cities", where: "name = 'Oakland'" });

    expect(map.setLayoutPropertyCalls).toEqual([
      { layerId: "cities", name: "visibility", value: "none" },
    ]);
    expect(map.setFilterCalls).toEqual([
      { layerId: "cities", filter: ["==", ["get", "name"], "Oakland"] },
    ]);
  });

  it("setFilter rejects unsupported where clauses", async () => {
    const adapter = new MapLibreMapAssistantAdapter(asMap(new MockMap()));

    await expect(
      adapter.setFilter({ layerId: "cities", where: "population > 1000" }),
    ).rejects.toThrow(/Unsupported where clause/);
  });
});
