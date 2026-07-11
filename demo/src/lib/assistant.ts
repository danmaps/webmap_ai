import { MapAssistantRouter, MapLibreMapAssistantAdapter, parseToolCall, TOOL_REGISTRY } from "webmap_ai";
import type { MapLibreMapLike } from "webmap_ai";
import type { AssistantResponse, MapAssistantToolCall } from "webmap_ai";

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

const TOOL_DEFINITIONS = TOOL_REGISTRY.map((entry) => ({
  type: "function",
  function: {
    name: entry.name,
    description: entry.description,
    parameters: entry.parameters,
  },
}));

function parseToolCallJson(name: string, argsJson: string): ReturnType<typeof parseToolCall> {
  try {
    const args = argsJson ? (JSON.parse(argsJson) as unknown) : {};
    return parseToolCall(name, args);
  } catch {
    return null;
  }
}

function inferToolCalls(message: string): MapAssistantToolCall[] {
  const lower = message.toLowerCase();
  const calls: MapAssistantToolCall[] = [];

  if (lower.includes("cities") || lower.includes("city")) {
    calls.push({ name: "query_visible_features", args: { layerId: "cities", limit: 5 } });
  } else if (lower.includes("region") || lower.includes("area")) {
    calls.push({ name: "query_visible_features", args: { layerId: "regions", limit: 5 } });
  } else if (lower.includes("highway") || lower.includes("route") || lower.includes("road")) {
    calls.push({ name: "query_visible_features", args: { layerId: "routes", limit: 3 } });
  } else if (lower.includes("layer")) {
    calls.push({ name: "list_layers" });
  } else if (lower.includes("zoom") || lower.includes("pan") || lower.includes("view") || lower.includes("state")) {
    calls.push({ name: "get_map_state" });
  } else {
    calls.push({ name: "list_layers" });
  }

  return calls;
}

function joinNatural(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

type LocalIntentKind =
  | "greeting"
  | "capability"
  | "exploration"
  | "ambiguous"
  | "comparison"
  | "map_action"
  | "read_query";

function normalizeMessage(message: string): string {
  return message.toLowerCase().trim().replace(/\s+/g, " ");
}

function resolveLocalIntent(
  message: string,
  layerNames: string[],
  selectedFeatureIds: string[],
): { kind: LocalIntentKind; directText?: string; promptHint?: string } {
  const lower = normalizeMessage(message);
  const layers = joinNatural(layerNames);

  const capabilityReply = layers
    ? `I can help inspect ${layers} on the map. Ask me what's visible, or tell me to zoom, filter, compare, or inspect something specific.`
    : "I can inspect the current map, answer what's visible, and help with actions like zoom, filter, compare, or inspect. Start with a layer, place, or area.";

  if (!lower) {
    return {
      kind: "ambiguous",
      directText: "What do you want me to do with the map: inspect something, compare areas, or change the view?",
    };
  }

  if (["hi", "hello", "hey", "yo", "sup"].includes(lower) || lower.startsWith("hello ") || lower.startsWith("hey ")) {
    return {
      kind: "greeting",
      directText: "Hi. Ask me about what's visible, or tell me to zoom, filter, compare, or inspect something.",
    };
  }

  if (
    ["what can you do", "how do i use", "help me use", "how can you help", "what do you do"].some((phrase) =>
      lower.includes(phrase),
    )
  ) {
    return { kind: "capability", directText: capabilityReply };
  }

  if (
    [
      "show me something interesting",
      "what stands out",
      "where should i start",
      "give me a quick tour",
      "show me around",
    ].some((phrase) => lower.includes(phrase))
  ) {
    return {
      kind: "exploration",
      directText: layers
        ? `A good place to start is ${layers}. Try asking what's visible, compare two areas, or tell me which layer you want to inspect.`
        : "I do not have much map context yet. Try asking what layers are loaded, what is visible, or what area you want to inspect.",
    };
  }

  if (
    ["compare", "versus", " vs ", "difference between", "similar to"].some((term) => lower.includes(term))
  ) {
    if (["compare this", "compare these", "compare that", "compare those"].some((phrase) => lower.includes(phrase))) {
      return {
        kind: "ambiguous",
        directText:
          selectedFeatureIds.length > 0
            ? "What do you want to compare: the selected features, two layers, or two places on the map?"
            : "What should I compare: two places, two layers, or the current view against another area?",
      };
    }
    return {
      kind: "comparison",
      promptHint:
        "Treat this as a comparison request. Clarify only if the targets are missing; otherwise compare the requested map entities directly.",
    };
  }

  if (["zoom", "pan", "hide", "show", "filter", "highlight", "select", "clear"].some((term) => lower.includes(term))) {
    return {
      kind: "map_action",
      promptHint: "Treat this as a map action request. Prefer doing the requested map operation over merely describing the map.",
    };
  }

  if (
    ["help me inspect", "inspect this", "inspect that", "look at this", "look at that"].some((phrase) =>
      lower.includes(phrase),
    )
  ) {
    return {
      kind: "ambiguous",
      directText:
        "What do you want to inspect there: visible features, a specific layer, or a comparison with another area?",
    };
  }

  return {
    kind: "read_query",
    promptHint: "Treat this as a map reading request. Answer only what was asked and avoid extra scene-setting.",
  };
}

function buildConversationalReply(message: string, response: AssistantResponse): string {
  const lower = message.toLowerCase();
  const okResults = response.toolResults.filter((result) => result.ok);

  if (okResults.length === 0) {
    const failed = response.toolResults.find((result) => !result.ok);
    return failed?.error ?? "I couldn't get that from the map.";
  }

  const layerResult = okResults.find((result) => result.name === "list_layers");
  const mapStateResult = okResults.find((result) => result.name === "get_map_state");
  const visibleResult = okResults.find((result) => result.name === "query_visible_features");
  const queryResult = okResults.find((result) => result.name === "query_features");

  if (lower.includes("layer")) {
    const layers = (layerResult?.data as Array<{ name: string; visible: boolean }> | undefined) ?? [];
    const visibleLayers = layers.filter((layer) => layer.visible).map((layer) => layer.name);
    return visibleLayers.length > 0
      ? `Loaded layers: ${joinNatural(visibleLayers)}.`
      : "No layers are visible right now.";
  }

  if (lower.includes("cities") || lower.includes("city")) {
    const features = (visibleResult?.data as Array<{ id: string; properties: Record<string, unknown> }> | undefined) ?? [];
    const names = features
      .slice(0, 5)
      .map((feature) => String(feature.properties["name"] ?? feature.id));
    if (names.length === 0) return "I don't see any cities in view right now.";
    return `I can see ${joinNatural(names)}.`;
  }

  if (lower.includes("region") || lower.includes("area")) {
    const features = (visibleResult?.data as Array<{ id: string; properties: Record<string, unknown> }> | undefined) ?? [];
    const names = features
      .slice(0, 5)
      .map((feature) => String(feature.properties["name"] ?? feature.id));
    if (names.length === 0) return "I don't see any regions in view right now.";
    return `In view: ${joinNatural(names)}.`;
  }

  if (lower.includes("highway") || lower.includes("route") || lower.includes("road")) {
    const features = (visibleResult?.data as Array<{ id: string; properties: Record<string, unknown> }> | undefined) ?? [];
    const names = features
      .slice(0, 5)
      .map((feature) => String(feature.properties["name"] ?? feature.id));
    if (names.length === 0) return "I don't see any routes in view right now.";
    return `Visible routes: ${joinNatural(names)}.`;
  }

  if (lower.includes("zoom") || lower.includes("pan") || lower.includes("view") || lower.includes("state")) {
    const state = mapStateResult?.data as
      | {
          zoom?: number;
          center?: { lng: number; lat: number };
        }
      | undefined;
    if (!state) return "I couldn't read the current map view.";
    return `The map is at zoom ${((state.zoom ?? 0) as number).toFixed(1)}, centered near ${((state.center?.lng ?? 0) as number).toFixed(2)}, ${((state.center?.lat ?? 0) as number).toFixed(2)}.`;
  }

  if (queryResult) {
    const features = (queryResult.data as Array<{ id: string; properties: Record<string, unknown> }> | undefined) ?? [];
    const names = features
      .slice(0, 5)
      .map((feature) => String(feature.properties["name"] ?? feature.id));
    if (names.length > 0) return `I found ${joinNatural(names)}.`;
  }

  if (layerResult) {
    const layers = (layerResult.data as Array<{ name: string; visible: boolean }> | undefined) ?? [];
    const visibleLayers = layers.filter((layer) => layer.visible).map((layer) => layer.name);
    if (visibleLayers.length > 0) return `Right now I can see ${joinNatural(visibleLayers)}.`;
  }

  return "I checked the map, but I don't have a cleaner answer for that yet.";
}

function buildMockReply(toolSummary: string): string {
  return toolSummary || "Ask for layers, visible features, or the current map state.";
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
      .map((tc) => parseToolCall(tc.name, tc.args ?? {}))
      .filter((tc): tc is MapAssistantToolCall => tc !== null);

    let toolResults: AssistantResponse["toolResults"] = [];
    let fallbackText = "";

    if (toolCalls.length > 0) {
      const routerResponse = await this.router.run({ message: userMessage, toolCalls });
      toolResults = routerResponse.toolResults;
      fallbackText = buildConversationalReply(userMessage, routerResponse);
    }

    const text = json.text || fallbackText || "(No response)";

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
    const visibleLayerNames = layers.filter((l) => l.visible).map((l) => l.name);
    const intent = resolveLocalIntent(userMessage, visibleLayerNames, mapState.selectedFeatureIds);

    if (intent.directText) {
      return {
        id: crypto.randomUUID(),
        role: "assistant",
        content: intent.directText,
      };
    }

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
      "Answer directly.",
      "Lead with the answer, not setup.",
      "Keep it to 1-3 short sentences or a short list.",
      "Do not say phrases like 'Here's what I can see on the map' or explain the demo unless asked.",
      "No emojis.",
      "Use tools when you need fresh data from the map.",
      intent.promptHint ? `User intent guidance: ${intent.promptHint}` : "",
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
        call: parseToolCallJson(tc.function.name, tc.function.arguments),
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
      content: buildConversationalReply(userMessage, { toolResults: allToolResults } as AssistantResponse) ||
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

    const mapState = await this.adapter.getMapState();
    const layers = await this.adapter.listLayers();
    const visibleLayerNames = layers.filter((l) => l.visible).map((l) => l.name);
    const intent = resolveLocalIntent(userMessage, visibleLayerNames, mapState.selectedFeatureIds);

    if (intent.directText) {
      return {
        id: crypto.randomUUID(),
        role: "assistant",
        content: intent.directText,
      };
    }

    const toolCalls = inferToolCalls(userMessage);
    const routerResponse = await this.router.run({ message: userMessage, toolCalls });
    const text = buildMockReply(buildConversationalReply(userMessage, routerResponse));

    return {
      id: crypto.randomUUID(),
      role: "assistant",
      content: text,
      toolResults: routerResponse.toolResults,
    };
  }
}
