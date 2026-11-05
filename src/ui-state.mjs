import { filterEvidence } from './core.mjs';

export function filterState(evidence, filters) {
  const rows = filterEvidence(evidence, filters);
  return { rows, empty: rows.length === 0, announcement: `${rows.length} of ${evidence.length} repositories match.` };
}
export function openDetail(repositoryId, openerId) {
  return { selectedId: repositoryId, openerId };
}
export function closeDetail(state, availableIds, fallbackId = 'results-title') {
  const available = new Set(availableIds);
  return {
    state: { selectedId: null, openerId: null },
    focusId: available.has(state.openerId) ? state.openerId : fallbackId
  };
}
