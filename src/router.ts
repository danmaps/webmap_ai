import type { MapAssistantAdapter } from "./adapter.js";
import type { AssistantRequest, AssistantResponse, MapAssistantToolCall } from "./tools.js";

export class MapAssistantRouter {
  public constructor(private readonly adapter: MapAssistantAdapter) {}

  public async run(request: AssistantRequest): Promise<AssistantResponse> {
    const toolResults = [] as AssistantResponse["toolResults"];

    for (const toolCall of request.toolCalls) {
      try {
        const data = await this.dispatch(toolCall);
        toolResults.push({ name: toolCall.name, ok: true, data });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown tool execution error";
        toolResults.push({ name: toolCall.name, ok: false, error: message });
      }
    }

    const succeeded = toolResults.filter((result) => result.ok).length;
    const failed = toolResults.length - succeeded;

    return {
      text: `Processed ${toolResults.length} tool call(s): ${succeeded} succeeded, ${failed} failed.`,
      toolResults,
    };
  }

  private async dispatch(toolCall: MapAssistantToolCall): Promise<unknown> {
    switch (toolCall.name) {
      case "list_layers":
        return this.adapter.listLayers();
      case "get_map_state":
        return this.adapter.getMapState();
      case "get_layer_schema":
        return this.adapter.getLayerSchema(toolCall.args.layerId);
      case "query_visible_features":
        return this.adapter.queryVisibleFeatures(toolCall.args);
      case "query_features":
        return this.adapter.queryFeatures(toolCall.args);
      case "set_view":
        await this.adapter.setView(toolCall.args);
        return null;
      case "select_features":
        await this.adapter.selectFeatures(toolCall.args);
        return null;
      case "clear_selection":
        await this.adapter.clearSelection();
        return null;
      case "set_layer_visibility":
        await this.adapter.setLayerVisibility(toolCall.args.layerId, toolCall.args.visible);
        return null;
      case "set_filter":
        await this.adapter.setFilter(toolCall.args);
        return null;
      default: {
        const exhaustive: never = toolCall;
        throw new Error(`Unsupported tool: ${JSON.stringify(exhaustive)}`);
      }
    }
  }
}
