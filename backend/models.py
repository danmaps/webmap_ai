"""Pydantic models for the /chat request and response contract."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class MapBounds(BaseModel):
    west: float
    south: float
    east: float
    north: float


class MapCenter(BaseModel):
    lng: float
    lat: float


class FieldInfo(BaseModel):
    """Schema-level field descriptor (name + type only, no values)."""

    name: str = Field(description="Attribute field name (e.g. 'population').")
    type: str = Field(description="Data type of the field (e.g. 'string', 'number').")


class LayerSchemaInfo(BaseModel):
    """Schema-level layer descriptor sent as part of the map context.

    Contains only metadata (names, types) — never feature property values
    or geometry coordinates.
    """

    layer_id: str = Field(description="Unique layer identifier.")
    layer_name: str | None = Field(default=None, description="Human-readable layer name.")
    geometry_type: str | None = Field(
        default=None, description="Geometry type (e.g. 'point', 'line', 'polygon')."
    )
    fields: list[FieldInfo] = Field(
        default_factory=list, description="Attribute field descriptors (names and types only)."
    )


class MapContext(BaseModel):
    """Current map state sent by the frontend with every chat message."""

    bbox: MapBounds | None = None
    center: MapCenter | None = None
    zoom: float | None = None
    bearing: float | None = None
    pitch: float | None = None
    visible_layers: list[str] = Field(default_factory=list)
    selected_feature_ids: list[str] = Field(default_factory=list)
    layer_schemas: list[LayerSchemaInfo] = Field(default_factory=list)


class ChatRequest(BaseModel):
    message: str
    map_context: MapContext = Field(default_factory=MapContext)


class ToolCall(BaseModel):
    """A single tool call returned by the LLM for the frontend to execute."""

    name: str
    args: dict[str, Any] = Field(default_factory=dict)


class ChatResponse(BaseModel):
    """Structured response returned to the frontend."""

    text: str
    tool_calls: list[ToolCall] = Field(default_factory=list)
