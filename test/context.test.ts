import { describe, it, expect } from "vitest";
import { buildAssistantContext } from "../src/context.js";
import { makeMemoryAdapter, citiesLayer, roadsLayer, makeMapState } from "./fixtures.js";

describe("buildAssistantContext", () => {
  it("includes map state (bounds, zoom, center, selectedFeatureIds)", async () => {
    const adapter = makeMemoryAdapter();
    const ctx = await buildAssistantContext(adapter);

    expect(ctx.mapState.bounds).toEqual({ west: -123, south: 37, east: -121, north: 38 });
    expect(ctx.mapState.zoom).toBe(9);
    expect(ctx.mapState.center).toEqual({ lng: -122, lat: 37.5 });
    expect(ctx.mapState.selectedFeatureIds).toEqual([]);
  });

  it("includes layer names, types, and visibility", async () => {
    const adapter = makeMemoryAdapter();
    const ctx = await buildAssistantContext(adapter);

    expect(ctx.layers).toHaveLength(2);
    const cities = ctx.layers.find((l) => l.id === "cities")!;
    expect(cities.name).toBe("Major US Cities");
    expect(cities.type).toBe("geojson");
    expect(cities.visible).toBe(true);

    const roads = ctx.layers.find((l) => l.id === "roads")!;
    expect(roads.name).toBe("Interstate Highways");
    expect(roads.visible).toBe(false);
  });

  it("includes per-layer geometry type and field names/types", async () => {
    const adapter = makeMemoryAdapter();
    const ctx = await buildAssistantContext(adapter);

    const cities = ctx.layers.find((l) => l.id === "cities")!;
    expect(cities.geometryType).toBe("point");
    expect(cities.fields).toEqual([
      { name: "name", type: "string" },
      { name: "population", type: "number", alias: "Population" },
    ]);

    const roads = ctx.layers.find((l) => l.id === "roads")!;
    expect(roads.geometryType).toBe("line");
    expect(roads.fields).toEqual([{ name: "ref", type: "string" }]);
  });

  it("never includes feature property values or geometry in the context", async () => {
    const adapter = makeMemoryAdapter();
    const ctx = await buildAssistantContext(adapter);

    // Serialize the entire context and verify no feature data is present
    const serialized = JSON.stringify(ctx);

    // Feature values from citiesFeatures() — must not appear
    expect(serialized).not.toContain("Oakland");
    expect(serialized).not.toContain("Fresno");
    expect(serialized).not.toContain("San Jose");
    expect(serialized).not.toContain("440000");
    expect(serialized).not.toContain("540000");
    expect(serialized).not.toContain("1000000");

    // Feature values from roadsFeatures()
    expect(serialized).not.toContain("I-80");

    // No geometry coordinates or geometry objects
    for (const layer of ctx.layers) {
      // Layer context should not have a 'properties' or 'geometry' key
      expect(layer).not.toHaveProperty("properties");
      expect(layer).not.toHaveProperty("geometry");
      expect(layer).not.toHaveProperty("features");
    }

    // Field entries contain only name/type/alias — no 'value' key
    for (const layer of ctx.layers) {
      for (const field of layer.fields) {
        expect(Object.keys(field).sort()).toEqual(
          Object.keys(field)
            .filter((k) => ["name", "type", "alias"].includes(k))
            .sort(),
        );
      }
    }
  });

  it("carries selected feature IDs without feature data", async () => {
    const adapter = makeMemoryAdapter(
      [citiesLayer(), roadsLayer()],
      makeMapState({ selectedFeatureIds: ["c1", "r1"] }),
    );
    const ctx = await buildAssistantContext(adapter);

    expect(ctx.mapState.selectedFeatureIds).toEqual(["c1", "r1"]);

    // IDs are fine, but the actual feature data behind those IDs must not be here
    const serialized = JSON.stringify(ctx);
    expect(serialized).not.toContain("Oakland");
    expect(serialized).not.toContain("I-80");
  });
});
