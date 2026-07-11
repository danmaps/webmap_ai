"""Lightweight intent handling for conversational map-copilot flows."""

from __future__ import annotations

from dataclasses import dataclass

from backend.models import MapContext


@dataclass(frozen=True)
class IntentResolution:
    """Classification result for a user message."""

    kind: str
    direct_text: str | None = None
    prompt_hint: str | None = None


def _normalize(message: str) -> str:
    return " ".join(message.lower().strip().split())


def _join_natural(items: list[str]) -> str:
    if not items:
        return ""
    if len(items) == 1:
        return items[0]
    if len(items) == 2:
        return f"{items[0]} and {items[1]}"
    return f"{', '.join(items[:-1])}, and {items[-1]}"


def _visible_layer_names(map_context: MapContext) -> list[str]:
    names = [layer.layer_name or layer.layer_id for layer in map_context.layer_schemas]
    if names:
        return names
    return list(map_context.visible_layers)


def _build_capability_reply(map_context: MapContext) -> str:
    visible_layers = _visible_layer_names(map_context)
    if visible_layers:
        return (
            f"I can help inspect { _join_natural(visible_layers) } on the map. "
            "Ask me what's visible, or tell me to zoom, filter, compare, or inspect something specific."
        )
    return (
        "I can inspect the current map, answer what's visible, and help with actions like zoom, "
        "filter, compare, or inspect. Start with a layer, place, or area."
    )


def _build_exploration_reply(map_context: MapContext) -> str:
    visible_layers = _visible_layer_names(map_context)
    if visible_layers:
        layer_list = _join_natural(visible_layers)
        return (
            f"A good place to start is {layer_list}. "
            "Try asking what's visible, compare two areas, or tell me which layer you want to inspect."
        )
    return (
        "I do not have much map context yet. "
        "Try asking what layers are loaded, what is visible, or what area you want to inspect."
    )


def _build_ambiguous_reply(message: str, map_context: MapContext) -> str:
    lower = _normalize(message)

    if "compare" in lower:
        if map_context.selected_feature_ids:
            return (
                "What do you want to compare: the selected features, two layers, or two places on the map?"
            )
        return "What should I compare: two places, two layers, or the current view against another area?"

    if "inspect" in lower:
        return "What do you want to inspect there: visible features, a specific layer, or a comparison with another area?"

    if any(token in lower for token in ("this", "that", "these", "those", "here", "there")):
        return "What should I use as the target: the current view, a layer, or a specific place?"

    return "What do you want me to do with the map: inspect something, compare areas, or change the view?"


def resolve_intent(message: str, map_context: MapContext) -> IntentResolution:
    """Classify a message into a small set of operator-friendly intents."""

    lower = _normalize(message)

    if not lower:
        return IntentResolution(
            kind="ambiguous",
            direct_text="What do you want me to do with the map: inspect something, compare areas, or change the view?",
        )

    greeting_terms = {"hi", "hello", "hey", "yo", "sup"}
    if lower in greeting_terms or lower.startswith("hello ") or lower.startswith("hey "):
        return IntentResolution(
            kind="greeting",
            direct_text="Hi. Ask me about what's visible, or tell me to zoom, filter, compare, or inspect something.",
        )

    capability_phrases = (
        "what can you do",
        "how do i use",
        "help me use",
        "how can you help",
        "what do you do",
    )
    if any(phrase in lower for phrase in capability_phrases):
        return IntentResolution(kind="capability", direct_text=_build_capability_reply(map_context))

    exploration_phrases = (
        "show me something interesting",
        "what stands out",
        "where should i start",
        "give me a quick tour",
        "show me around",
    )
    if any(phrase in lower for phrase in exploration_phrases):
        return IntentResolution(kind="exploration", direct_text=_build_exploration_reply(map_context))

    action_keywords = ("zoom", "pan", "hide", "show", "filter", "highlight", "select", "clear")
    if any(word in lower for word in ("compare", "versus", " vs ", "difference between", "similar to")):
        prompt_hint = (
            "Treat this as a comparison request. Clarify only if the targets are missing; otherwise compare the requested map entities directly."
        )
        if any(token in lower for token in ("compare this", "compare these", "compare that", "compare those")):
            return IntentResolution(kind="ambiguous", direct_text=_build_ambiguous_reply(message, map_context))
        return IntentResolution(kind="comparison", prompt_hint=prompt_hint)

    if any(keyword in lower for keyword in action_keywords):
        return IntentResolution(
            kind="map_action",
            prompt_hint="Treat this as a map action request. Prefer doing the requested map operation over merely describing the map.",
        )

    ambiguous_starters = (
        "help me inspect",
        "inspect this",
        "inspect that",
        "look at this",
        "look at that",
        "compare these",
        "compare this",
    )
    if any(phrase in lower for phrase in ambiguous_starters):
        return IntentResolution(kind="ambiguous", direct_text=_build_ambiguous_reply(message, map_context))

    return IntentResolution(
        kind="read_query",
        prompt_hint="Treat this as a map reading request. Answer only what was asked and avoid extra scene-setting.",
    )
