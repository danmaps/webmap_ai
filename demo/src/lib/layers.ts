import type { GeoJSON } from "geojson";

export interface LayerConfig {
  id: string;
  name: string;
  geojson: GeoJSON;
  paint: Record<string, unknown>;
  type: "circle" | "fill" | "line";
}

export const CITIES_GEOJSON: GeoJSON = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      id: "nyc",
      geometry: { type: "Point", coordinates: [-74.006, 40.7128] },
      properties: { name: "New York", population: 8336817, state: "NY" },
    },
    {
      type: "Feature",
      id: "la",
      geometry: { type: "Point", coordinates: [-118.2437, 34.0522] },
      properties: { name: "Los Angeles", population: 3979576, state: "CA" },
    },
    {
      type: "Feature",
      id: "chicago",
      geometry: { type: "Point", coordinates: [-87.6298, 41.8781] },
      properties: { name: "Chicago", population: 2693976, state: "IL" },
    },
    {
      type: "Feature",
      id: "houston",
      geometry: { type: "Point", coordinates: [-95.3698, 29.7604] },
      properties: { name: "Houston", population: 2304580, state: "TX" },
    },
    {
      type: "Feature",
      id: "phoenix",
      geometry: { type: "Point", coordinates: [-112.074, 33.4484] },
      properties: { name: "Phoenix", population: 1608139, state: "AZ" },
    },
    {
      type: "Feature",
      id: "philadelphia",
      geometry: { type: "Point", coordinates: [-75.1652, 39.9526] },
      properties: { name: "Philadelphia", population: 1603797, state: "PA" },
    },
    {
      type: "Feature",
      id: "san-antonio",
      geometry: { type: "Point", coordinates: [-98.4936, 29.4241] },
      properties: { name: "San Antonio", population: 1434625, state: "TX" },
    },
    {
      type: "Feature",
      id: "san-diego",
      geometry: { type: "Point", coordinates: [-117.1611, 32.7157] },
      properties: { name: "San Diego", population: 1386932, state: "CA" },
    },
    {
      type: "Feature",
      id: "dallas",
      geometry: { type: "Point", coordinates: [-96.797, 32.7767] },
      properties: { name: "Dallas", population: 1304379, state: "TX" },
    },
    {
      type: "Feature",
      id: "san-jose",
      geometry: { type: "Point", coordinates: [-121.8863, 37.3382] },
      properties: { name: "San José", population: 1013240, state: "CA" },
    },
    {
      type: "Feature",
      id: "seattle",
      geometry: { type: "Point", coordinates: [-122.3321, 47.6062] },
      properties: { name: "Seattle", population: 744955, state: "WA" },
    },
    {
      type: "Feature",
      id: "denver",
      geometry: { type: "Point", coordinates: [-104.9903, 39.7392] },
      properties: { name: "Denver", population: 715522, state: "CO" },
    },
    {
      type: "Feature",
      id: "boston",
      geometry: { type: "Point", coordinates: [-71.0589, 42.3601] },
      properties: { name: "Boston", population: 694583, state: "MA" },
    },
    {
      type: "Feature",
      id: "miami",
      geometry: { type: "Point", coordinates: [-80.1918, 25.7617] },
      properties: { name: "Miami", population: 467963, state: "FL" },
    },
    {
      type: "Feature",
      id: "atlanta",
      geometry: { type: "Point", coordinates: [-84.388, 33.749] },
      properties: { name: "Atlanta", population: 498715, state: "GA" },
    },
  ],
};

export const REGIONS_GEOJSON: GeoJSON = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      id: "northeast",
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [-80, 37],
            [-66.8, 37],
            [-66.8, 47.5],
            [-80, 47.5],
            [-80, 37],
          ],
        ],
      },
      properties: { name: "Northeast", region: "northeast" },
    },
    {
      type: "Feature",
      id: "southeast",
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [-97, 25],
            [-75, 25],
            [-75, 37],
            [-97, 37],
            [-97, 25],
          ],
        ],
      },
      properties: { name: "Southeast", region: "southeast" },
    },
    {
      type: "Feature",
      id: "midwest",
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [-104, 37],
            [-80, 37],
            [-80, 49],
            [-104, 49],
            [-104, 37],
          ],
        ],
      },
      properties: { name: "Midwest", region: "midwest" },
    },
    {
      type: "Feature",
      id: "south",
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [-106, 26],
            [-97, 26],
            [-97, 37],
            [-106, 37],
            [-106, 26],
          ],
        ],
      },
      properties: { name: "South Central", region: "south" },
    },
    {
      type: "Feature",
      id: "west",
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [-125, 32],
            [-104, 32],
            [-104, 49],
            [-125, 49],
            [-125, 32],
          ],
        ],
      },
      properties: { name: "West", region: "west" },
    },
  ],
};

export const ROUTES_GEOJSON: GeoJSON = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      id: "i-10",
      geometry: {
        type: "LineString",
        coordinates: [
          [-118.2437, 34.0522],
          [-112.074, 33.4484],
          [-106.65, 31.76],
          [-98.4936, 29.4241],
          [-95.3698, 29.7604],
          [-89.1, 30.5],
          [-84.388, 30.0],
          [-81.65, 30.33],
        ],
      },
      properties: { name: "Interstate 10", highway: "I-10" },
    },
    {
      type: "Feature",
      id: "i-80",
      geometry: {
        type: "LineString",
        coordinates: [
          [-122.3321, 37.77],
          [-121.8863, 37.3382],
          [-118.09, 37.5],
          [-112.0, 40.77],
          [-104.9903, 39.7392],
          [-96.0, 41.26],
          [-87.6298, 41.8781],
          [-83.0, 41.5],
          [-80.0, 40.5],
          [-74.006, 40.7128],
        ],
      },
      properties: { name: "Interstate 80", highway: "I-80" },
    },
    {
      type: "Feature",
      id: "i-95",
      geometry: {
        type: "LineString",
        coordinates: [
          [-80.1918, 25.7617],
          [-81.38, 28.54],
          [-80.93, 32.08],
          [-79.95, 32.78],
          [-76.64, 34.72],
          [-75.1652, 39.9526],
          [-74.006, 40.7128],
          [-71.0589, 42.3601],
          [-70.23, 43.66],
        ],
      },
      properties: { name: "Interstate 95", highway: "I-95" },
    },
  ],
};

export const DEMO_LAYERS: LayerConfig[] = [
  {
    id: "regions",
    name: "US Regions",
    geojson: REGIONS_GEOJSON,
    type: "fill",
    paint: {
      "fill-color": [
        "match",
        ["get", "region"],
        "northeast",
        "#4a90d9",
        "southeast",
        "#7ac97a",
        "midwest",
        "#f0c040",
        "south",
        "#e07040",
        "west",
        "#b060c0",
        "#888888",
      ],
      "fill-opacity": 0.25,
    },
  },
  {
    id: "routes",
    name: "Interstate Highways",
    geojson: ROUTES_GEOJSON,
    type: "line",
    paint: {
      "line-color": "#e8c84a",
      "line-width": 2,
      "line-opacity": 0.9,
    },
  },
  {
    id: "cities",
    name: "Major US Cities",
    geojson: CITIES_GEOJSON,
    type: "circle",
    paint: {
      "circle-radius": 5,
      "circle-color": "#ff6b6b",
      "circle-stroke-width": 1.5,
      "circle-stroke-color": "#ffffff",
    },
  },
];
