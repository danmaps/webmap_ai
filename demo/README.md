# webmap_ai Demo

A minimal browser app showing a **MapLibre** map with a right-side **AI assistant panel**, wired to the `MapAssistantRouter` and `MapLibreMapAssistantAdapter` from the root package.

## Quick start

```bash
cd demo
npm install
npm run dev
```

Then open **http://localhost:5173**.

## Layers

| Layer | Type | Description |
|---|---|---|
| US Regions | fill | Five colour-coded geographic regions |
| Interstate Highways | line | I-10, I-80, I-95 routes |
| Major US Cities | circle + labels | 15 largest US cities with population |

## AI backend options

The assistant picks the first configured option, in priority order:

### Option 1 — FastAPI backend (recommended)

The `backend/` directory (repo root) provides a FastAPI server that handles LLM tool-calling with full map context.

```bash
# In one terminal — start the backend
cd ..
pip install -r requirements.txt
cp .env.example .env       # add OPENAI_API_KEY or ANTHROPIC_API_KEY
uvicorn backend.main:app --reload

# In another terminal — start the demo
cd demo
cp .env.example .env       # set VITE_BACKEND_URL=http://localhost:8000
npm run dev
```

### Option 2 — OpenRouter (browser-side)

Calls OpenAI-compatible models directly from the browser via [OpenRouter](https://openrouter.ai).

```bash
cp .env.example .env
# Edit .env and set VITE_OPENROUTER_API_KEY=sk-or-...
npm run dev
```

### Option 3 — Mock responses (no key required)

Without any key or backend URL the assistant uses keyword-based tool inference and runs every call through the real `MapAssistantRouter` — the router/adapter contract is exercised even without an API key.

## How it works

```
User message
    │
    ▼
AssistantService
    ├─ VITE_BACKEND_URL set  → POST /chat {message, map_context} → {text, tool_calls}
    ├─ VITE_OPENROUTER_API_KEY set → call OpenRouter → parse tool_calls from response
    └─ neither → infer tool calls from message keywords
          │
          ▼
    MapAssistantRouter.run({ message, toolCalls })
          │
          ▼
    MapLibreMapAssistantAdapter
    (reads / writes the live MapLibre map instance)
          │
          ▼
    AssistantPanel renders text + collapsible tool results
```
