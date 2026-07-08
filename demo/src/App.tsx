import { useState, useCallback } from "react";
import { MapView } from "./components/MapView";
import { AssistantPanel } from "./components/AssistantPanel";
import { LayerList } from "./components/LayerList";
import { AssistantService } from "./lib/assistant";
import type { MapLibreMapLike } from "webmap_ai";
import "./App.css";

export default function App() {
  const [service, setService] = useState<AssistantService | null>(null);
  const [map, setMap] = useState<MapLibreMapLike | null>(null);

  const handleMapReady = useCallback((readyMap: MapLibreMapLike) => {
    setMap(readyMap);
    setService(new AssistantService(readyMap));
  }, []);

  return (
    <div className="app-layout">
      <div className="map-region">
        <MapView onMapReady={handleMapReady} />
        <LayerList map={map} />
      </div>
      <AssistantPanel service={service} />
    </div>
  );
}
