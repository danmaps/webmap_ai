"""Tool definitions exposed to the LLM as function/tool schemas.

Each entry mirrors the TypeScript ``MapAssistantToolCall`` union so the
frontend and backend share the same tool vocabulary.
"""

from __future__ import annotations

from typing import Any

# ---------------------------------------------------------------------------
# JSON-Schema tool definitions sent to the LLM provider
# ---------------------------------------------------------------------------

TOOL_DEFINITIONS: list[dict[str, Any]] = [
    {
        "name": "list_layers",
        "description": (
            "Return a summary of every layer currently loaded in the map, "
            "including id, name, type, and visibility."
        ),
        "parameters": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
    {
        "name": "get_map_state",
        "description": (
            "Return the current map viewport state: bounding box, center, "
            "zoom level, bearing, pitch, and selected feature IDs."
        ),
        "parameters": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
    {
        "name": "get_layer_schema",
        "description": "Return the field schema for a specific layer.",
        "parameters": {
            "type": "object",
            "properties": {
                "layerId": {
                    "type": "string",
                    "description": "The ID of the layer whose schema to retrieve.",
                }
            },
            "required": ["layerId"],
        },
    },
    {
        "name": "query_visible_features",
        "description": "Return a sample of features currently visible in the map viewport for a given layer.",
        "parameters": {
            "type": "object",
            "properties": {
                "layerId": {
                    "type": "string",
                    "description": "The layer to query.",
                },
                "limit": {
                    "type": "integer",
                    "description": "Maximum number of features to return.",
                },
            },
            "required": ["layerId"],
        },
    },
    {
        "name": "query_features",
        "description": "Query features in a layer using an optional SQL-style WHERE clause.",
        "parameters": {
            "type": "object",
            "properties": {
                "layerId": {
                    "type": "string",
                    "description": "The layer to query.",
                },
                "where": {
                    "type": "string",
                    "description": "Optional SQL WHERE clause filter expression.",
                },
                "limit": {
                    "type": "integer",
                    "description": "Maximum number of features to return.",
                },
            },
            "required": ["layerId"],
        },
    },
    {
        "name": "set_view",
        "description": "Fly the map to a specified bounds, center, or zoom level.",
        "parameters": {
            "type": "object",
            "properties": {
                "bounds": {
                    "type": "object",
                    "description": "Bounding box { west, south, east, north }.",
                    "properties": {
                        "west": {"type": "number"},
                        "south": {"type": "number"},
                        "east": {"type": "number"},
                        "north": {"type": "number"},
                    },
                },
                "center": {
                    "type": "object",
                    "description": "Map center { lng, lat }.",
                    "properties": {
                        "lng": {"type": "number"},
                        "lat": {"type": "number"},
                    },
                },
                "zoom": {"type": "number", "description": "Zoom level."},
                "bearing": {"type": "number", "description": "Map bearing in degrees."},
                "pitch": {"type": "number", "description": "Map pitch in degrees."},
            },
            "required": [],
        },
    },
    {
        "name": "select_features",
        "description": "Select a set of features in a layer by their IDs.",
        "parameters": {
            "type": "object",
            "properties": {
                "layerId": {"type": "string", "description": "The layer that owns the features."},
                "featureIds": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "List of feature IDs to select.",
                },
            },
            "required": ["layerId", "featureIds"],
        },
    },
    {
        "name": "clear_selection",
        "description": "Clear the current feature selection on the map.",
        "parameters": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
    {
        "name": "set_layer_visibility",
        "description": "Show or hide a map layer.",
        "parameters": {
            "type": "object",
            "properties": {
                "layerId": {"type": "string", "description": "The layer to update."},
                "visible": {"type": "boolean", "description": "True to show, false to hide."},
            },
            "required": ["layerId", "visible"],
        },
    },
    {
        "name": "set_filter",
        "description": "Apply a SQL WHERE-style filter expression to a layer.",
        "parameters": {
            "type": "object",
            "properties": {
                "layerId": {"type": "string", "description": "The layer to filter."},
                "where": {"type": "string", "description": "SQL WHERE clause expression."},
            },
            "required": ["layerId", "where"],
        },
    },
]

# Lookup by name for quick access
TOOL_BY_NAME: dict[str, dict[str, Any]] = {t["name"]: t for t in TOOL_DEFINITIONS}
