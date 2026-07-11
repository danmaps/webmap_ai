"""OpenAI LLM provider using the chat-completions tool-calling API."""

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
        "openai package is required for OpenAIProvider. "
        "Install it with: pip install openai"
    ) from exc


def _to_openai_tools(tools: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Convert generic tool definitions to the OpenAI function-calling format."""
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


class OpenAIProvider(LLMProvider):
    """Calls OpenAI's chat-completions endpoint with tool-calling enabled.

    Required environment variable:
        OPENAI_API_KEY  – your OpenAI API key.

    Optional environment variable:
        OPENAI_MODEL    – model name (default: gpt-4o-mini).
    """

    def __init__(self) -> None:
        api_key = os.environ.get("OPENAI_API_KEY")
        if not api_key:
            raise ValueError("OPENAI_API_KEY environment variable is not set.")
        self._client = AsyncOpenAI(api_key=api_key)
        self._model = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")

    async def chat(
        self,
        message: str,
        map_context: MapContext,
        tools: list[dict[str, Any]],
        intent_hint: str | None = None,
    ) -> ChatResponse:
        system_prompt = build_system_prompt(map_context, intent_hint=intent_hint)
        openai_tools = _to_openai_tools(tools)

        response = await self._client.chat.completions.create(
            model=self._model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": message},
            ],
            tools=openai_tools,
            tool_choice="auto",
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
