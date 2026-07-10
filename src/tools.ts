import type {
  QueryVisibleFeaturesArgs,
  QueryFeaturesArgs,
  SelectFeaturesArgs,
  SetFilterArgs,
  SetViewArgs,
} from "./types.js";

export type MapAssistantToolName =
  | "list_layers"
  | "get_map_state"
  | "get_layer_schema"
  | "query_visible_features"
  | "query_features"
  | "set_view"
  | "select_features"
  | "clear_selection"
  | "set_layer_visibility"
  | "set_filter";

export type MapAssistantToolCall =
  | { name: "list_layers" }
  | { name: "get_map_state" }
  | { name: "get_layer_schema"; args: { layerId: string } }
  | { name: "query_visible_features"; args: QueryVisibleFeaturesArgs }
  | { name: "query_features"; args: QueryFeaturesArgs }
  | { name: "set_view"; args: SetViewArgs }
  | { name: "select_features"; args: SelectFeaturesArgs }
  | { name: "clear_selection" }
  | { name: "set_layer_visibility"; args: { layerId: string; visible: boolean } }
  | { name: "set_filter"; args: SetFilterArgs };

export interface AssistantRequest {
  message: string;
  /**
   * Tool calls to execute. Accepts both fully-typed `MapAssistantToolCall`
   * values and raw `{ name; args? }` objects from untrusted model output —
   * the router validates every call at runtime via `parseToolCall`.
   */
  toolCalls: ReadonlyArray<{ name: string; args?: unknown }>;
}

export interface AssistantResponse {
  text: string;
  toolResults: Array<{
    /** The tool name as received from the model; may be unknown when the call was rejected. */
    name: string;
    ok: boolean;
    sql?: string;
    data?: unknown;
    error?: string;
  }>;
}
