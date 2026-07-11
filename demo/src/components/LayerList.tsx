import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { MapLibreMapAssistantAdapter } from "webmap_ai";
import type { MapLibreMapLike } from "webmap_ai";
import { DEMO_LAYERS } from "../lib/layers";
import type { LayerConfig } from "../lib/layers";
import "./LayerList.css";

interface LayerListProps {
  map: MapLibreMapLike | null;
}

// MapLibreMapLike is the assistant's minimal contract; the real map instance
// also emits events. We only need on/off to react to style changes.
type EventfulMap = MapLibreMapLike & {
  on(type: string, listener: () => void): void;
  off(type: string, listener: () => void): void;
};

// Extra style layers that ride along with a data layer's visibility.
const COMPANION_LAYERS: Record<string, string[]> = {
  cities: ["cities-labels"],
};

const TYPE_LABELS: Record<LayerConfig["type"], string> = {
  fill: "Polygon",
  line: "Line",
  circle: "Point",
};

// Derive a small preview swatch from the layer's paint definition. Region
// fills use a `match` expression, so fall back to a representative gradient.
function swatchStyle(layer: LayerConfig): CSSProperties {
  const paint = layer.paint;

  if (layer.type === "line") {
    return { background: String(paint["line-color"] ?? "#888") };
  }
  if (layer.type === "circle") {
    return {
      background: String(paint["circle-color"] ?? "#888"),
      borderRadius: "50%",
      border: `1.5px solid ${String(paint["circle-stroke-color"] ?? "#fff")}`,
    };
  }

  const fill = paint["fill-color"];
  if (Array.isArray(fill)) {
    const colors = fill.filter(
      (part) => typeof part === "string" && part.startsWith("#"),
    ) as string[];
    if (colors.length > 1) {
      return {
        background: `linear-gradient(135deg, ${colors.join(", ")})`,
        opacity: 0.85,
      };
    }
    return { background: colors[0] ?? "#888", opacity: 0.85 };
  }
  return { background: String(fill ?? "#888"), opacity: 0.85 };
}

const ALL_VISIBLE: Record<string, boolean> = Object.fromEntries(
  DEMO_LAYERS.map((layer) => [layer.id, true]),
);

export function LayerList({ map }: LayerListProps) {
  const [visible, setVisible] = useState<Record<string, boolean>>(ALL_VISIBLE);
  const [isOpen, setIsOpen] = useState(false);

  // Reuse the same adapter the assistant uses so the widget "inspects" the
  // map exactly the way the AI does — the map stays the single source of truth.
  const adapter = useMemo(
    () => (map ? new MapLibreMapAssistantAdapter(map) : null),
    [map],
  );

  // Read current visibility straight from the live map style.
  const refresh = useCallback(async () => {
    if (!adapter) return;
    const summaries = await adapter.listLayers();
    const byId = new Map(summaries.map((s) => [s.id, s.visible]));
    setVisible((prev) => {
      const next = Object.fromEntries(
        DEMO_LAYERS.map((layer) => [layer.id, byId.get(layer.id) ?? true]),
      );
      const changed = DEMO_LAYERS.some((layer) => prev[layer.id] !== next[layer.id]);
      return changed ? next : prev;
    });
  }, [adapter]);

  // Keep the widget in sync with the map: MapLibre fires `styledata` whenever a
  // layout property changes — including when the assistant toggles a layer.
  useEffect(() => {
    if (!map) return;
    const eventful = map as EventfulMap;
    void refresh();
    const handler = () => void refresh();
    eventful.on("styledata", handler);
    return () => eventful.off("styledata", handler);
  }, [map, refresh]);

  const toggle = useCallback(
    (layerId: string) => {
      if (!map) return;
      const value = (visible[layerId] ?? true) ? "none" : "visible";
      map.setLayoutProperty(layerId, "visibility", value);
      for (const companion of COMPANION_LAYERS[layerId] ?? []) {
        map.setLayoutProperty(companion, "visibility", value);
      }
      // Optimistic update; the `styledata` listener reconciles with the map.
      setVisible((prev) => ({ ...prev, [layerId]: value === "visible" }));
    },
    [map, visible],
  );

  return (
    <div
      className={`layer-list${isOpen ? " layer-list--open" : ""}`}
      aria-label="Layers"
    >
      <button
        type="button"
        className="layer-list-toggle"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        aria-controls="layer-list-items"
      >
        <span className="layer-list-toggle-label">Layers</span>
        <span className="layer-list-toggle-icon" aria-hidden="true">
          {isOpen ? "−" : "+"}
        </span>
      </button>
      <div className="layer-list-header">Layers</div>
      <ul className="layer-list-items" id="layer-list-items">
        {DEMO_LAYERS.map((layer) => {
          const isVisible = visible[layer.id] ?? true;
          return (
            <li key={layer.id} className="layer-item">
              <label className="layer-label">
                <input
                  type="checkbox"
                  checked={isVisible}
                  disabled={!map}
                  onChange={() => toggle(layer.id)}
                />
                <span className="layer-swatch" style={swatchStyle(layer)} />
                <span className="layer-name">{layer.name}</span>
                <span className="layer-type">{TYPE_LABELS[layer.type]}</span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
