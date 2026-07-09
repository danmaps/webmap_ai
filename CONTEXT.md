# Assistant Context — What Leaves the Browser

This document describes exactly what data is sent to the LLM provider when the
assistant processes a user message, and what stays local in the browser.

## Sent to the provider (schema + view state only)

The `buildAssistantContext()` function (TypeScript) and `build_assistant_context()`
(Python backend) assemble a context payload that contains **only**:

| Category | Fields | Example |
|---|---|---|
| **Map viewport** | `bounds` (west/south/east/north), `center` (lng/lat), `zoom`, `bearing`, `pitch` | `zoom: 9`, `center: {lng: -122, lat: 37.5}` |
| **Layer names** | Visible layer IDs/names | `["cities", "roads"]` |
| **Layer schemas** | Per-layer `geometryType` + field `name`/`type` | `{geometryType: "point", fields: [{name: "population", type: "number"}]}` |
| **Selection IDs** | Feature IDs currently selected (IDs only) | `["c1", "r1"]` |

### TypeScript (`src/context.ts`)

```typescript
import { buildAssistantContext } from "webmap_ai";

const ctx = await buildAssistantContext(adapter);
// ctx.mapState  — viewport bounds, zoom, center, selectedFeatureIds
// ctx.layers    — id, name, type, visible, geometryType, fields[]
```

### Python backend (`backend/context.py`)

```python
from backend.context import build_assistant_context, build_system_prompt

ctx = build_assistant_context(map_context)   # dict with names/schema/view
prompt = build_system_prompt(map_context)    # ready-to-use system prompt
```

## Never sent to the provider

The following data **never** appears in the context payload or system prompt:

- **Feature property values** (e.g. city names, population counts, addresses)
- **Geometry coordinates** (point locations, line vertices, polygon rings)
- **Full feature objects** (GeoJSON features, attribute rows)

## How feature data is accessed

Feature data is only touched by **deterministic tool calls** that the LLM
requests and the frontend executes locally:

| Tool | What it does | Data stays local? |
|---|---|---|
| `query_features` | Runs a SQL-style query against a layer | ✅ Executes in-browser; bounded results returned as tool output |
| `query_visible_features` | Samples features in the current viewport | ✅ Same |
| `get_layer_schema` | Returns field names/types (no values) | ✅ Schema only |

Tool outputs (the bounded query results) are returned to the model as
structured tool responses — they are **not** injected into the system prompt
or pre-loaded into the context.

## Design rationale

- **Privacy**: User data (feature values, coordinates) never leaves the browser
  unless an explicit, auditable tool call runs.
- **Cost**: Keeping prompts small (names + schema) avoids token bloat from
  shipping hundreds of feature rows.
- **Inspectability**: The context payload is a small, predictable object that
  can be logged and audited.
