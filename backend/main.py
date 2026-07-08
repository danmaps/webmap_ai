"""FastAPI application – entry point for the webmap_ai backend.

Run locally with:

    uvicorn backend.main:app --reload

Environment variables
---------------------
LLM_PROVIDER     "openai" (default) or "anthropic"
OPENAI_API_KEY   Required when LLM_PROVIDER=openai
OPENAI_MODEL     Optional – defaults to gpt-4o-mini
ANTHROPIC_API_KEY  Required when LLM_PROVIDER=anthropic
ANTHROPIC_MODEL    Optional – defaults to claude-3-5-haiku-latest
"""

from __future__ import annotations

import os

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from backend.models import ChatRequest, ChatResponse
from backend.providers.base import LLMProvider
from backend.tools import TOOL_DEFINITIONS

app = FastAPI(
    title="webmap_ai backend",
    description="FastAPI backend that forwards map-aware chat messages to an LLM with tool-calling.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Provider factory – instantiated lazily so tests can mock env vars easily
# ---------------------------------------------------------------------------

_provider: LLMProvider | None = None


def _get_provider() -> LLMProvider:
    global _provider
    if _provider is not None:
        return _provider

    vendor = os.environ.get("LLM_PROVIDER", "openai").lower()

    if vendor == "openai":
        from backend.providers.openai import OpenAIProvider

        _provider = OpenAIProvider()
    elif vendor == "anthropic":
        from backend.providers.anthropic import AnthropicProvider

        _provider = AnthropicProvider()
    else:
        raise ValueError(
            f"Unknown LLM_PROVIDER '{vendor}'. Supported values: openai, anthropic."
        )

    return _provider


def set_provider(provider: LLMProvider) -> None:
    """Replace the global provider – useful in tests and dependency injection."""
    global _provider
    _provider = provider


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@app.get("/health")
async def health() -> dict[str, str]:
    """Simple liveness check."""
    return {"status": "ok"}


@app.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest) -> ChatResponse:
    """Accept a user message plus map context and return an LLM response.

    The response includes:
    - ``text``       – the model's prose answer (may be empty when tool calls dominate)
    - ``tool_calls`` – structured map commands for the frontend to execute
    """
    try:
        provider = _get_provider()
    except ValueError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    try:
        return await provider.chat(
            message=request.message,
            map_context=request.map_context,
            tools=TOOL_DEFINITIONS,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"LLM provider error: {exc}") from exc
