import { describe, expect, it } from "vitest";

import { makeMapState, makeMemoryAdapter, citiesLayer, roadsLayer } from "./fixtures.js";

describe("MemoryMapAssistantAdapter", () => {
  it("returns map state and layer summaries", async () => {
    const adapter = makeMemoryAdapter();

    expect(await adapter.getMapState()).toEqual(makeMapState());
    expect((await adapter.listLayers()).map((l) => l.id)).toEqual(["cities", "roads"]);
  });

  it("returns the schema for a known layer", async () => {
    const adapter = makeMemoryAdapter();

    expect(await adapter.getLayerSchema("cities")).toEqual(citiesLayer().schema);
  });

  it("throws for an unknown layer id", async () => {
    const adapter = makeMemoryAdapter();

    await expect(adapter.getLayerSchema("missing")).rejects.toThrow("Unknown layer: missing");
  });

  describe("visibility", () => {
    it("toggles layer visibility", async () => {
      const adapter = makeMemoryAdapter();

      await adapter.setLayerVisibility("roads", true);
      const roads = (await adapter.listLayers()).find((l) => l.id === "roads");
      expect(roads?.visible).toBe(true);

      await adapter.setLayerVisibility("cities", false);
      const cities = (await adapter.listLayers()).find((l) => l.id === "cities");
      expect(cities?.visible).toBe(false);
    });

    it("queryVisibleFeatures rejects a hidden layer", async () => {
      const adapter = makeMemoryAdapter();

      await expect(adapter.queryVisibleFeatures({ layerId: "roads" })).rejects.toThrow(
        "Layer is not visible: roads",
      );
    });

    it("queryVisibleFeatures returns features once a layer becomes visible", async () => {
      const adapter = makeMemoryAdapter();

      await adapter.setLayerVisibility("roads", true);
      expect(await adapter.queryVisibleFeatures({ layerId: "roads" })).toEqual(roadsLayer().features);
    });

    it("queryVisibleFeatures honors the limit argument", async () => {
      const adapter = makeMemoryAdapter();

      const result = await adapter.queryVisibleFeatures({ layerId: "cities", limit: 2 });
      expect(result).toHaveLength(2);
    });
  });

  describe("selection", () => {
    it("records selected feature ids", async () => {
      const adapter = makeMemoryAdapter();

      await adapter.selectFeatures({ layerId: "cities", featureIds: ["c1", "c2"] });
      expect((await adapter.getMapState()).selectedFeatureIds).toEqual(["c1", "c2"]);
    });

    it("clears the selection", async () => {
      const adapter = makeMemoryAdapter();

      await adapter.selectFeatures({ layerId: "cities", featureIds: ["c1"] });
      await adapter.clearSelection();
      expect((await adapter.getMapState()).selectedFeatureIds).toEqual([]);
    });

    it("rejects selection on an unknown layer", async () => {
      const adapter = makeMemoryAdapter();

      await expect(
        adapter.selectFeatures({ layerId: "missing", featureIds: ["x"] }),
      ).rejects.toThrow("Unknown layer: missing");
    });
  });

  describe("filters (queryFeatures)", () => {
    it("returns all features when no where clause is provided", async () => {
      const adapter = makeMemoryAdapter();

      expect(await adapter.queryFeatures({ layerId: "cities" })).toHaveLength(3);
    });

    it("filters by an `id IN (...)` clause", async () => {
      const adapter = makeMemoryAdapter();

      const result = await adapter.queryFeatures({ layerId: "cities", where: "id IN ('c1', 'c3')" });
      expect(result.map((f) => f.id)).toEqual(["c1", "c3"]);
    });

    it("applies the limit after filtering", async () => {
      const adapter = makeMemoryAdapter();

      const result = await adapter.queryFeatures({
        layerId: "cities",
        where: "id IN ('c1', 'c2', 'c3')",
        limit: 1,
      });
      expect(result.map((f) => f.id)).toEqual(["c1"]);
    });

    it("rejects unsupported where clauses", async () => {
      const adapter = makeMemoryAdapter();

      await expect(
        adapter.queryFeatures({ layerId: "cities", where: "population > 100000" }),
      ).rejects.toThrow(/id IN/);
    });

    it("stores a filter via setFilter without throwing for valid layers", async () => {
      const adapter = makeMemoryAdapter();

      await expect(
        adapter.setFilter({ layerId: "cities", where: "name = 'Oakland'" }),
      ).resolves.toBeUndefined();
    });

    it("setFilter rejects an unknown layer", async () => {
      const adapter = makeMemoryAdapter();

      await expect(
        adapter.setFilter({ layerId: "missing", where: "name = 'Oakland'" }),
      ).rejects.toThrow("Unknown layer: missing");
    });
  });

  describe("setView", () => {
    it("merges the provided center and zoom into map state", async () => {
      const adapter = makeMemoryAdapter();

      await adapter.setView({ center: { lng: -120, lat: 36 }, zoom: 7 });
      const state = await adapter.getMapState();
      expect(state.center).toEqual({ lng: -120, lat: 36 });
      expect(state.zoom).toBe(7);
    });

    it("preserves the selection across a view change", async () => {
      const adapter = makeMemoryAdapter();

      await adapter.selectFeatures({ layerId: "cities", featureIds: ["c1"] });
      await adapter.setView({ zoom: 5 });
      expect((await adapter.getMapState()).selectedFeatureIds).toEqual(["c1"]);
    });
  });
});
