import { describe, expect, it, vi } from "vitest";

import {
  MapAssistantRouter,
  type MapAssistantAdapter,
  type MapAssistantToolCall,
} from "../src/index.js";
import { makeMapState, makeMemoryAdapter } from "./fixtures.js";

function spyAdapter(): MapAssistantAdapter {
  return {
    getMapState: vi.fn(async () => makeMapState()),
    listLayers: vi.fn(async () => []),
    getLayerSchema: vi.fn(async () => ({ layerId: "cities", fields: [] })),
    queryVisibleFeatures: vi.fn(async () => []),
    queryFeatures: vi.fn(async () => []),
    setView: vi.fn(async () => undefined),
    selectFeatures: vi.fn(async () => undefined),
    clearSelection: vi.fn(async () => undefined),
    setLayerVisibility: vi.fn(async () => undefined),
    setFilter: vi.fn(async () => undefined),
  };
}

describe("MapAssistantRouter", () => {
  it("dispatches each tool call to the matching adapter method", async () => {
    const adapter = spyAdapter();
    const router = new MapAssistantRouter(adapter);

    const toolCalls: MapAssistantToolCall[] = [
      { name: "list_layers" },
      { name: "get_map_state" },
      { name: "get_layer_schema", args: { layerId: "cities" } },
      { name: "query_visible_features", args: { layerId: "cities", limit: 5 } },
      { name: "query_features", args: { layerId: "cities", where: "id IN ('c1')" } },
      { name: "set_view", args: { zoom: 6 } },
      { name: "select_features", args: { layerId: "cities", featureIds: ["c1"] } },
      { name: "clear_selection" },
      { name: "set_layer_visibility", args: { layerId: "cities", visible: false } },
      { name: "set_filter", args: { layerId: "cities", where: "name = 'X'" } },
    ];

    const response = await router.run({ message: "do everything", toolCalls });

    expect(adapter.listLayers).toHaveBeenCalledTimes(1);
    expect(adapter.getMapState).toHaveBeenCalledTimes(1);
    expect(adapter.getLayerSchema).toHaveBeenCalledWith("cities");
    expect(adapter.queryVisibleFeatures).toHaveBeenCalledWith({ layerId: "cities", limit: 5 });
    expect(adapter.queryFeatures).toHaveBeenCalledWith({ layerId: "cities", where: "id IN ('c1')" });
    expect(adapter.setView).toHaveBeenCalledWith({ zoom: 6 });
    expect(adapter.selectFeatures).toHaveBeenCalledWith({ layerId: "cities", featureIds: ["c1"] });
    expect(adapter.clearSelection).toHaveBeenCalledTimes(1);
    expect(adapter.setLayerVisibility).toHaveBeenCalledWith("cities", false);
    expect(adapter.setFilter).toHaveBeenCalledWith({ layerId: "cities", where: "name = 'X'" });

    expect(response.toolResults).toHaveLength(10);
    expect(response.toolResults.every((r) => r.ok)).toBe(true);
    expect(response.text).toContain("10 tool call(s)");
    expect(response.text).toContain("10 succeeded, 0 failed");
  });

  it("returns the adapter result data for read tool calls", async () => {
    const router = new MapAssistantRouter(makeMemoryAdapter());

    const response = await router.run({
      message: "schema please",
      toolCalls: [{ name: "get_layer_schema", args: { layerId: "cities" } }],
    });

    expect(response.toolResults[0]).toMatchObject({
      name: "get_layer_schema",
      ok: true,
      data: { layerId: "cities", geometryType: "point" },
    });
  });

  it("includes the audited SQL for query_features tool results", async () => {
    const router = new MapAssistantRouter(makeMemoryAdapter());

    const response = await router.run({
      message: "query cities",
      toolCalls: [{ name: "query_features", args: { layerId: "cities", where: "id IN ('c1')" } }],
    });

    expect(response.toolResults[0]).toMatchObject({
      name: "query_features",
      ok: true,
      sql: 'SELECT * FROM "cities" WHERE id IN (\'c1\') LIMIT 50',
    });
  });

  it("returns null data for mutation tool calls", async () => {
    const router = new MapAssistantRouter(makeMemoryAdapter());

    const response = await router.run({
      message: "clear it",
      toolCalls: [{ name: "clear_selection" }],
    });

    expect(response.toolResults[0]).toEqual({ name: "clear_selection", ok: true, data: null });
  });

  it("catches adapter errors and reports ok: false with the error message", async () => {
    const router = new MapAssistantRouter(makeMemoryAdapter());

    const response = await router.run({
      message: "bad layer",
      toolCalls: [{ name: "get_layer_schema", args: { layerId: "missing" } }],
    });

    expect(response.toolResults[0]).toEqual({
      name: "get_layer_schema",
      ok: false,
      error: "Unknown layer: missing",
    });
    expect(response.text).toContain("0 succeeded, 1 failed");
  });

  it("processes remaining calls after one fails, preserving order", async () => {
    const router = new MapAssistantRouter(makeMemoryAdapter());

    const response = await router.run({
      message: "mixed",
      toolCalls: [
        { name: "list_layers" },
        { name: "get_layer_schema", args: { layerId: "missing" } },
        { name: "get_map_state" },
      ],
    });

    expect(response.toolResults.map((r) => [r.name, r.ok])).toEqual([
      ["list_layers", true],
      ["get_layer_schema", false],
      ["get_map_state", true],
    ]);
    expect(response.text).toContain("2 succeeded, 1 failed");
  });

  it("falls back to a generic message for non-Error throws", async () => {
    const adapter = spyAdapter();
    (adapter.listLayers as ReturnType<typeof vi.fn>).mockRejectedValueOnce("boom");
    const router = new MapAssistantRouter(adapter);

    const response = await router.run({
      message: "throw a string",
      toolCalls: [{ name: "list_layers" }],
    });

    expect(response.toolResults[0]).toEqual({
      name: "list_layers",
      ok: false,
      error: "Unknown tool execution error",
    });
  });

  it("rejects unsafe generated SQL before dispatching query_features", async () => {
    const adapter = spyAdapter();
    const router = new MapAssistantRouter(adapter);

    const response = await router.run({
      message: "do something unsafe",
      toolCalls: [
        {
          name: "query_features",
          args: { layerId: "cities", where: "id IN ('c1'); DROP TABLE cities" },
        },
      ],
    });

    expect(adapter.queryFeatures).not.toHaveBeenCalled();
    expect(response.toolResults[0]).toEqual({
      name: "query_features",
      ok: false,
      sql: 'SELECT * FROM "cities" WHERE id IN (\'c1\'); DROP TABLE cities LIMIT 50',
      error: "Only a single read-only SELECT or WITH statement without comments is allowed.",
    });
  });

  it("rejects comment-based query_features bypass attempts before dispatching", async () => {
    const adapter = spyAdapter();
    const router = new MapAssistantRouter(adapter);

    const response = await router.run({
      message: "bypass the filter",
      toolCalls: [
        {
          name: "query_features",
          args: { layerId: "cities", where: "id IN ('c1') -- ignore the rest" },
        },
      ],
    });

    expect(adapter.queryFeatures).not.toHaveBeenCalled();
    expect(response.toolResults[0]).toEqual({
      name: "query_features",
      ok: false,
      sql: 'SELECT * FROM "cities" WHERE id IN (\'c1\') -- ignore the rest LIMIT 50',
      error: "Only a single read-only SELECT or WITH statement without comments is allowed.",
    });
  });

  it("handles an empty tool call array", async () => {
    const router = new MapAssistantRouter(makeMemoryAdapter());

    const response = await router.run({ message: "nothing to do", toolCalls: [] });

    expect(response.toolResults).toEqual([]);
    expect(response.text).toContain("0 tool call(s)");
    expect(response.text).toContain("0 succeeded, 0 failed");
  });
});
