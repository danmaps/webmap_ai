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

## OpenRouter API key (optional)

Copy `.env.example` to `.env` and add your key:

```bash
cp .env.example .env
# then edit .env and set VITE_OPENROUTER_API_KEY=sk-or-...
```

Get a key at <https://openrouter.ai/keys>. Without a key the assistant uses
**mock responses** that still run every tool call through the real
`MapAssistantRouter`, so the router/adapter contract is exercised even without
an API key.

## How it works

```
User message
    │
    ▼
AssistantService
    ├─ (no key) infer tool calls from message text
    └─ (key set) call OpenRouter → parse tool_calls from response
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
