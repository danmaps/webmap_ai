/**
 * Builds scoped assistant context from a map adapter.
 *
 * The context payload contains **only** schema-level information:
 * - Layer names, types, and visibility
 * - Per-layer geometry type and field names/types
 * - Current map viewport state (bbox, zoom, center, bearing, pitch)
 * - Selected feature IDs
 *
 * **Feature property values and geometries are never included.**
 * Feature data is only accessed by deterministic tools (e.g. `query_features`)
 * whose bounded results are returned as tool outputs.
 *
 * @module
 */

import type { MapAssistantAdapter } from "./adapter.js";
import type { LayerFieldSummary, LayerSchema, LayerSummary, MapState } from "./types.js";

// ---- Public types --------------------------------------------------------

/** Schema-only description of a single layer (no feature data). */
export interface LayerContext {
  id: string;
  name: string;
  type: string;
  visible: boolean;
  geometryType?: string | undefined;
  fields: LayerFieldSummary[];
}

/**
 * The complete context payload sent to an LLM provider.
 *
 * This object is intentionally limited to names, schema metadata, and
 * view-state.  It **never** contains feature property values or geometry
 * coordinates.
 */
export interface AssistantContext {
  /** Current map viewport state. */
  mapState: {
    bounds: MapState["bounds"];
    center: MapState["center"];
    zoom: number;
    bearing?: number | undefined;
    pitch?: number | undefined;
    selectedFeatureIds: string[];
  };
  /** Schema-level summaries for every layer in the map. */
  layers: LayerContext[];
}

// ---- Builder -------------------------------------------------------------

/**
 * Assemble the assistant context from the adapter.
 *
 * Gathers layer summaries, per-layer schemas, and the current map state.
 * Feature property values and geometries are explicitly excluded — they are
 * only ever touched by deterministic tool calls.
 */
export async function buildAssistantContext(
  adapter: MapAssistantAdapter,
): Promise<AssistantContext> {
  const [mapState, layerSummaries] = await Promise.all([
    adapter.getMapState(),
    adapter.listLayers(),
  ]);

  const schemas = await Promise.all(
    layerSummaries.map((l) => adapter.getLayerSchema(l.id)),
  );

  const schemaByLayerId = new Map<string, LayerSchema>();
  for (const schema of schemas) {
    schemaByLayerId.set(schema.layerId, schema);
  }

  const layers: LayerContext[] = layerSummaries.map((summary: LayerSummary) => {
    const schema = schemaByLayerId.get(summary.id);
    return {
      id: summary.id,
      name: summary.name,
      type: summary.type,
      visible: summary.visible,
      geometryType: schema?.geometryType,
      fields: schema?.fields ?? [],
    };
  });

  return {
    mapState: {
      bounds: mapState.bounds,
      center: mapState.center,
      zoom: mapState.zoom,
      bearing: mapState.bearing,
      pitch: mapState.pitch,
      selectedFeatureIds: mapState.selectedFeatureIds,
    },
    layers,
  };
}
