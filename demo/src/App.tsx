import { useState, useCallback } from "react";
import { MapView } from "./components/MapView";
import { AssistantPanel } from "./components/AssistantPanel";
import { AssistantService } from "./lib/assistant";
import type { MapLibreMapLike } from "webmap_ai";
import "./App.css";

export default function App() {
  const [service, setService] = useState<AssistantService | null>(null);

  const handleMapReady = useCallback((map: MapLibreMapLike) => {
    setService(new AssistantService(map));
  }, []);

  return (
    <div className="app-layout">
      <MapView onMapReady={handleMapReady} />
      <AssistantPanel service={service} />
    </div>
  );
}
