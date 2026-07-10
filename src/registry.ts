/**
 * Central tool registry — the single source of truth for the assistant's
 * tool surface.
 *
 * Every entry carries:
 *   - `name`        — canonical tool identifier (matches `MapAssistantToolName`)
 *   - `description` — natural-language description sent to the LLM
 *   - `parameters`  — JSON-Schema object used in the LLM prompt and for
 *                     runtime argument validation
 *
 * Both the backend system prompt and the frontend router are derived from
 * this registry so they can never drift.
 */

import type { MapAssistantToolCall } from "./tools.js";
import type {
  MapCenter,
  MapBounds,
  QueryFeaturesArgs,
  SetFilterArgs,
  SetViewArgs,
} from "./types.js";

// ---- JSON-Schema types (minimal, sufficient for tool parameters) ----------

export interface JsonSchemaProperty {
  type: string;
  description?: string;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
  items?: JsonSchemaProperty;
}

export interface JsonSchemaObject {
  type: "object";
  properties: Record<string, JsonSchemaProperty>;
  required?: string[];
}

// ---- Registry entry -------------------------------------------------------

export interface ToolRegistryEntry {
  /** Canonical tool name. */
  name: string;
  /** Human-readable description sent to the LLM. */
  description: string;
  /** JSON-Schema parameter definition for this tool. */
  parameters: JsonSchemaObject;
}

// ---- Registry -------------------------------------------------------------

export const TOOL_REGISTRY: readonly ToolRegistryEntry[] = [
  {
    name: "list_layers",
    description: "List all available map layers with their visibility status.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "get_map_state",
    description:
      "Get current map state including bounding box, center, zoom level, bearing, pitch, and selected feature IDs.",
    parameters: { type: "object", properties: {} },
  },
  {
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
  {
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
  {
    name: "query_features",
    description:
      "Query features from a layer using a SQL WHERE clause. Only read-only SELECT statements are allowed.",
    parameters: {
      type: "object",
      properties: {
        layerId: { type: "string", description: "The layer to query." },
        where: {
          type: "string",
          description: "SQL WHERE clause to filter features (e.g. \"name = 'Paris'\").",
        },
        limit: { type: "number", description: "Maximum number of features to return." },
      },
      required: ["layerId"],
    },
  },
  {
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
        bounds: {
          type: "object",
          description: "Map bounds as {west, south, east, north}.",
          properties: {
            west: { type: "number" },
            south: { type: "number" },
            east: { type: "number" },
            north: { type: "number" },
          },
        },
        bearing: { type: "number", description: "Map bearing in degrees." },
        pitch: { type: "number", description: "Map pitch in degrees." },
      },
    },
  },
  {
    name: "select_features",
    description: "Highlight or select specific features on the map.",
    parameters: {
      type: "object",
      properties: {
        layerId: { type: "string", description: "The layer containing the features." },
        featureIds: {
          type: "array",
          description: "IDs of the features to select.",
          items: { type: "string" },
        },
      },
      required: ["layerId", "featureIds"],
    },
  },
  {
    name: "clear_selection",
    description: "Clear the current feature selection on the map.",
    parameters: { type: "object", properties: {} },
  },
  {
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
  {
    name: "set_filter",
    description: "Apply a SQL WHERE clause filter to a layer.",
    parameters: {
      type: "object",
      properties: {
        layerId: { type: "string", description: "The layer to filter." },
        where: {
          type: "string",
          description: "SQL WHERE clause to filter the layer's features.",
        },
      },
      required: ["layerId", "where"],
    },
  },
] as const;

/** Fast O(1) lookup of valid tool names. */
export const KNOWN_TOOL_NAMES: ReadonlySet<string> = new Set(TOOL_REGISTRY.map((t) => t.name));

// ---- Runtime parser / validator ------------------------------------------

/**
 * Parse and validate a raw tool call from untrusted model output.
 *
 * Returns a fully-typed `MapAssistantToolCall` on success, or `null` when the
 * tool name is unknown or required arguments are missing / have the wrong type.
 * No side effects are performed.
 *
 * @param name    - Tool name string from the model output.
 * @param rawArgs - Raw arguments object (or undefined) from the model output.
 */
export function parseToolCall(name: string, rawArgs: unknown): MapAssistantToolCall | null {
  const a = isRecord(rawArgs) ? rawArgs : {};

  switch (name) {
    case "list_layers":
      return { name: "list_layers" };

    case "get_map_state":
      return { name: "get_map_state" };

    case "clear_selection":
      return { name: "clear_selection" };

    case "get_layer_schema": {
      if (!isNonEmptyString(a["layerId"])) return null;
      return { name: "get_layer_schema", args: { layerId: a["layerId"] } };
    }

    case "query_visible_features": {
      if (!isNonEmptyString(a["layerId"])) return null;
      const qvfArgs = { layerId: a["layerId"] } as { layerId: string; limit?: number };
      if (typeof a["limit"] === "number") qvfArgs.limit = a["limit"];
      return { name: "query_visible_features", args: qvfArgs };
    }

    case "query_features": {
      if (!isNonEmptyString(a["layerId"])) return null;
      const qfArgs: QueryFeaturesArgs = { layerId: a["layerId"] };
      if (typeof a["where"] === "string") qfArgs.where = a["where"];
      if (typeof a["limit"] === "number") qfArgs.limit = a["limit"];
      return { name: "query_features", args: qfArgs };
    }

    case "set_view": {
      const setViewArgs: SetViewArgs = {};
      if (typeof a["zoom"] === "number") setViewArgs.zoom = a["zoom"];
      if (typeof a["bearing"] === "number") setViewArgs.bearing = a["bearing"];
      if (typeof a["pitch"] === "number") setViewArgs.pitch = a["pitch"];

      const rawCenter = a["center"];
      if (isRecord(rawCenter) && typeof rawCenter["lng"] === "number" && typeof rawCenter["lat"] === "number") {
        setViewArgs.center = { lng: rawCenter["lng"], lat: rawCenter["lat"] } as MapCenter;
      }

      const rawBounds = a["bounds"];
      if (
        isRecord(rawBounds) &&
        typeof rawBounds["west"] === "number" &&
        typeof rawBounds["south"] === "number" &&
        typeof rawBounds["east"] === "number" &&
        typeof rawBounds["north"] === "number"
      ) {
        setViewArgs.bounds = {
          west: rawBounds["west"],
          south: rawBounds["south"],
          east: rawBounds["east"],
          north: rawBounds["north"],
        } as MapBounds;
      }

      return { name: "set_view", args: setViewArgs };
    }

    case "select_features": {
      if (!isNonEmptyString(a["layerId"])) return null;
      if (!Array.isArray(a["featureIds"])) return null;
      return {
        name: "select_features",
        args: {
          layerId: a["layerId"],
          featureIds: a["featureIds"].map(String),
        },
      };
    }

    case "set_layer_visibility": {
      if (!isNonEmptyString(a["layerId"])) return null;
      if (typeof a["visible"] !== "boolean") return null;
      return {
        name: "set_layer_visibility",
        args: { layerId: a["layerId"], visible: a["visible"] },
      };
    }

    case "set_filter": {
      if (!isNonEmptyString(a["layerId"])) return null;
      if (typeof a["where"] !== "string") return null;
      const sfArgs: SetFilterArgs = { layerId: a["layerId"], where: a["where"] };
      return { name: "set_filter", args: sfArgs };
    }

    default:
      return null;
  }
}

// ---- Helpers -------------------------------------------------------------

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/** Returns true when `v` is a string with at least one non-whitespace character. */
function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim() !== "";
}
