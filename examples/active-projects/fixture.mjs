// All records are invented. Expected totals below are authored independently
// of the adapter: 12 North + 9 South + 6 West active projects, three segments each.
export const PROMPT = 'How many active projects are there by district?';
export const EXPECTED = [
  { group: 'North', count: 12 }, { group: 'South', count: 9 }, { group: 'West', count: 6 },
];
export const STATE = {
  bounds: { west: -2, south: -2, east: 0, north: 2 },
  center: { lng: -1, lat: 0 }, zoom: 5, selectedFeatureIds: [],
};
export const OTHER_VIEW = {
  bounds: { west: 0, south: -2, east: 2, north: 2 }, center: { lng: 1, lat: 0 },
};
export const SUMMARY_ARGS = {
  layerId: 'projects', groupBy: 'district', countBy: 'entity',
  filter: { field: 'status', value: 'Active' },
};
export function projectLayer(scope = 'authoritative_dataset') {
  const features = [];
  for (const [district, activeCount] of [['North', 12], ['South', 9], ['West', 6]]) {
    for (let project = 1; project <= activeCount + 1; project++) {
      for (let segment = 1; segment <= 3; segment++) {
        features.push({
          id: `${district}-${project}-${segment}`, layerId: 'projects',
          properties: {
            project_id: `${district}-${project}`, district,
            status: project > activeCount ? 'Inactive' : segment % 2 ? 'Active' : 'ACTIVE',
            internal_note: 'Never send raw records to the model',
          },
        });
      }
    }
  }
  // Repeated tile representations with stable feature IDs, not new entities.
  features.push(...features.slice(0, 4).map((row) => structuredClone(row)));
  return {
    summary: { id: 'projects', name: 'Synthetic projects', type: 'geojson', visible: true,
      description: 'One feature is a project segment. District is an authored attribute, not a spatial join.' },
    schema: {
      layerId: 'projects', geometryType: 'line',
      fields: ['project_id', 'district', 'status'].map((name) => ({ name, type: 'string' })),
      summary: { recordMeaning: 'One record is one project segment', entityKey: 'project_id',
        groupField: 'district', statusField: 'status', statusMapping: { Active: 'active', ACTIVE: 'active' },
        scope, operations: ['count'] },
    },
    features,
    ...(scope === 'loaded_tiles' ? {
      // A local stand-in for tile availability, not a real MapLibre completeness claim.
      readFeatures: async (state) => features.filter((row) => row.properties.district === (state.center.lng < 0 ? 'North' : 'South')),
    } : {}),
  };
}

// A deterministic scripted model proves the protocol, not live model quality.
export async function mockProvider(state) {
  if (state.history.length === 0) return { text: 'Unverified preliminary answer',
    calls: [{ id: 'schema', name: 'get_layer_schema', args: { layerId: 'projects' } }] };
  if (state.history.length === 1) {
    const rules = state.history[0].feedback[0].result.data.summary;
    return { calls: [{ id: 'summary', name: 'summarize_features', args: {
      layerId: 'projects', groupBy: rules.groupField, countBy: 'entity',
      filter: { field: rules.statusField, value: 'Active' },
    } }] };
  }
  const result = state.history.at(-1).feedback[0].result;
  return { text: result.ok && result.data.status === 'complete'
    ? `${result.data.groups.map(({ group, count }) => `${group}: ${count}`).join('; ')} active projects (${result.data.counted} total).`
    : 'A complete answer is unavailable.' };
}
