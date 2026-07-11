# webmap_ai

[![CI](https://github.com/danmaps/webmap_ai/actions/workflows/ci.yml/badge.svg)](https://github.com/danmaps/webmap_ai/actions/workflows/ci.yml)

Provider-neutral AI assistant infrastructure for web maps.

`webmap_ai` brings an ArcGIS Assistant-style interaction model to **non-Esri** maps — without depending on Esri's AI components or map stack. It lets any web map expose a safe, typed, inspectable set of map-aware tools to an LLM.

The assistant is not tied to a single provider. The same tool router drives many map runtimes:

- MapLibre
- Leaflet
- OpenLayers
- custom canvas maps
- Three.js-based spatial scenes

## Architecture

`webmap_ai` is built from a few composable pieces:

- a reusable assistant panel
- a bounded tool router
- provider-specific map adapters
- typed command schemas
- inspectable backend query and action flows

## The map adapter

The **map adapter** is the seam that lets the assistant talk to different map runtimes through one stable interface. Implement it once per map library and the rest of the stack works unchanged:

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

This gives the model a controlled toolbox instead of unrestricted UI control.

## What's included

The provider-neutral TypeScript core:

- `src/adapter.ts` — `MapAssistantAdapter` contract
- `src/types.ts` — shared map/layer/query types
- `src/tools.ts` — typed assistant tool-call schema
- `src/router.ts` — bounded tool router/executor
- `src/adapters/memory.ts` — in-memory adapter for local demos/tests
- `src/adapters/maplibre.ts` — adapter that drives a live MapLibre map

A runnable MapLibre demo lives in [`demo/`](./demo), and a FastAPI backend for
LLM tool-calling lives in [`backend/`](./backend).

## Getting started

### Install

```bash
npm install
npm run build
```

### Minimal usage

```ts
import { MapAssistantRouter, MemoryMapAssistantAdapter } from "webmap_ai";

const adapter = new MemoryMapAssistantAdapter({
  mapState: {
    bounds: { west: -123, south: 37, east: -121, north: 38 },
    center: { lng: -122, lat: 37.5 },
    zoom: 9,
    selectedFeatureIds: [],
  },
  layers: [
    {
      summary: { id: "cities", name: "Cities", type: "geojson", visible: true },
      schema: { layerId: "cities", fields: [{ name: "name", type: "string" }] },
      features: [{ id: "1", layerId: "cities", properties: { name: "Oakland" } }],
    },
  ],
});

const router = new MapAssistantRouter(adapter);

const response = await router.run({
  message: "What layers are loaded?",
  toolCalls: [{ name: "list_layers" }, { name: "get_map_state" }],
});
```

### With a live MapLibre map

`MapLibreMapAssistantAdapter` wraps an existing MapLibre map instance, so the
same router drives real map reads and writes:

```ts
import maplibregl from "maplibre-gl";
import { MapAssistantRouter, MapLibreMapAssistantAdapter } from "webmap_ai";

const map = new maplibregl.Map({
  container: "map",
  style: "https://demotiles.maplibre.org/style.json",
  center: [-122, 37.5],
  zoom: 9,
});

const adapter = new MapLibreMapAssistantAdapter(map);
const router = new MapAssistantRouter(adapter);

const response = await router.run({
  message: "Zoom to the cities layer and tell me what's visible.",
  toolCalls: [{ name: "get_map_state" }, { name: "list_layers" }],
});
```

## Demo app

A runnable MapLibre demo with a right-side assistant panel lives in
[`demo/`](./demo):

```bash
cd demo
npm install
npm run dev
```

Then open **http://localhost:5173**. The demo works with no API key (keyword-based
tool inference through the real router), or you can wire it to the FastAPI
backend or an OpenRouter key for full LLM tool-calling. See
[`demo/README.md`](./demo/README.md) for the options.

## Design principles

- Provider-neutral, not Esri-dependent
- Typed tool calls over vague agent behavior
- Read-only before write-capable
- Deterministic query and stats logic in code, not in the model
- Human confirmation for consequential actions
- Reusable across many map products, not trapped inside one demo

## Backend

The `backend/` Python package provides a FastAPI server that forwards
map-aware chat messages to an LLM (OpenAI, OpenRouter, or Anthropic) using tool-calling.

### Quick start

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Copy and fill in environment variables
cp .env.example .env
# then set OPENAI_API_KEY, OPENROUTER_API_KEY, or ANTHROPIC_API_KEY

# 3. Run the development server
uvicorn backend.main:app --reload
```

### `POST /chat`

**Request**

```json
{
  "message": "What layers are loaded?",
  "map_context": {
    "bbox": { "west": -123, "south": 37, "east": -121, "north": 38 },
    "zoom": 9,
    "visible_layers": ["cities", "roads"],
    "selected_feature_ids": []
  }
}
```

**Response**

```json
{
  "text": "I'll check what layers are available.",
  "tool_calls": [
    { "name": "list_layers", "args": {} },
    { "name": "get_map_state", "args": {} }
  ]
}
```

The `tool_calls` list is returned as structured commands for the frontend to
execute via the TypeScript `MapAssistantRouter`.  The backend does **not**
execute tools itself – it stays stateless and lets the browser-side adapter
do all map interactions.

### Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `LLM_PROVIDER` | No | `openai` | `openai`, `openrouter`, or `anthropic` |
| `OPENAI_API_KEY` | When `LLM_PROVIDER=openai` | — | OpenAI API key |
| `OPENAI_MODEL` | No | `gpt-4o-mini` | OpenAI model name |
| `OPENROUTER_API_KEY` | When `LLM_PROVIDER=openrouter` | — | OpenRouter API key |
| `OPENROUTER_MODEL` | No | `openai/gpt-4o-mini` | OpenRouter model name |
| `OPENROUTER_HTTP_REFERER` | No | `https://dannymcvey.com` | OpenRouter referer header |
| `OPENROUTER_X_TITLE` | No | `webmap_ai backend` | OpenRouter title header |
| `ANTHROPIC_API_KEY` | When `LLM_PROVIDER=anthropic` | — | Anthropic API key |
| `ANTHROPIC_MODEL` | No | `claude-3-5-haiku-latest` | Anthropic model name |

### Running tests

TypeScript package (router + adapters), powered by [Vitest](https://vitest.dev):

```bash
npm install
npm run typecheck   # type-only check (no emit)
npm test            # run the runtime test suite
npm run test:watch  # watch mode during development
```

Python backend:

```bash
python -m pytest backend/tests/ -v
```

## Releasing

Continuous integration (`.github/workflows/ci.yml`) runs `npm ci`, `typecheck`,
`build`, and `test` on every push and pull request.

Publishing to npm is automated by `.github/workflows/release.yml` and triggered
by pushing a version tag:

```bash
# 1. Bump the version and create a matching git tag
npm version patch        # or: minor / major

# 2. Push the commit and the tag
git push --follow-tags
```

The release workflow re-runs the build and tests, validates the package with
`npm publish --dry-run`, then publishes to npm using
[trusted publishing (OIDC)](https://docs.npmjs.com/trusted-publishers/) — no
long-lived npm token is stored in the repository. Provenance attestations are
generated automatically.

> **One-time setup on npmjs.com:** open the package's
> **Settings → Trusted Publisher**, choose **GitHub Actions**, and configure:
>
> | Field | Value |
> |---|---|
> | Organization or user | `danmaps` |
> | Repository | `webmap_ai` |
> | Workflow filename | `release.yml` |
> | Environment | _(leave blank)_ |
>
> You can add the trusted publisher before the package's first publish — just
> enter the package name (`webmap_ai`) when prompted. The workflow already
> requests the required `id-token: write` permission and upgrades npm to a
> version that supports OIDC.

To preview what would be published without releasing:

```bash
npm run build
npm publish --dry-run
```

## Status

Provider-neutral TypeScript core (router, tool schema, memory + MapLibre
adapters), a FastAPI backend with LLM tool-calling, a MapLibre demo app, and a
CI + trusted-publishing release pipeline. Read-only tools are the current focus,
with reversible write actions rolling out behind explicit confirmation.
