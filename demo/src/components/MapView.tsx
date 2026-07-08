import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import type { MapLibreMapLike } from "webmap_ai";
import { DEMO_LAYERS } from "../lib/layers";
import type { GeoJSON } from "geojson";
import "./MapView.css";

interface MapViewProps {
  onMapReady: (map: MapLibreMapLike) => void;
}

// Human-readable labels for property keys shown in popups.
const FIELD_LABELS: Record<string, string> = {
  name: "Name",
  state: "State",
  population: "Population",
  rank: "Population rank",
  founded: "Founded",
  timezone: "Time zone",
  area_sq_mi: "Area (sq mi)",
  region: "Region",
  states: "States",
  largest_city: "Largest city",
  highway: "Highway",
  direction: "Direction",
  length_mi: "Length (mi)",
  states_served: "States served",
};

function formatValue(key: string, value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "number") {
    if (key === "population" || key === "length_mi" || key === "area_sq_mi") {
      return value.toLocaleString("en-US");
    }
    if (key === "rank") return `#${value}`;
    return String(value);
  }
  return String(value);
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function popupHtml(properties: Record<string, unknown>): string {
  const title = escapeHtml(String(properties.name ?? "Feature"));
  const rows = Object.entries(properties)
    .filter(([key]) => key !== "name" && key !== "id")
    .map(([key, value]) => {
      const label = escapeHtml(FIELD_LABELS[key] ?? key);
      const val = escapeHtml(formatValue(key, value));
      return `<tr><th>${label}</th><td>${val}</td></tr>`;
    })
    .join("");
  return `<div class="feature-popup"><h3>${title}</h3><table>${rows}</table></div>`;
}

// MapLibre drops non-numeric feature ids from query results. Copy each
// feature's top-level id into its properties so the assistant (and
// feature-state) can reference features by a stable id.
function withPromotedIds(data: GeoJSON): GeoJSON {
  if (data.type !== "FeatureCollection") return data;
  return {
    ...data,
    features: data.features.map((feature) =>
      feature.id === undefined || feature.id === null
        ? feature
        : {
            ...feature,
            properties: { id: feature.id, ...(feature.properties ?? {}) },
          },
    ),
  };
}

export function MapView({ onMapReady }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          "carto-dark": {
            type: "raster",
            tiles: [
              "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
              "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
              "https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
            ],
            tileSize: 256,
            attribution:
              '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
          },
        },
        layers: [
          {
            id: "background",
            type: "raster",
            source: "carto-dark",
          },
        ],
      },
      center: [-98, 39],
      zoom: 4,
    });

    mapRef.current = map;

    map.addControl(new maplibregl.NavigationControl(), "top-left");
    map.addControl(new maplibregl.ScaleControl(), "bottom-left");

    map.on("load", () => {
      for (const layer of DEMO_LAYERS) {
        map.addSource(layer.id, {
          type: "geojson",
          data: withPromotedIds(layer.geojson),
          promoteId: "id",
        });

        map.addLayer({
          id: layer.id,
          type: layer.type,
          source: layer.id,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          paint: layer.paint as any,
          layout: { visibility: "visible" },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          metadata: { "webmap_ai:name": layer.name } as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);
      }

      // Add city labels
      map.addLayer({
        id: "cities-labels",
        type: "symbol",
        source: "cities",
        layout: {
          "text-field": ["get", "name"],
          "text-size": 11,
          "text-offset": [0, 1.2],
          "text-anchor": "top",
          visibility: "visible",
        },
        paint: {
          "text-color": "#ffffff",
          "text-halo-color": "rgba(0,0,0,0.6)",
          "text-halo-width": 1,
        },
      });

      onMapReady(map as unknown as MapLibreMapLike);
    });

    // Interactive popups + hover cursor on every data layer.
    const interactiveLayers = DEMO_LAYERS.map((layer) => layer.id);
    const popup = new maplibregl.Popup({
      closeButton: true,
      closeOnClick: true,
      maxWidth: "280px",
    });

    for (const layerId of interactiveLayers) {
      map.on("click", layerId, (e) => {
        const feature = e.features?.[0];
        if (!feature) return;
        const props = (feature.properties ?? {}) as Record<string, unknown>;
        popup
          .setLngLat(e.lngLat)
          .setHTML(popupHtml(props))
          .addTo(map);
      });

      map.on("mouseenter", layerId, () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", layerId, () => {
        map.getCanvas().style.cursor = "";
      });
    }

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={containerRef} className="map-container" />;
}

