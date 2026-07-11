"""Abstract base class for LLM provider integrations."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

from backend.models import ChatResponse, MapContext


class LLMProvider(ABC):
    """Minimal interface that every LLM provider must implement.

    Concrete implementations live in ``backend/providers/openai.py`` and
    ``backend/providers/anthropic.py``.  Swapping the vendor means changing
    a single environment variable – the rest of the application stays the
    same.
    """

    @abstractmethod
    async def chat(
        self,
        message: str,
        map_context: MapContext,
        tools: list[dict[str, Any]],
        intent_hint: str | None = None,
    ) -> ChatResponse:
        """Send a message to the LLM and return a structured response.

        Parameters
        ----------
        message:
            The user's natural-language message.
        map_context:
            Current map viewport state forwarded from the frontend.
        tools:
            JSON-Schema tool definitions to expose as function calls.
        intent_hint:
            Optional extra steering guidance derived from lightweight intent
            classification before the provider call.

        Returns
        -------
        ChatResponse
            ``text`` holds the model's prose reply; ``tool_calls`` is the
            (possibly empty) list of tool invocations the model requested.
        """
