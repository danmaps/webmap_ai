"""OpenRouter LLM provider using the OpenAI-compatible chat-completions API."""

from __future__ import annotations

import json
import os
from typing import Any

from backend.context import build_system_prompt
from backend.models import ChatResponse, MapContext, ToolCall
from backend.providers.base import LLMProvider

try:
    from openai import AsyncOpenAI
except ImportError as exc:  # pragma: no cover
    raise ImportError(
        "openai package is required for OpenRouterProvider. "
        "Install it with: pip install openai"
    ) from exc


def _to_openai_tools(tools: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "type": "function",
            "function": {
                "name": t["name"],
                "description": t["description"],
                "parameters": t["parameters"],
            },
        }
        for t in tools
    ]


class OpenRouterProvider(LLMProvider):
    """Calls OpenRouter's OpenAI-compatible chat-completions endpoint."""

    def __init__(self) -> None:
        api_key = os.environ.get("OPENROUTER_API_KEY")
        if not api_key:
            raise ValueError("OPENROUTER_API_KEY environment variable is not set.")

        self._client = AsyncOpenAI(
            api_key=api_key,
            base_url=os.environ.get("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"),
        )
        self._model = os.environ.get("OPENROUTER_MODEL", "openai/gpt-4o-mini")
        self._referer = os.environ.get("OPENROUTER_HTTP_REFERER", "https://dannymcvey.com").strip()
        self._title = os.environ.get("OPENROUTER_X_TITLE", "webmap_ai backend").strip()

    async def chat(
        self,
        message: str,
        map_context: MapContext,
        tools: list[dict[str, Any]],
    ) -> ChatResponse:
        system_prompt = build_system_prompt(map_context)
        openai_tools = _to_openai_tools(tools)

        response = await self._client.chat.completions.create(
            model=self._model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": message},
            ],
            tools=openai_tools,
            tool_choice="auto",
            extra_headers={
                "HTTP-Referer": self._referer,
                "X-Title": self._title,
            },
        )

        choice = response.choices[0]
        text = choice.message.content or ""

        tool_calls: list[ToolCall] = []
        if choice.message.tool_calls:
            for tc in choice.message.tool_calls:
                try:
                    args = json.loads(tc.function.arguments)
                except (json.JSONDecodeError, AttributeError):
                    args = {}
                tool_calls.append(ToolCall(name=tc.function.name, args=args))

        return ChatResponse(text=text, tool_calls=tool_calls)
