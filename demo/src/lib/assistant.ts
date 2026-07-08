import { MapAssistantRouter, MapLibreMapAssistantAdapter } from "webmap_ai";
import type { MapLibreMapLike } from "webmap_ai";
import type { AssistantResponse, MapAssistantToolCall, QueryFeaturesArgs, SetFilterArgs } from "webmap_ai";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  toolResults?: AssistantResponse["toolResults"];
  isLoading?: boolean;
}

interface OpenRouterToolCall {
  id: string;
  type?: string;
  function: { name: string; arguments: string };
}

interface OpenRouterMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: OpenRouterToolCall[];
  tool_call_id?: string;
}

interface OpenRouterChoice {
  message: {
    content?: string;
    tool_calls?: OpenRouterToolCall[];
  };
}

const TOOL_DEFINITIONS = [
  {
    type: "function",
    function: {
      name: "list_layers",
      description: "List all available map layers with their visibility status.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_map_state",
      description:
        "Get current map state including bounding box, center, zoom level, bearing, pitch, and selected feature IDs.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_layer_schema",
      description: "Get the schema (fields/columns) for a specific layer.",
      parameters: {
        type: "object",
        properties: {
          layerId: { type: "string", description: "The ID of the layer to inspect." },
        },
        required: ["layerId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_visible_features",
      description: "Query features currently visible on the map for a specific layer.",
      parameters: {
        type: "object",
        properties: {
          layerId: { type: "string", description: "The layer to query." },
          limit: { type: "number", description: "Maximum number of features to return." },
        },
        required: ["layerId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_layer_visibility",
      description: "Show or hide a map layer.",
      parameters: {
        type: "object",
        properties: {
          layerId: { type: "string", description: "The layer to show or hide." },
          visible: { type: "boolean", description: "True to show, false to hide." },
        },
        required: ["layerId", "visible"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_view",
      description: "Pan or zoom the map to a specific location.",
      parameters: {
        type: "object",
        properties: {
          zoom: { type: "number", description: "Zoom level (0–22)." },
          center: {
            type: "object",
            description: "Map center as {lng, lat}.",
            properties: {
              lng: { type: "number" },
              lat: { type: "number" },
            },
          },
        },
      },
    },
  },
];

function parseBackendToolCall(name: string, args: Record<string, unknown>): MapAssistantToolCall | null {
  switch (name) {
    case "list_layers":
      return { name: "list_layers" };
    case "get_map_state":
      return { name: "get_map_state" };
    case "clear_selection":
      return { name: "clear_selection" };
    case "get_layer_schema":
      return { name: "get_layer_schema", args: { layerId: String(args["layerId"] ?? "") } };
    case "query_visible_features":
      return {
        name: "query_visible_features",
        args: {
          layerId: String(args["layerId"] ?? ""),
          limit: typeof args["limit"] === "number" ? args["limit"] : undefined,
        },
      };
    case "query_features": {
      const qfArgs: QueryFeaturesArgs = {
        layerId: String(args["layerId"] ?? ""),
        where: typeof args["where"] === "string" ? args["where"] : undefined,
        limit: typeof args["limit"] === "number" ? args["limit"] : undefined,
      };
      return { name: "query_features", args: qfArgs };
    }
    case "set_layer_visibility":
      return {
        name: "set_layer_visibility",
        args: { layerId: String(args["layerId"] ?? ""), visible: Boolean(args["visible"]) },
      };
    case "set_view": {
      const c =
        args["center"] && typeof args["center"] === "object" && !Array.isArray(args["center"])
          ? (args["center"] as { lng?: number; lat?: number })
          : undefined;
      return {
        name: "set_view",
        args: {
          zoom: typeof args["zoom"] === "number" ? args["zoom"] : undefined,
          center:
            c && typeof c.lng === "number" && typeof c.lat === "number"
              ? { lng: c.lng, lat: c.lat }
              : undefined,
        },
      };
    }
    case "select_features":
      return {
        name: "select_features",
        args: {
          layerId: String(args["layerId"] ?? ""),
          featureIds: Array.isArray(args["featureIds"]) ? args["featureIds"].map(String) : [],
        },
      };
    case "set_filter": {
      const sfArgs: SetFilterArgs = {
        layerId: String(args["layerId"] ?? ""),
        where: typeof args["where"] === "string" ? args["where"] : "",
      };
      return { name: "set_filter", args: sfArgs };
    }
    default:
      return null;
  }
}

function parseToolCall(name: string, argsJson: string): MapAssistantToolCall | null {
  try {
    const args = argsJson ? (JSON.parse(argsJson) as Record<string, unknown>) : {};
    switch (name) {
      case "list_layers":
        return { name: "list_layers" };
      case "get_map_state":
        return { name: "get_map_state" };
      case "get_layer_schema":
        return { name: "get_layer_schema", args: { layerId: String(args["layerId"] ?? "") } };
      case "query_visible_features":
        return {
          name: "query_visible_features",
          args: {
            layerId: String(args["layerId"] ?? ""),
            limit: typeof args["limit"] === "number" ? args["limit"] : undefined,
          },
        };
      case "set_layer_visibility":
        return {
          name: "set_layer_visibility",
          args: { layerId: String(args["layerId"] ?? ""), visible: Boolean(args["visible"]) },
        };
      case "set_view": {
        const center =
          args["center"] && typeof args["center"] === "object" && !Array.isArray(args["center"])
            ? (args["center"] as { lng?: number; lat?: number })
            : undefined;
        return {
          name: "set_view",
          args: {
            zoom: typeof args["zoom"] === "number" ? args["zoom"] : undefined,
            center:
              center && typeof center.lng === "number" && typeof center.lat === "number"
                ? { lng: center.lng, lat: center.lat }
                : undefined,
          },
        };
      }
      default:
        return null;
    }
  } catch {
    return null;
  }
}

function inferToolCalls(message: string): MapAssistantToolCall[] {
  const lower = message.toLowerCase();
  const calls: MapAssistantToolCall[] = [];

  calls.push({ name: "get_map_state" });
  calls.push({ name: "list_layers" });

  if (lower.includes("cities") || lower.includes("city")) {
    calls.push({ name: "query_visible_features", args: { layerId: "cities", limit: 5 } });
  }
  if (lower.includes("region") || lower.includes("area")) {
    calls.push({ name: "query_visible_features", args: { layerId: "regions", limit: 5 } });
  }
  if (lower.includes("highway") || lower.includes("route") || lower.includes("road")) {
    calls.push({ name: "query_visible_features", args: { layerId: "routes", limit: 3 } });
  }

  return calls;
}

function formatToolResultsAsText(response: AssistantResponse): string {
  const lines: string[] = [];

  for (const result of response.toolResults) {
    if (!result.ok) {
      lines.push(`⚠️ **${result.name}** failed: ${result.error ?? "unknown error"}`);
      continue;
    }
    switch (result.name) {
      case "get_map_state": {
        const state = result.data as {
          zoom?: number;
          center?: { lng: number; lat: number };
          bounds?: { west: number; south: number; east: number; north: number };
          selectedFeatureIds?: string[];
        };
        lines.push(
          `📍 **Map state** — zoom: ${(state.zoom ?? 0).toFixed(1)}, ` +
            `center: ${(state.center?.lng ?? 0).toFixed(2)}°, ${(state.center?.lat ?? 0).toFixed(2)}°`,
        );
        break;
      }
      case "list_layers": {
        const layers = result.data as Array<{ id: string; name: string; visible: boolean }>;
        const summary = layers.map((l) => `${l.visible ? "👁" : "○"} ${l.name}`).join("  |  ");
        lines.push(`🗂 **Layers** — ${summary}`);
        break;
      }
      case "query_visible_features": {
        const features = result.data as Array<{ id: string; properties: Record<string, unknown> }>;
        const count = features.length;
        const sample = features
          .slice(0, 3)
          .map((f) => {
            const name = f.properties["name"] ?? f.id;
            return String(name);
          })
          .join(", ");
        lines.push(`🔍 **Visible features** (${count}) — ${sample}${count > 3 ? "…" : ""}`);
        break;
      }
      case "get_layer_schema": {
        const schema = result.data as { layerId: string; fields: Array<{ name: string; type: string }> };
        const fields = schema.fields.map((f) => `${f.name}:${f.type}`).join(", ");
        lines.push(`📋 **Schema for ${schema.layerId}** — ${fields}`);
        break;
      }
      case "set_layer_visibility":
        lines.push(`✅ Layer visibility updated.`);
        break;
      case "set_view":
        lines.push(`✅ Map view updated.`);
        break;
      default:
        lines.push(`✅ **${result.name}** completed.`);
    }
  }

  return lines.join("\n");
}

function buildMockReply(message: string, toolSummary: string): string {
  const lower = message.toLowerCase();

  if (lower.includes("layer") || lower.includes("what") || lower.includes("show")) {
    return (
      `Here's what I can see on the map:\n\n${toolSummary}\n\n` +
      `The demo map shows three layers: **US Regions** (colored polygons), ` +
      `**Interstate Highways** (yellow lines), and **Major US Cities** (red dots). ` +
      `You can ask me to hide a layer, zoom to a city, or describe what's visible.`
    );
  }
  if (lower.includes("city") || lower.includes("cities")) {
    return `${toolSummary}\n\nThe cities layer shows 15 major US cities. Each city marker includes its name, state, and population.`;
  }
  if (lower.includes("zoom") || lower.includes("pan") || lower.includes("view")) {
    return `${toolSummary}\n\nI can adjust the map view — try asking me to zoom in on a specific city or region.`;
  }
  return (
    `${toolSummary}\n\n` +
    `I'm your map assistant. I can describe the current map state, list or query layers, ` +
    `toggle layer visibility, or adjust the view. What would you like to know?`
  );
}

const DEFAULT_OPENROUTER_MODEL = "openai/gpt-4o-mini";

export const OPENROUTER_MODEL: string =
  (import.meta.env["VITE_OPENROUTER_MODEL"] as string | undefined)?.trim() ||
  DEFAULT_OPENROUTER_MODEL;

export class AssistantService {
  private adapter: MapLibreMapAssistantAdapter;
  private router: MapAssistantRouter;
  private apiKey: string | undefined;
  private backendUrl: string | undefined;

  public constructor(map: MapLibreMapLike) {
    this.adapter = new MapLibreMapAssistantAdapter(map);
    this.router = new MapAssistantRouter(this.adapter);
    const backendUrl = import.meta.env["VITE_BACKEND_URL"] as string | undefined;
    const trimmedBackendUrl = backendUrl?.trim();
    this.backendUrl = trimmedBackendUrl ? trimmedBackendUrl.replace(/\/$/, "") : undefined;
    const key = import.meta.env["VITE_OPENROUTER_API_KEY"] as string | undefined;
    this.apiKey = key && key.trim() !== "" ? key.trim() : undefined;
  }

  public async send(userMessage: string): Promise<ChatMessage> {
    if (this.backendUrl) {
      return this.sendViaBackend(userMessage);
    }
    if (this.apiKey) {
      return this.sendViaOpenRouter(userMessage);
    }
    return this.sendViaMock(userMessage);
  }

  private async sendViaBackend(userMessage: string): Promise<ChatMessage> {
    const mapState = await this.adapter.getMapState();
    const layers = await this.adapter.listLayers();

    const mapContext = {
      bbox: {
        west: mapState.bounds.west,
        south: mapState.bounds.south,
        east: mapState.bounds.east,
        north: mapState.bounds.north,
      },
      center: { lng: mapState.center.lng, lat: mapState.center.lat },
      zoom: mapState.zoom,
      visible_layers: layers.filter((l) => l.visible).map((l) => l.id),
      selected_feature_ids: mapState.selectedFeatureIds,
    };

    const resp = await fetch(`${this.backendUrl}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: userMessage, map_context: mapContext }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`Backend error ${resp.status}: ${errText}`);
    }

    const json = (await resp.json()) as {
      text: string;
      tool_calls: Array<{ name: string; args: Record<string, unknown> }>;
    };

    const toolCalls: MapAssistantToolCall[] = (json.tool_calls ?? [])
      .map((tc) => parseBackendToolCall(tc.name, tc.args ?? {}))
      .filter((tc): tc is MapAssistantToolCall => tc !== null);

    let toolResults: AssistantResponse["toolResults"] = [];
    let toolSummary = "";

    if (toolCalls.length > 0) {
      const routerResponse = await this.router.run({ message: userMessage, toolCalls });
      toolResults = routerResponse.toolResults;
      toolSummary = formatToolResultsAsText(routerResponse);
    }

    const text = json.text || toolSummary || "(No response)";

    return {
      id: crypto.randomUUID(),
      role: "assistant",
      content: text,
      toolResults: toolResults.length > 0 ? toolResults : undefined,
    };
  }

  private async sendViaOpenRouter(userMessage: string): Promise<ChatMessage> {
    const mapState = await this.adapter.getMapState();
    const layers = await this.adapter.listLayers();

    const systemPrompt = [
      "You are a map assistant embedded in a MapLibre web map.",
      "Use the available tools to answer questions about the map accurately.",
      "After calling tools, read the returned data and give a direct, natural-language answer to the user's question.",
      "",
      "Current map context:",
      `- Zoom: ${mapState.zoom.toFixed(1)}`,
      `- Center: ${mapState.center.lng.toFixed(3)}°, ${mapState.center.lat.toFixed(3)}°`,
      `- Bounds: W${mapState.bounds.west.toFixed(2)} S${mapState.bounds.south.toFixed(2)} E${mapState.bounds.east.toFixed(2)} N${mapState.bounds.north.toFixed(2)}`,
      `- Visible layers: ${layers
        .filter((l) => l.visible)
        .map((l) => l.name)
        .join(", ")}`,
      `- Selected features: ${mapState.selectedFeatureIds.length > 0 ? mapState.selectedFeatureIds.join(", ") : "none"}`,
      "",
      "Respond concisely. Use tools when you need fresh data from the map.",
    ].join("\n");

    const messages: OpenRouterMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ];

    const allToolResults: AssistantResponse["toolResults"] = [];
    const MAX_ROUNDS = 5;

    for (let round = 0; round < MAX_ROUNDS; round++) {
      const choice = await this.callOpenRouter(messages);
      const rawToolCalls = choice.message.tool_calls ?? [];

      // No tool calls => the model produced its final answer.
      if (rawToolCalls.length === 0) {
        return {
          id: crypto.randomUUID(),
          role: "assistant",
          content: choice.message.content || "(No text response)",
          toolResults: allToolResults.length > 0 ? allToolResults : undefined,
        };
      }

      // Record the model's tool-call turn in the conversation.
      messages.push({
        role: "assistant",
        content: choice.message.content ?? "",
        tool_calls: rawToolCalls,
      });

      // Parse each requested call (keeping alignment with its tool_call id).
      const parsed = rawToolCalls.map((tc) => ({
        id: tc.id,
        call: parseToolCall(tc.function.name, tc.function.arguments),
      }));
      const validCalls = parsed
        .map((p) => p.call)
        .filter((c): c is MapAssistantToolCall => c !== null);

      const routerResponse =
        validCalls.length > 0
          ? await this.router.run({ message: userMessage, toolCalls: validCalls })
          : { toolResults: [] as AssistantResponse["toolResults"] };
      allToolResults.push(...routerResponse.toolResults);

      // Feed each tool result back to the model, matched by tool_call id.
      let resultIndex = 0;
      for (const p of parsed) {
        let content: string;
        if (p.call) {
          const result = routerResponse.toolResults[resultIndex++];
          content = JSON.stringify(
            result?.ok ? result.data : { error: result?.error ?? "unknown error" },
          );
        } else {
          content = JSON.stringify({ error: "Unsupported or unrecognized tool call." });
        }
        messages.push({ role: "tool", tool_call_id: p.id, content });
      }
    }

    // Safety fallback if the model kept calling tools without answering.
    return {
      id: crypto.randomUUID(),
      role: "assistant",
      content: formatToolResultsAsText({ toolResults: allToolResults } as AssistantResponse) ||
        "(No response after tool calls)",
      toolResults: allToolResults.length > 0 ? allToolResults : undefined,
    };
  }

  private async callOpenRouter(messages: OpenRouterMessage[]): Promise<OpenRouterChoice> {
    const body = {
      model: OPENROUTER_MODEL,
      messages,
      tools: TOOL_DEFINITIONS,
      tool_choice: "auto",
    };

    const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + this.apiKey,
        "Content-Type": "application/json",
        "HTTP-Referer": window.location.origin,
        "X-Title": "webmap_ai demo",
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`OpenRouter error ${resp.status}: ${errText}`);
    }

    const json = (await resp.json()) as { choices: OpenRouterChoice[] };
    const choice = json.choices[0];
    if (!choice) throw new Error("Empty response from OpenRouter");
    return choice;
  }

  private async sendViaMock(userMessage: string): Promise<ChatMessage> {
    await new Promise((resolve) => setTimeout(resolve, 400));

    const toolCalls = inferToolCalls(userMessage);
    const routerResponse = await this.router.run({ message: userMessage, toolCalls });
    const toolSummary = formatToolResultsAsText(routerResponse);
    const text = buildMockReply(userMessage, toolSummary);

    return {
      id: crypto.randomUUID(),
      role: "assistant",
      content: text,
      toolResults: routerResponse.toolResults,
    };
  }
}
