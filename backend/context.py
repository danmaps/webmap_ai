"""Build scoped assistant context from a MapContext.

The context payload contains **only** schema-level information:
- Layer names, geometry types, and field names/types
- Current map viewport state (bbox, zoom, center, bearing, pitch)
- Selected feature IDs

**Feature property values and geometries are never included.**
Feature data is only accessed by deterministic tools (e.g. ``query_features``)
whose bounded results are returned as tool outputs — not injected into the
system prompt.
"""

from __future__ import annotations

from typing import Any

from backend.models import MapContext


def build_assistant_context(map_context: MapContext) -> dict[str, Any]:
    """Return a JSON-safe dict with only names, schema, and view state.

    This is the single source of truth for what information leaves the
    browser and is sent to the LLM provider.  It explicitly excludes
    feature property values and geometry coordinates.
    """
    context: dict[str, Any] = {}

    # -- View state ---------------------------------------------------------
    if map_context.bbox:
        b = map_context.bbox
        context["bbox"] = {
            "west": b.west,
            "south": b.south,
            "east": b.east,
            "north": b.north,
        }
    if map_context.center:
        context["center"] = {
            "lng": map_context.center.lng,
            "lat": map_context.center.lat,
        }
    if map_context.zoom is not None:
        context["zoom"] = map_context.zoom
    if map_context.bearing is not None:
        context["bearing"] = map_context.bearing
    if map_context.pitch is not None:
        context["pitch"] = map_context.pitch

    # -- Layer names --------------------------------------------------------
    if map_context.visible_layers:
        context["visible_layers"] = list(map_context.visible_layers)

    # -- Selected feature IDs (IDs only, no feature data) -------------------
    if map_context.selected_feature_ids:
        context["selected_feature_ids"] = list(map_context.selected_feature_ids)

    # -- Per-layer schemas (names + types, never values) --------------------
    if map_context.layer_schemas:
        context["layer_schemas"] = [
            {
                "layer_id": ls.layer_id,
                **({"layer_name": ls.layer_name} if ls.layer_name else {}),
                **({"geometry_type": ls.geometry_type} if ls.geometry_type else {}),
                "fields": [{"name": f.name, "type": f.type} for f in ls.fields],
            }
            for ls in map_context.layer_schemas
        ]

    return context


def build_system_prompt(map_context: MapContext, intent_hint: str | None = None) -> str:
    """Construct a system prompt that injects scoped map context.

    Uses :func:`build_assistant_context` to ensure only schema-level
    information is included — never feature property values or geometries.
    """
    parts = [
        "You are a map assistant. You have access to tools that let you "
        "inspect and interact with a web map. Use them when relevant.",
        "Answer directly.",
        "Lead with the answer, not setup.",
        "Keep it to 1-3 short sentences or a short list.",
        "Do not say phrases like 'Here's what I can see on the map' or explain the demo unless asked.",
        "No emojis.",
        "",
        "Current map context:",
    ]

    if intent_hint:
        parts.extend(["", f"User intent guidance: {intent_hint}"])

    ctx = build_assistant_context(map_context)

    if "bbox" in ctx:
        b = ctx["bbox"]
        parts.append(
            f"  Bounding box: west={b['west']}, south={b['south']}, "
            f"east={b['east']}, north={b['north']}"
        )
    if "zoom" in ctx:
        parts.append(f"  Zoom: {ctx['zoom']}")
    if "center" in ctx:
        parts.append(f"  Center: lng={ctx['center']['lng']}, lat={ctx['center']['lat']}")
    if "visible_layers" in ctx:
        parts.append(f"  Visible layers: {', '.join(ctx['visible_layers'])}")
    if "selected_feature_ids" in ctx:
        parts.append(f"  Selected feature IDs: {', '.join(ctx['selected_feature_ids'])}")
    if "layer_schemas" in ctx:
        for ls in ctx["layer_schemas"]:
            label = ls.get("layer_name") or ls["layer_id"]
            geom = f" ({ls['geometry_type']})" if ls.get("geometry_type") else ""
            field_strs = [f"{f['name']}:{f['type']}" for f in ls["fields"]]
            parts.append(f"  Layer '{label}'{geom}: fields=[{', '.join(field_strs)}]")

    return "\n".join(parts)
