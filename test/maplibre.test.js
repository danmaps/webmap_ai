import test from "node:test";
import assert from "node:assert/strict";

import { MapLibreMapAssistantAdapter } from "../dist/index.js";

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
  constructor() {
    this.flyToCalls = [];
    this.fitBoundsCalls = [];
    this.setFeatureStateCalls = [];
    this.removeFeatureStateCalls = [];
    this.setLayoutPropertyCalls = [];
    this.setFilterCalls = [];
    this.querySourceFeaturesCalls = [];
    this.renderedFeaturesByLayerId = {
      cities: [{ id: 1, layer: { id: "cities" }, properties: { name: "Oakland" } }],
      empty: [],
    };
    this.sourceFeaturesBySourceId = {
      citiesSource: [{ id: "city-1", properties: { name: "Oakland" } }],
      roadsSource: [{ id: 5, properties: { class: "primary", lanes: 2 } }],
      emptySource: [],
    };
    this.style = {
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
  }

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

  queryRenderedFeatures(_geometry, options = {}) {
    const [layerId] = options.layers ?? [];
    return this.renderedFeaturesByLayerId[layerId] ?? [];
  }

  querySourceFeatures(sourceId, parameters = {}) {
    this.querySourceFeaturesCalls.push({ sourceId, parameters });
    return this.sourceFeaturesBySourceId[sourceId] ?? [];
  }

  flyTo(options) {
    this.flyToCalls.push(options);
  }

  fitBounds(bounds, options = {}) {
    this.fitBoundsCalls.push({ bounds, options });
  }

  setFeatureState(feature, state) {
    this.setFeatureStateCalls.push({ feature, state });
  }

  removeFeatureState(feature, key) {
    this.removeFeatureStateCalls.push({ feature, key });
  }

  setLayoutProperty(layerId, name, value) {
    this.setLayoutPropertyCalls.push({ layerId, name, value });
  }

  setFilter(layerId, filter) {
    this.setFilterCalls.push({ layerId, filter });
  }
}

test("getMapState and listLayers reflect the live map", async () => {
  const adapter = new MapLibreMapAssistantAdapter(new MockMap());

  assert.deepStrictEqual(await adapter.getMapState(), {
    bounds: { west: -123, south: 37, east: -121, north: 38 },
    center: { lng: -122, lat: 37.5 },
    zoom: 9,
    bearing: 15,
    pitch: 30,
    selectedFeatureIds: [],
  });

  assert.deepStrictEqual(await adapter.listLayers(), [
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

test("getLayerSchema reads source-backed metadata and vector layer fields", async () => {
  const adapter = new MapLibreMapAssistantAdapter(new MockMap());

  assert.deepStrictEqual(await adapter.getLayerSchema("cities"), {
    layerId: "cities",
    geometryType: "point",
    fields: [
      { name: "name", type: "string" },
      { name: "population", type: "number", alias: "Population" },
    ],
  });

  assert.deepStrictEqual(await adapter.getLayerSchema("roads"), {
    layerId: "roads",
    geometryType: "line",
    fields: [
      { name: "class", type: "string" },
      { name: "lanes", type: "number" },
    ],
  });
});

test("getLayerSchema rejects unknown layers and missing schema metadata", async () => {
  const adapter = new MapLibreMapAssistantAdapter(new MockMap());

  await assert.rejects(adapter.getLayerSchema("missing"), /Unknown layer: missing/);
  await assert.rejects(adapter.getLayerSchema("empty"), /does not expose schema details/);
});

test("queryVisibleFeatures and queryFeatures return normalized feature samples", async () => {
  const map = new MockMap();
  const adapter = new MapLibreMapAssistantAdapter(map);

  assert.deepStrictEqual(await adapter.queryVisibleFeatures({ layerId: "cities", limit: 1 }), [
    {
      id: "1",
      layerId: "cities",
      properties: { name: "Oakland" },
      geometry: undefined,
    },
  ]);

  assert.deepStrictEqual(await adapter.queryVisibleFeatures({ layerId: "empty" }), []);

  assert.deepStrictEqual(
    await adapter.queryFeatures({ layerId: "roads", where: "id IN ('5', '6')", limit: 1 }),
    [{ id: "5", layerId: "roads", properties: { class: "primary", lanes: 2 }, geometry: undefined }],
  );

  assert.deepStrictEqual(map.querySourceFeaturesCalls.at(-1), {
    sourceId: "roadsSource",
    parameters: {
      sourceLayer: "roads_layer",
      filter: ["in", ["id"], ["literal", ["5", "6"]]],
    },
  });
});

test("queryVisibleFeatures rejects hidden and unknown layers", async () => {
  const adapter = new MapLibreMapAssistantAdapter(new MockMap());

  await assert.rejects(adapter.queryVisibleFeatures({ layerId: "roads" }), /Layer is not visible: roads/);
  await assert.rejects(adapter.queryVisibleFeatures({ layerId: "missing" }), /Unknown layer: missing/);
});

test("setView chooses flyTo or fitBounds depending on arguments", async () => {
  const map = new MockMap();
  const adapter = new MapLibreMapAssistantAdapter(map);

  await adapter.setView({ center: { lng: -120, lat: 36 }, zoom: 7, bearing: 5, pitch: 10 });
  await adapter.setView({
    bounds: { west: -125, south: 35, east: -120, north: 40 },
    zoom: 8,
    bearing: 12,
    pitch: 20,
  });

  assert.deepStrictEqual(map.flyToCalls, [
    { center: [-120, 36], zoom: 7, bearing: 5, pitch: 10 },
  ]);
  assert.deepStrictEqual(map.fitBoundsCalls, [
    {
      bounds: [
        [-125, 35],
        [-120, 40],
      ],
      options: { maxZoom: 8, bearing: 12, pitch: 20 },
    },
  ]);
});

test("selectFeatures, clearSelection, setLayerVisibility, and setFilter mutate map state through MapLibre APIs", async () => {
  const map = new MockMap();
  const adapter = new MapLibreMapAssistantAdapter(map);

  await adapter.selectFeatures({ layerId: "cities", featureIds: ["city-1", "city-1", "city-2"] });

  assert.deepStrictEqual(map.setFeatureStateCalls, [
    { feature: { source: "citiesSource", id: "city-1" }, state: { selected: true } },
    { feature: { source: "citiesSource", id: "city-2" }, state: { selected: true } },
  ]);
  assert.deepStrictEqual((await adapter.getMapState()).selectedFeatureIds, ["city-1", "city-2"]);

  await adapter.clearSelection();

  assert.deepStrictEqual(map.removeFeatureStateCalls, [
    { feature: { source: "citiesSource", id: "city-1" }, key: "selected" },
    { feature: { source: "citiesSource", id: "city-2" }, key: "selected" },
  ]);
  assert.deepStrictEqual((await adapter.getMapState()).selectedFeatureIds, []);

  await adapter.setLayerVisibility("cities", false);
  await adapter.setFilter({ layerId: "cities", where: "name = 'Oakland'" });

  assert.deepStrictEqual(map.setLayoutPropertyCalls, [
    { layerId: "cities", name: "visibility", value: "none" },
  ]);
  assert.deepStrictEqual(map.setFilterCalls, [
    { layerId: "cities", filter: ["==", ["get", "name"], "Oakland"] },
  ]);
});

test("setFilter rejects unsupported where clauses", async () => {
  const adapter = new MapLibreMapAssistantAdapter(new MockMap());

  await assert.rejects(adapter.setFilter({ layerId: "cities", where: "population > 1000" }), /Unsupported where clause/);
});
