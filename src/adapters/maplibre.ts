import type { MapAssistantAdapter } from "../adapter.js";
import type {
  FeatureSample,
  LayerFieldSummary,
  LayerSchema,
  LayerSummary,
  LayerType,
  MapBounds,
  MapState,
  QueryFeaturesArgs,
  QueryVisibleFeaturesArgs,
  SelectFeaturesArgs,
  SetFilterArgs,
  SetViewArgs,
} from "../types.js";

interface MapLibreLngLatLike {
  lng: number;
  lat: number;
}

interface MapLibreLngLatBoundsLike {
  getWest(): number;
  getSouth(): number;
  getEast(): number;
  getNorth(): number;
}

interface MapLibreFeatureLayerLike {
  id?: string;
  source?: string;
  "source-layer"?: string;
}

interface MapLibreFeatureLike {
  id?: string | number;
  layer?: MapLibreFeatureLayerLike;
  properties?: Record<string, unknown>;
  geometry?: unknown;
}

interface MapLibreVectorLayerMetadataLike {
  id: string;
  fields?: Record<string, unknown>;
  geometry_type?: unknown;
  geometryType?: unknown;
  metadata?: Record<string, unknown>;
}

interface MapLibreStyleSourceLike {
  type?: string;
  metadata?: Record<string, unknown>;
  vector_layers?: MapLibreVectorLayerMetadataLike[];
  [key: string]: unknown;
}

interface MapLibreStyleLayerLike {
  id: string;
  type: string;
  source?: string;
  "source-layer"?: string;
  layout?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

interface MapLibreStyleLike {
  layers?: MapLibreStyleLayerLike[];
  sources?: Record<string, MapLibreStyleSourceLike>;
}

interface MapLibreFeatureStateTargetLike {
  source: string;
  id: string | number;
  sourceLayer?: string;
}

interface MapLibreQuerySourceFeaturesOptionsLike {
  sourceLayer?: string;
  filter?: unknown[];
}

export interface MapLibreMapLike {
  getBounds(): MapLibreLngLatBoundsLike;
  getCenter(): MapLibreLngLatLike;
  getZoom(): number;
  getBearing(): number;
  getPitch(): number;
  getStyle(): MapLibreStyleLike;
  queryRenderedFeatures(geometry?: unknown, options?: { layers?: string[] }): MapLibreFeatureLike[];
  querySourceFeatures(sourceId: string, parameters?: MapLibreQuerySourceFeaturesOptionsLike): MapLibreFeatureLike[];
  flyTo(options: Record<string, unknown>): void;
  fitBounds(bounds: [[number, number], [number, number]], options?: Record<string, unknown>): void;
  setFeatureState(feature: MapLibreFeatureStateTargetLike, state: Record<string, unknown>): void;
  removeFeatureState(feature: MapLibreFeatureStateTargetLike, key?: string): void;
  setLayoutProperty(layerId: string, name: string, value: unknown): void;
  setFilter(layerId: string, filter: unknown[]): void;
}

export class MapLibreMapAssistantAdapter implements MapAssistantAdapter {
  private selectedTargets: MapLibreFeatureStateTargetLike[] = [];
  private selectedFeatureIds: string[] = [];

  public constructor(private readonly map: MapLibreMapLike) {}

  public async getMapState(): Promise<MapState> {
    const bounds = this.map.getBounds();
    const center = this.map.getCenter();

    return {
      bounds: {
        west: bounds.getWest(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        north: bounds.getNorth(),
      },
      center: {
        lng: center.lng,
        lat: center.lat,
      },
      zoom: this.map.getZoom(),
      bearing: this.map.getBearing(),
      pitch: this.map.getPitch(),
      selectedFeatureIds: [...this.selectedFeatureIds],
    };
  }

  public async listLayers(): Promise<LayerSummary[]> {
    return this.getStyleLayers().map((layer) => this.toLayerSummary(layer));
  }

  public async getLayerSchema(layerId: string): Promise<LayerSchema> {
    const layer = this.requireLayer(layerId);
    const source = this.requireLayerSource(layer);
    const vectorSchema = this.getVectorLayerSchema(layer, source);

    if (vectorSchema) {
      return vectorSchema;
    }

    const metadataSchema = this.getMetadataSchema(layerId, source.metadata) ?? this.getMetadataSchema(layerId, layer.metadata);

    if (metadataSchema) {
      return metadataSchema;
    }

    throw new Error(`Layer ${layerId} source does not expose schema details.`);
  }

  public async queryVisibleFeatures(args: QueryVisibleFeaturesArgs): Promise<FeatureSample[]> {
    this.requireVisibleLayer(args.layerId);

    return this.map
      .queryRenderedFeatures(undefined, { layers: [args.layerId] })
      .slice(0, args.limit ?? 50)
      .map((feature) => this.toFeatureSample(feature, args.layerId));
  }

  public async queryFeatures(args: QueryFeaturesArgs): Promise<FeatureSample[]> {
    const layer = this.requireLayer(args.layerId);
    const filter = args.where ? this.parseWhereClause(args.where) : undefined;
    const options: MapLibreQuerySourceFeaturesOptionsLike = {};

    if (layer["source-layer"]) {
      options.sourceLayer = layer["source-layer"];
    }

    if (filter) {
      options.filter = filter;
    }

    return this.map
      .querySourceFeatures(this.requireLayerSourceId(layer), options)
      .slice(0, args.limit ?? 50)
      .map((feature) => this.toFeatureSample(feature, args.layerId));
  }

  public async setView(args: SetViewArgs): Promise<void> {
    if (args.bounds) {
      const options: Record<string, unknown> = {};

      if (args.bearing !== undefined) {
        options.bearing = args.bearing;
      }

      if (args.pitch !== undefined) {
        options.pitch = args.pitch;
      }

      if (args.zoom !== undefined) {
        options.maxZoom = args.zoom;
      }

      this.map.fitBounds(this.toMapLibreBounds(args.bounds), options);
      return;
    }

    const options: Record<string, unknown> = {};

    if (args.center) {
      options.center = [args.center.lng, args.center.lat];
    }

    if (args.zoom !== undefined) {
      options.zoom = args.zoom;
    }

    if (args.bearing !== undefined) {
      options.bearing = args.bearing;
    }

    if (args.pitch !== undefined) {
      options.pitch = args.pitch;
    }

    this.map.flyTo(options);
  }

  public async selectFeatures(args: SelectFeaturesArgs): Promise<void> {
    const layer = this.requireLayer(args.layerId);
    const targets = Array.from(new Set(args.featureIds)).map((featureId) =>
      this.toFeatureStateTarget(layer, featureId),
    );

    await this.clearSelection();

    for (const target of targets) {
      this.map.setFeatureState(target, { selected: true });
    }

    this.selectedTargets = targets;
    this.selectedFeatureIds = targets.map((target) => String(target.id));
  }

  public async clearSelection(): Promise<void> {
    for (const target of this.selectedTargets) {
      this.map.removeFeatureState(target, "selected");
    }

    this.selectedTargets = [];
    this.selectedFeatureIds = [];
  }

  public async setLayerVisibility(layerId: string, visible: boolean): Promise<void> {
    this.requireLayer(layerId);
    this.map.setLayoutProperty(layerId, "visibility", visible ? "visible" : "none");
  }

  public async setFilter(args: SetFilterArgs): Promise<void> {
    this.requireLayer(args.layerId);
    this.map.setFilter(args.layerId, this.parseWhereClause(args.where));
  }

  private getStyleLayers(): MapLibreStyleLayerLike[] {
    return this.map.getStyle().layers ?? [];
  }

  private requireLayer(layerId: string): MapLibreStyleLayerLike {
    const layer = this.getStyleLayers().find((candidate) => candidate.id === layerId);

    if (!layer) {
      throw new Error(`Unknown layer: ${layerId}`);
    }

    return layer;
  }

  private requireVisibleLayer(layerId: string): MapLibreStyleLayerLike {
    const layer = this.requireLayer(layerId);

    if (layer.layout?.visibility === "none") {
      throw new Error(`Layer is not visible: ${layerId}`);
    }

    return layer;
  }

  private requireLayerSourceId(layer: MapLibreStyleLayerLike): string {
    if (!layer.source) {
      throw new Error(`Layer ${layer.id} has no source.`);
    }

    return layer.source;
  }

  private requireLayerSource(layer: MapLibreStyleLayerLike): MapLibreStyleSourceLike {
    const sourceId = this.requireLayerSourceId(layer);
    const source = this.map.getStyle().sources?.[sourceId];

    if (!source) {
      throw new Error(`Unknown source for layer ${layer.id}: ${sourceId}`);
    }

    return source;
  }

  private toLayerSummary(layer: MapLibreStyleLayerLike): LayerSummary {
    const source = layer.source ? this.map.getStyle().sources?.[layer.source] : undefined;
    const summary: LayerSummary = {
      id: layer.id,
      name: this.getMetadataString(layer.metadata, "name") ?? layer.id,
      type: this.toLayerType(source?.type, layer.type),
      visible: layer.layout?.visibility !== "none",
    };
    const description = this.getMetadataString(layer.metadata, "description");

    if (description) {
      summary.description = description;
    }

    if (layer.source) {
      summary.source = layer.source;
    }

    return summary;
  }

  private toLayerType(sourceType: string | undefined, layerType: string): LayerType {
    switch (sourceType) {
      case "vector":
        return "vector";
      case "raster":
        return "raster";
      case "geojson":
        return "geojson";
      case "raster-dem":
      case "image":
      case "video":
        return "tile";
      default:
        return layerType === "raster" ? "raster" : "custom";
    }
  }

  private getVectorLayerSchema(layer: MapLibreStyleLayerLike, source: MapLibreStyleSourceLike): LayerSchema | undefined {
    if (!source.vector_layers?.length) {
      return undefined;
    }

    const sourceLayerId = layer["source-layer"];

    if (!sourceLayerId) {
      throw new Error(`Vector layer ${layer.id} is missing a source-layer.`);
    }

    const vectorLayer = source.vector_layers.find((candidate) => candidate.id === sourceLayerId);

    if (!vectorLayer) {
      throw new Error(`Vector source layer not found for ${layer.id}: ${sourceLayerId}`);
    }

    const fields = this.toFieldSummaries(vectorLayer.fields);

    if (!fields.length) {
      return undefined;
    }

    const schema: LayerSchema = {
      layerId: layer.id,
      fields,
    };
    const geometryType = this.normalizeGeometryType(
      vectorLayer.geometryType ??
        vectorLayer.geometry_type ??
        this.getMetadataValue(vectorLayer.metadata, "geometryType"),
    );

    if (geometryType) {
      schema.geometryType = geometryType;
    }

    return schema;
  }

  private getMetadataSchema(
    layerId: string,
    metadata: Record<string, unknown> | undefined,
  ): LayerSchema | undefined {
    if (!metadata) {
      return undefined;
    }

    const schemaObject = this.toRecord(metadata.schema);
    const fields = this.toFieldSummaries(schemaObject?.fields ?? metadata.fields);

    if (!fields.length) {
      return undefined;
    }

    const schema: LayerSchema = {
      layerId,
      fields,
    };
    const geometryType = this.normalizeGeometryType(schemaObject?.geometryType ?? metadata.geometryType);

    if (geometryType) {
      schema.geometryType = geometryType;
    }

    return schema;
  }

  private toFieldSummaries(fieldsValue: unknown): LayerFieldSummary[] {
    if (Array.isArray(fieldsValue)) {
      return fieldsValue
        .map((field) => this.toFieldSummary(field))
        .filter((field): field is LayerFieldSummary => field !== undefined);
    }

    const fieldsRecord = this.toRecord(fieldsValue);

    if (!fieldsRecord) {
      return [];
    }

    return Object.entries(fieldsRecord).map(([name, type]) => ({
      name,
      type: this.normalizeFieldType(type),
    }));
  }

  private toFieldSummary(fieldValue: unknown): LayerFieldSummary | undefined {
    const field = this.toRecord(fieldValue);
    const name = typeof field?.name === "string" ? field.name : undefined;

    if (!name) {
      return undefined;
    }

    const summary: LayerFieldSummary = {
      name,
      type: this.normalizeFieldType(field?.type),
    };

    if (typeof field?.alias === "string") {
      summary.alias = field.alias;
    }

    return summary;
  }

  private normalizeFieldType(value: unknown): LayerFieldSummary["type"] {
    const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";

    switch (normalized) {
      case "string":
      case "text":
        return "string";
      case "number":
      case "int":
      case "integer":
      case "float":
      case "double":
        return "number";
      case "boolean":
      case "bool":
        return "boolean";
      case "date":
      case "datetime":
      case "timestamp":
        return "date";
      case "geometry":
        return "geometry";
      default:
        return "unknown";
    }
  }

  private normalizeGeometryType(value: unknown): LayerSchema["geometryType"] | undefined {
    const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";

    if (normalized.includes("point")) {
      return "point";
    }

    if (normalized.includes("line")) {
      return "line";
    }

    if (normalized.includes("polygon")) {
      return "polygon";
    }

    if (normalized === "raster") {
      return "raster";
    }

    return undefined;
  }

  private toFeatureSample(feature: MapLibreFeatureLike, fallbackLayerId: string): FeatureSample {
    return {
      id: this.getFeatureId(feature),
      layerId: feature.layer?.id ?? fallbackLayerId,
      properties: feature.properties ?? {},
      geometry: feature.geometry,
    };
  }

  private getFeatureId(feature: MapLibreFeatureLike): string {
    if (feature.id !== undefined && feature.id !== null) {
      return String(feature.id);
    }

    const propertyId = feature.properties?.id;

    if (typeof propertyId === "string" || typeof propertyId === "number") {
      return String(propertyId);
    }

    throw new Error("MapLibre feature is missing an id.");
  }

  private toFeatureStateTarget(layer: MapLibreStyleLayerLike, featureId: string): MapLibreFeatureStateTargetLike {
    const target: MapLibreFeatureStateTargetLike = {
      source: this.requireLayerSourceId(layer),
      id: featureId,
    };

    if (layer["source-layer"]) {
      target.sourceLayer = layer["source-layer"];
    }

    return target;
  }

  private toMapLibreBounds(bounds: MapBounds): [[number, number], [number, number]] {
    return [
      [bounds.west, bounds.south],
      [bounds.east, bounds.north],
    ];
  }

  private parseWhereClause(where: string): unknown[] {
    const inMatch = where.match(/^\s*([A-Za-z_][\w-]*)\s+IN\s*\((.+)\)\s*$/i);

    if (inMatch) {
      const field = inMatch[1];
      const rawValues = inMatch[2];

      if (!field || !rawValues) {
        throw new Error(`Unsupported where clause: ${where}`);
      }

      const values = rawValues
        .split(",")
        .map((entry) => this.parseLiteral(entry))
        .filter((entry): entry is string | number | boolean | null => entry !== undefined);

      if (!values.length) {
        throw new Error(`Unsupported where clause: ${where}`);
      }

      return ["in", this.toFilterOperand(field), ["literal", values]];
    }

    const equalityMatch = where.match(/^\s*([A-Za-z_][\w-]*)\s*(=|!=)\s*(.+)\s*$/);

    if (equalityMatch) {
      const field = equalityMatch[1];
      const operator = equalityMatch[2];
      const valueText = equalityMatch[3];

      if (!field || !operator || !valueText) {
        throw new Error(`Unsupported where clause: ${where}`);
      }

      const value = this.parseLiteral(valueText);

      if (value === undefined) {
        throw new Error(`Unsupported where clause: ${where}`);
      }

      return [operator === "!=" ? "!=" : "==", this.toFilterOperand(field), value];
    }

    throw new Error(`Unsupported where clause: ${where}`);
  }

  private toFilterOperand(field: string): unknown[] {
    return field.toLowerCase() === "id" ? ["id"] : ["get", field];
  }

  private parseLiteral(valueText: string): string | number | boolean | null | undefined {
    const trimmed = valueText.trim();

    if (!trimmed) {
      return undefined;
    }

    if (/^['"].*['"]$/.test(trimmed)) {
      return trimmed.slice(1, -1);
    }

    if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
      return Number(trimmed);
    }

    if (/^(true|false)$/i.test(trimmed)) {
      return trimmed.toLowerCase() === "true";
    }

    if (/^null$/i.test(trimmed)) {
      return null;
    }

    return trimmed;
  }

  private getMetadataString(metadata: Record<string, unknown> | undefined, key: string): string | undefined {
    const value = this.getMetadataValue(metadata, key);
    return typeof value === "string" ? value : undefined;
  }

  private getMetadataValue(metadata: Record<string, unknown> | undefined, key: string): unknown {
    return metadata?.[key];
  }

  private toRecord(value: unknown): Record<string, unknown> | undefined {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return undefined;
    }

    return value as Record<string, unknown>;
  }
}
