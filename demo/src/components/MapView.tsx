import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import type { MapLibreMapLike } from "webmap_ai";
import { DEMO_LAYERS } from "../lib/layers";
import "./MapView.css";

interface MapViewProps {
  onMapReady: (map: MapLibreMapLike) => void;
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
        map.addSource(layer.id, { type: "geojson", data: layer.geojson });

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

    // Hover effect on cities
    map.on("mouseenter", "cities", () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", "cities", () => {
      map.getCanvas().style.cursor = "";
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={containerRef} className="map-container" />;
}

