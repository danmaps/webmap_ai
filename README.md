# webmap_ai

Provider-neutral AI assistant infrastructure for web maps.

`webmap_ai` is meant to bring an ArcGIS Assistant-style interaction model to **non-Esri** maps without depending on Esri's AI components or map stack.

The goal is simple:

> let any web map expose a safe, typed, inspectable set of map-aware tools to an LLM.

Instead of binding the assistant to one provider, `webmap_ai` should make the assistant reusable across:

- MapLibre
- Leaflet
- OpenLayers
- custom canvas maps
- Three.js-based spatial scenes

## Core idea

Copy the **pattern**, not the dependency.

The ArcGIS sample pattern is:

1. chat UI
2. LLM orchestrator
3. registered map-aware agents
4. live reference to the current map

`webmap_ai` should recreate that structure for open web maps through:

- a reusable assistant panel
- a bounded tool router
- provider-specific map adapters
- typed command schemas
- inspectable backend query and action flows

## Working thesis

The most important abstraction is the **map adapter**.

The adapter is the seam that lets the assistant talk to different map runtimes through one stable interface.

Example shape:

```ts
export interface MapAssistantAdapter {
  getMapState(): Promise<MapState>;
  listLayers(): Promise<LayerSummary[]>;
  getLayerSchema(layerId: string): Promise<LayerSchema>;
  queryVisibleFeatures(args: QueryVisibleFeaturesArgs): Promise<FeatureSample[]>;
  queryFeatures(args: QueryFeaturesArgs): Promise<FeatureSample[]>;
  setView(args: SetViewArgs): Promise<void>;
  selectFeatures(args: SelectFeaturesArgs): Promise<void>;
  clearSelection(): Promise<void>;
  setLayerVisibility(layerId: string, visible: boolean): Promise<void>;
  setFilter(args: SetFilterArgs): Promise<void>;
}
```

That gives the model a controlled toolbox instead of unrestricted UI control.

## Design principles

- Provider-neutral, not Esri-dependent
- Typed tool calls over vague agent behavior
- Read-only before write-capable
- Deterministic query and stats logic in code, not in the model
- Human confirmation for consequential actions
- Reusable across many map products, not trapped inside one demo

## Likely first tool set

- `list_layers`
- `get_map_state`
- `describe_visible_map`
- `query_visible_features`
- `summarize_layer`
- `zoom_to_layer`
- `zoom_to_feature`
- `filter_layer`
- `select_features`
- `clear_selection`

## Recommended implementation direction

### Frontend

- React + TypeScript
- MapLibre as the primary target
- Leaflet as the fastest secondary adapter
- reusable assistant panel beside the map

### Backend

- FastAPI
- LLM tool-calling layer
- GeoPandas / DuckDB / SQLite / PostGIS depending on scale
- optional embeddings layer for map and metadata retrieval

### Deployment

- frontend on Vercel or Netlify
- backend on Render, Fly.io, or Cloud Run

## Suggested rollout

### Phase 1

Read-only assistant for one map:

- list layers
- inspect current map state
- summarize visible features
- answer structured questions about visible data

### Phase 2

Navigation tools:

- zoom to layer
- zoom to feature
- pan to location
- reset view

### Phase 3

Deterministic data exploration:

- group by
- top N
- filtering
- summary statistics
- spatial filtering

### Phase 4

Portable metadata and embeddings:

- `map-assistant.json`
- layer descriptions
- field aliases
- suggested questions
- embedding-backed retrieval

### Phase 5

Controlled reversible actions:

- layer visibility
- filters
- style changes
- selections
- export current result set

## Product angle

This can become a strong open-source project if it is framed clearly:

> ArcGIS Assistant-style natural language interaction for any web map.

The wedge is **not** “chat with a map.”

The wedge is:

> a small adapter layer that lets any map expose safe, typed, inspectable tools to an LLM.

## Relationship to adjacent work

This could eventually sit in a small family of related projects:

- `arcgispro_ai` → AI inside ArcGIS Pro
- `webmap_ai` → AI inside open web maps
- `map-assistant-core` → shared contracts, prompts, and tool schemas

## First practical milestone

Build one strong demo before trying to generalize too early.

Best first milestone:

1. load one MapLibre map with 2–3 real layers
2. add a right-side assistant panel
3. send the backend:
   - user prompt
   - current bbox
   - zoom
   - visible layers
   - selected feature ids
4. allow only a small set of structured map tools
5. return text plus optional map commands

That is enough to prove the interaction model without getting lost in agent-platform sprawl.

## Status

Initial repo scaffold.

The next useful additions are:

- repo/file layout
- command schemas
- adapter interfaces
- first demo app
- backend tool routing prototype
