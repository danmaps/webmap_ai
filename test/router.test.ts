import { describe, expect, it, vi } from "vitest";

import {
  MapAssistantRouter,
  parseToolCall,
  TOOL_REGISTRY,
  KNOWN_TOOL_NAMES,
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
      sql: 'SELECT * FROM "cities" WHERE id IN (\'c1\'); DROP TABLE cities',
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
      sql: 'SELECT * FROM "cities" WHERE id IN (\'c1\') -- ignore the rest',
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

// ---- Registry & parseToolCall tests ---------------------------------------

describe("TOOL_REGISTRY", () => {
  it("contains exactly the 10 declared tools", () => {
    const names = TOOL_REGISTRY.map((t) => t.name);
    expect(names).toEqual([
      "list_layers",
      "get_map_state",
      "get_layer_schema",
      "query_visible_features",
      "query_features",
      "set_view",
      "select_features",
      "clear_selection",
      "set_layer_visibility",
      "set_filter",
    ]);
  });

  it("every entry has a non-empty description and a parameters object", () => {
    for (const entry of TOOL_REGISTRY) {
      expect(entry.description.length, `${entry.name} description`).toBeGreaterThan(0);
      expect(entry.parameters.type).toBe("object");
    }
  });

  it("KNOWN_TOOL_NAMES matches registry names", () => {
    for (const entry of TOOL_REGISTRY) {
      expect(KNOWN_TOOL_NAMES.has(entry.name)).toBe(true);
    }
    expect(KNOWN_TOOL_NAMES.size).toBe(TOOL_REGISTRY.length);
  });
});

describe("parseToolCall", () => {
  it("returns null for unknown tool names", () => {
    expect(parseToolCall("evil_tool", {})).toBeNull();
    expect(parseToolCall("", {})).toBeNull();
    expect(parseToolCall("DROP TABLE layers", {})).toBeNull();
  });

  it("parses no-arg tools regardless of args shape", () => {
    expect(parseToolCall("list_layers", undefined)).toEqual({ name: "list_layers" });
    expect(parseToolCall("get_map_state", {})).toEqual({ name: "get_map_state" });
    expect(parseToolCall("clear_selection", { extra: "ignored" })).toEqual({ name: "clear_selection" });
  });

  it("returns null for get_layer_schema when layerId is missing or wrong type", () => {
    expect(parseToolCall("get_layer_schema", {})).toBeNull();
    expect(parseToolCall("get_layer_schema", { layerId: 123 })).toBeNull();
    expect(parseToolCall("get_layer_schema", { layerId: "" })).toBeNull();
    expect(parseToolCall("get_layer_schema", { layerId: "   " })).toBeNull();
  });

  it("parses get_layer_schema with a valid layerId and ignores extra arguments", () => {
    expect(parseToolCall("get_layer_schema", { layerId: "cities", extra: "ignored" })).toEqual({
      name: "get_layer_schema",
      args: { layerId: "cities" },
    });
  });

  it("returns null for set_layer_visibility when required args are wrong type", () => {
    expect(parseToolCall("set_layer_visibility", { layerId: "roads", visible: "yes" })).toBeNull();
    expect(parseToolCall("set_layer_visibility", { layerId: 42, visible: true })).toBeNull();
    expect(parseToolCall("set_layer_visibility", {})).toBeNull();
  });

  it("parses set_layer_visibility with valid args", () => {
    expect(parseToolCall("set_layer_visibility", { layerId: "roads", visible: false })).toEqual({
      name: "set_layer_visibility",
      args: { layerId: "roads", visible: false },
    });
  });

  it("returns null for set_filter when required args are missing or wrong type", () => {
    expect(parseToolCall("set_filter", { layerId: "cities" })).toBeNull();
    expect(parseToolCall("set_filter", { where: "name = 'X'" })).toBeNull();
    expect(parseToolCall("set_filter", { layerId: "cities", where: 99 })).toBeNull();
  });

  it("returns null for select_features when featureIds is not an array", () => {
    expect(parseToolCall("select_features", { layerId: "cities", featureIds: "c1" })).toBeNull();
    expect(parseToolCall("select_features", { layerId: "cities" })).toBeNull();
  });

  it("omits optional numeric fields when they are not numbers", () => {
    const result = parseToolCall("query_visible_features", { layerId: "cities", limit: "ten" });
    expect(result).toEqual({ name: "query_visible_features", args: { layerId: "cities" } });
  });

  it("includes optional numeric fields when they are numbers", () => {
    const result = parseToolCall("query_visible_features", { layerId: "cities", limit: 10 });
    expect(result).toEqual({ name: "query_visible_features", args: { layerId: "cities", limit: 10 } });
  });
});

// ---- Router runtime-rejection tests --------------------------------------

describe("MapAssistantRouter — runtime rejection", () => {
  it("rejects an unknown tool name at runtime without calling the adapter", async () => {
    const adapter = spyAdapter();
    const router = new MapAssistantRouter(adapter);

    const response = await router.run({
      message: "do something shady",
      toolCalls: [{ name: "evil_tool" } as unknown as MapAssistantToolCall],
    });

    expect(response.toolResults).toHaveLength(1);
    expect(response.toolResults[0]).toMatchObject({
      name: "evil_tool",
      ok: false,
      error: expect.stringContaining("evil_tool"),
    });
    // No adapter method should have been called
    for (const fn of Object.values(adapter)) {
      expect(fn).not.toHaveBeenCalled();
    }
    expect(response.text).toContain("0 succeeded, 1 failed");
  });

  it("rejects malformed args (wrong type) without calling the adapter", async () => {
    const adapter = spyAdapter();
    const router = new MapAssistantRouter(adapter);

    // layerId should be a string, not a number
    const response = await router.run({
      message: "bad args",
      toolCalls: [
        { name: "get_layer_schema", args: { layerId: 999 } } as unknown as MapAssistantToolCall,
      ],
    });

    expect(response.toolResults[0]).toMatchObject({
      name: "get_layer_schema",
      ok: false,
    });
    expect(adapter.getLayerSchema).not.toHaveBeenCalled();
  });

  it("rejects missing required args without calling the adapter", async () => {
    const adapter = spyAdapter();
    const router = new MapAssistantRouter(adapter);

    const response = await router.run({
      message: "missing required arg",
      toolCalls: [
        // visible is required for set_layer_visibility
        { name: "set_layer_visibility", args: { layerId: "cities" } } as unknown as MapAssistantToolCall,
      ],
    });

    expect(response.toolResults[0]).toMatchObject({
      name: "set_layer_visibility",
      ok: false,
    });
    expect(adapter.setLayerVisibility).not.toHaveBeenCalled();
  });

  it("continues processing remaining calls after rejecting an invalid one", async () => {
    const router = new MapAssistantRouter(makeMemoryAdapter());

    const response = await router.run({
      message: "mixed valid and invalid",
      toolCalls: [
        { name: "unknown_xyz" } as unknown as MapAssistantToolCall,
        { name: "list_layers" },
        { name: "get_layer_schema", args: { layerId: 0 } } as unknown as MapAssistantToolCall,
        { name: "get_map_state" },
      ],
    });

    expect(response.toolResults.map((r) => [r.name, r.ok])).toEqual([
      ["unknown_xyz", false],
      ["list_layers", true],
      ["get_layer_schema", false],
      ["get_map_state", true],
    ]);
    expect(response.text).toContain("2 succeeded, 2 failed");
  });
});
