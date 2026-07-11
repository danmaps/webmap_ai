"""Anthropic LLM provider using the Messages API with tool use."""

from __future__ import annotations

import os
from typing import Any

from backend.context import build_system_prompt
from backend.models import ChatResponse, MapContext, ToolCall
from backend.providers.base import LLMProvider

try:
    import anthropic
except ImportError as exc:  # pragma: no cover
    raise ImportError(
        "anthropic package is required for AnthropicProvider. "
        "Install it with: pip install anthropic"
    ) from exc


def _to_anthropic_tools(tools: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Convert generic tool definitions to the Anthropic tool-use format."""
    return [
        {
            "name": t["name"],
            "description": t["description"],
            "input_schema": t["parameters"],
        }
        for t in tools
    ]


class AnthropicProvider(LLMProvider):
    """Calls Anthropic's Messages API with tool-use enabled.

    Required environment variable:
        ANTHROPIC_API_KEY  – your Anthropic API key.

    Optional environment variable:
        ANTHROPIC_MODEL    – model name (default: claude-3-5-haiku-latest).
    """

    def __init__(self) -> None:
        api_key = os.environ.get("ANTHROPIC_API_KEY")
        if not api_key:
            raise ValueError("ANTHROPIC_API_KEY environment variable is not set.")
        self._client = anthropic.AsyncAnthropic(api_key=api_key)
        self._model = os.environ.get("ANTHROPIC_MODEL", "claude-3-5-haiku-latest")

    async def chat(
        self,
        message: str,
        map_context: MapContext,
        tools: list[dict[str, Any]],
        intent_hint: str | None = None,
    ) -> ChatResponse:
        system_prompt = build_system_prompt(map_context, intent_hint=intent_hint)
        anthropic_tools = _to_anthropic_tools(tools)

        response = await self._client.messages.create(
            model=self._model,
            max_tokens=1024,
            system=system_prompt,
            messages=[{"role": "user", "content": message}],
            tools=anthropic_tools,
        )

        text_parts: list[str] = []
        tool_calls: list[ToolCall] = []

        for block in response.content:
            if block.type == "text":
                text_parts.append(block.text)
            elif block.type == "tool_use":
                tool_calls.append(
                    ToolCall(
                        name=block.name,
                        args=block.input if isinstance(block.input, dict) else {},
                    )
                )

        return ChatResponse(text=" ".join(text_parts), tool_calls=tool_calls)
