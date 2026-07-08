"""Anthropic LLM provider using the Messages API with tool use."""

from __future__ import annotations

import os
from typing import Any

from backend.models import ChatResponse, MapContext, ToolCall
from backend.providers.base import LLMProvider

try:
    import anthropic
except ImportError as exc:  # pragma: no cover
    raise ImportError(
        "anthropic package is required for AnthropicProvider. "
        "Install it with: pip install anthropic"
    ) from exc


def _build_system_prompt(map_context: MapContext) -> str:
    """Construct a system prompt that injects the current map state."""
    parts = [
        "You are a helpful map assistant. You have access to tools that let you "
        "inspect and interact with a web map. Use them when relevant.",
        "",
        "Current map context:",
    ]

    if map_context.bbox:
        b = map_context.bbox
        parts.append(
            f"  Bounding box: west={b.west}, south={b.south}, east={b.east}, north={b.north}"
        )
    if map_context.zoom is not None:
        parts.append(f"  Zoom: {map_context.zoom}")
    if map_context.center:
        parts.append(f"  Center: lng={map_context.center.lng}, lat={map_context.center.lat}")
    if map_context.visible_layers:
        parts.append(f"  Visible layers: {', '.join(map_context.visible_layers)}")
    if map_context.selected_feature_ids:
        parts.append(f"  Selected feature IDs: {', '.join(map_context.selected_feature_ids)}")

    return "\n".join(parts)


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
    ) -> ChatResponse:
        system_prompt = _build_system_prompt(map_context)
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
