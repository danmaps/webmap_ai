"""Tests for the /chat endpoint using a stubbed LLM provider."""

from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from backend.main import app, set_provider
from backend.models import ChatResponse, MapContext, ToolCall
from backend.providers.base import LLMProvider


# ---------------------------------------------------------------------------
# Stub provider – returns deterministic responses without calling a real LLM
# ---------------------------------------------------------------------------


class StubProvider(LLMProvider):
    """Provider that returns a fixed response for predictable unit tests."""

    def __init__(self, response: ChatResponse) -> None:
        self._response = response

    async def chat(
        self,
        message: str,
        map_context: MapContext,
        tools: list[dict[str, Any]],
        intent_hint: str | None = None,
    ) -> ChatResponse:
        return self._response


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def reset_provider():
    """Ensure the global provider is reset between tests."""
    yield
    set_provider(None)


@pytest.fixture()
def client():
    return TestClient(app)


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------


def test_health(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


# ---------------------------------------------------------------------------
# /chat – basic response
# ---------------------------------------------------------------------------


def test_chat_returns_text(client: TestClient) -> None:
    stub = StubProvider(ChatResponse(text="There are 2 layers loaded.", tool_calls=[]))
    set_provider(stub)

    payload = {
        "message": "What layers are loaded?",
        "map_context": {
            "zoom": 9,
            "visible_layers": ["cities", "roads"],
            "selected_feature_ids": [],
        },
    }
    response = client.post("/chat", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["text"] == "There are 2 layers loaded."
    assert data["tool_calls"] == []


# ---------------------------------------------------------------------------
# /chat – list_layers tool call
# ---------------------------------------------------------------------------


def test_chat_list_layers_tool_call(client: TestClient) -> None:
    stub = StubProvider(
        ChatResponse(
            text="",
            tool_calls=[ToolCall(name="list_layers", args={})],
        )
    )
    set_provider(stub)

    payload = {
        "message": "List all layers on the map.",
        "map_context": {},
    }
    response = client.post("/chat", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert len(data["tool_calls"]) == 1
    assert data["tool_calls"][0]["name"] == "list_layers"


# ---------------------------------------------------------------------------
# /chat – get_map_state tool call
# ---------------------------------------------------------------------------


def test_chat_get_map_state_tool_call(client: TestClient) -> None:
    stub = StubProvider(
        ChatResponse(
            text="Let me check the map state.",
            tool_calls=[ToolCall(name="get_map_state", args={})],
        )
    )
    set_provider(stub)

    payload = {
        "message": "What is the current map view?",
        "map_context": {
            "bbox": {"west": -123, "south": 37, "east": -121, "north": 38},
            "zoom": 9,
            "visible_layers": [],
            "selected_feature_ids": [],
        },
    }
    response = client.post("/chat", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["tool_calls"][0]["name"] == "get_map_state"


# ---------------------------------------------------------------------------
# /chat – both tools in one response
# ---------------------------------------------------------------------------


def test_chat_multiple_tool_calls(client: TestClient) -> None:
    stub = StubProvider(
        ChatResponse(
            text="I'll inspect the map for you.",
            tool_calls=[
                ToolCall(name="list_layers", args={}),
                ToolCall(name="get_map_state", args={}),
            ],
        )
    )
    set_provider(stub)

    payload = {"message": "Describe the current map.", "map_context": {}}
    response = client.post("/chat", json=payload)
    assert response.status_code == 200
    data = response.json()
    names = [tc["name"] for tc in data["tool_calls"]]
    assert "list_layers" in names
    assert "get_map_state" in names


# ---------------------------------------------------------------------------
# /chat – missing provider returns 503
# ---------------------------------------------------------------------------


def test_chat_no_provider_returns_503(client: TestClient) -> None:
    # Clear provider and ensure env vars don't create a real one
    set_provider(None)
    with patch.dict("os.environ", {"LLM_PROVIDER": "openai"}, clear=False):
        # Patch OpenAIProvider to raise ValueError (simulates missing API key)
        with patch("backend.main._get_provider", side_effect=ValueError("no key")):
            response = client.post("/chat", json={"message": "hello", "map_context": {}})
    assert response.status_code == 503


def test_chat_unknown_provider_returns_503(client: TestClient) -> None:
    set_provider(None)
    with patch.dict("os.environ", {"LLM_PROVIDER": "wat"}, clear=False):
        response = client.post("/chat", json={"message": "hello", "map_context": {}})
    assert response.status_code == 503


# ---------------------------------------------------------------------------
# Request model – default map_context is accepted
# ---------------------------------------------------------------------------


def test_chat_default_map_context(client: TestClient) -> None:
    stub = StubProvider(ChatResponse(text="ok", tool_calls=[]))
    set_provider(stub)

    response = client.post("/chat", json={"message": "hi"})
    assert response.status_code == 200
    assert response.json()["text"].startswith("Hi.")


def test_chat_capability_reply_short_circuits_provider(client: TestClient) -> None:
    provider = AsyncMock()
    set_provider(provider)

    response = client.post(
        "/chat",
        json={
            "message": "What can you do here?",
            "map_context": {"visible_layers": ["cities", "routes"]},
        },
    )

    assert response.status_code == 200
    assert "zoom, filter, compare, or inspect" in response.json()["text"]
    provider.chat.assert_not_called()


def test_chat_exploration_reply_uses_visible_layers(client: TestClient) -> None:
    provider = AsyncMock()
    set_provider(provider)

    response = client.post(
        "/chat",
        json={
            "message": "Show me something interesting",
            "map_context": {"visible_layers": ["cities", "routes", "regions"]},
        },
    )

    assert response.status_code == 200
    assert "cities, routes, and regions" in response.json()["text"]
    provider.chat.assert_not_called()


def test_chat_ambiguous_compare_returns_clarification(client: TestClient) -> None:
    provider = AsyncMock()
    set_provider(provider)

    response = client.post("/chat", json={"message": "Compare these", "map_context": {}})

    assert response.status_code == 200
    assert "What should I compare" in response.json()["text"]
    provider.chat.assert_not_called()


# ---------------------------------------------------------------------------
# Tool definitions sanity check
# ---------------------------------------------------------------------------


def test_tool_definitions_include_required_tools() -> None:
    from backend.tools import TOOL_BY_NAME

    assert "list_layers" in TOOL_BY_NAME
    assert "get_map_state" in TOOL_BY_NAME


def test_tool_definitions_have_required_fields() -> None:
    from backend.tools import TOOL_DEFINITIONS

    for tool in TOOL_DEFINITIONS:
        assert "name" in tool
        assert "description" in tool
        assert "parameters" in tool
        assert tool["parameters"]["type"] == "object"
