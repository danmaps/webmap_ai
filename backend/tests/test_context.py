"""Tests for the assistant context builder.

Verifies that build_assistant_context and build_system_prompt only contain
schema-level information (names, types, view state) and never include
feature property values or geometry coordinates.
"""

from __future__ import annotations

import json

from backend.context import build_assistant_context, build_system_prompt
from backend.models import FieldInfo, LayerSchemaInfo, MapBounds, MapCenter, MapContext


def _make_context(**overrides) -> MapContext:
    """Build a MapContext with realistic defaults."""
    defaults = {
        "bbox": MapBounds(west=-123, south=37, east=-121, north=38),
        "center": MapCenter(lng=-122, lat=37.5),
        "zoom": 9.0,
        "visible_layers": ["cities", "roads"],
        "selected_feature_ids": ["c1"],
        "layer_schemas": [
            LayerSchemaInfo(
                layer_id="cities",
                layer_name="Major US Cities",
                geometry_type="point",
                fields=[
                    FieldInfo(name="name", type="string"),
                    FieldInfo(name="population", type="number"),
                ],
            ),
            LayerSchemaInfo(
                layer_id="roads",
                layer_name="Interstate Highways",
                geometry_type="line",
                fields=[
                    FieldInfo(name="ref", type="string"),
                ],
            ),
        ],
    }
    defaults.update(overrides)
    return MapContext(**defaults)


# ---------------------------------------------------------------------------
# build_assistant_context
# ---------------------------------------------------------------------------


class TestBuildAssistantContext:
    def test_includes_view_state(self) -> None:
        ctx = build_assistant_context(_make_context())
        assert ctx["bbox"] == {"west": -123, "south": 37, "east": -121, "north": 38}
        assert ctx["zoom"] == 9.0
        assert ctx["center"] == {"lng": -122, "lat": 37.5}
        assert ctx["selected_feature_ids"] == ["c1"]

    def test_includes_visible_layer_names(self) -> None:
        ctx = build_assistant_context(_make_context())
        assert ctx["visible_layers"] == ["cities", "roads"]

    def test_includes_layer_schemas(self) -> None:
        ctx = build_assistant_context(_make_context())
        schemas = ctx["layer_schemas"]
        assert len(schemas) == 2

        cities = schemas[0]
        assert cities["layer_id"] == "cities"
        assert cities["layer_name"] == "Major US Cities"
        assert cities["geometry_type"] == "point"
        assert cities["fields"] == [
            {"name": "name", "type": "string"},
            {"name": "population", "type": "number"},
        ]

    def test_never_contains_feature_values(self) -> None:
        """The context payload must not contain any feature property values."""
        ctx = build_assistant_context(_make_context())
        serialized = json.dumps(ctx)

        # Example feature values that could leak if the builder were buggy
        for forbidden in ["Oakland", "Fresno", "San Jose", "440000", "I-80"]:
            assert forbidden not in serialized, (
                f"Feature value '{forbidden}' found in context payload"
            )

    def test_no_geometry_or_properties_keys(self) -> None:
        """Context must not have 'geometry', 'properties', or 'features' keys."""
        ctx = build_assistant_context(_make_context())
        serialized = json.dumps(ctx)

        # These keys would indicate feature-level data leaking in
        assert '"geometry"' not in serialized
        assert '"properties"' not in serialized
        assert '"features"' not in serialized

    def test_omits_empty_optional_fields(self) -> None:
        ctx = build_assistant_context(MapContext())
        # With no data set, the context should be empty (or nearly so)
        assert "bbox" not in ctx
        assert "visible_layers" not in ctx
        assert "layer_schemas" not in ctx


# ---------------------------------------------------------------------------
# build_system_prompt
# ---------------------------------------------------------------------------


class TestBuildSystemPrompt:
    def test_prompt_contains_view_state(self) -> None:
        prompt = build_system_prompt(_make_context())
        assert "Zoom: 9.0" in prompt
        assert "west=-123" in prompt
        assert "cities" in prompt

    def test_prompt_contains_layer_schemas(self) -> None:
        prompt = build_system_prompt(_make_context())
        assert "Major US Cities" in prompt
        assert "point" in prompt
        assert "name:string" in prompt
        assert "population:number" in prompt

    def test_prompt_can_include_intent_guidance(self) -> None:
        prompt = build_system_prompt(
            _make_context(),
            intent_hint="Treat this as a map action request.",
        )
        assert "User intent guidance: Treat this as a map action request." in prompt

    def test_prompt_never_contains_feature_values(self) -> None:
        prompt = build_system_prompt(_make_context())
        for forbidden in ["Oakland", "Fresno", "440000", "I-80"]:
            assert forbidden not in prompt, (
                f"Feature value '{forbidden}' found in system prompt"
            )
