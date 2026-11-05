// Entirely fictional evidence, shared by the browser and CLI. No repository was fetched.
const SHA = '1111111111111111111111111111111111111111';
const OTHER = '2222222222222222222222222222222222222222';
const workflow = id => ({ id, name: id === 1 ? 'Unit checks' : 'Integration checks', state: 'active' });
const run = (id, workflowId = 1, changes = {}) => ({ id, workflow_id: workflowId, head_sha: SHA, status: 'completed', conclusion: 'success', updated_at_utc: '2026-01-15T11:20:00Z', ...changes });
function repo(name, scenarioDescription, changes = {}) {
  return {
    owner: 'synthetic-evidence', name, description: scenarioDescription, language: 'JavaScript',
    source_sha: SHA, observed_at_utc: '2026-01-15T11:30:00Z', provenance: 'synthetic', license: 'present',
    documentation: { readme: 'present', contributing: 'present', security: 'present' },
    workflow_inventory: { complete: true, items: [workflow(1)] },
    runs: { complete: true, items: [run(1)] }, claimed_verdict: null, ...changes
  };
}
export const demoSnapshot = {
  schema_version: '0.1.0', evaluated_at_utc: '2026-01-15T12:00:00Z', ttl_seconds: 3600,
  repositories: [
    repo('complete-checks', 'Synthetic scenario (verified_passing): two active workflows both completed with success at the evaluated source SHA.', { workflow_inventory: { complete: true, items: [workflow(1), workflow(2)] }, runs: { complete: true, items: [run(1), run(2, 2)] } }),
    repo('failed-checks', 'Synthetic scenario (verified_failing): active workflow completed with failure at the evaluated source SHA.', { language: 'Go', license: 'unknown', runs: { complete: true, items: [run(1, 1, { conclusion: 'failure' })] } }),
    repo('stale-copy', 'Synthetic scenario (stale_snapshot): observation timestamp is 7200s old, exceeding the 3600s TTL.', { observed_at_utc: '2026-01-15T10:00:00Z', documentation: { readme: 'present', contributing: 'present', security: 'unknown' }, runs: { complete: true, items: [run(1, 1, { updated_at_utc: '2026-01-15T09:50:00Z' })] } }),
    repo('inventory-missing', 'Synthetic scenario (incomplete_metadata): workflow inventory enumeration is marked incomplete.', { language: 'Python', documentation: { readme: 'unknown', contributing: 'present', security: 'present' }, workflow_inventory: { complete: false, items: [] } }),
    repo('zero-runs', 'Synthetic scenario (unverified_offline): active workflow is inventoried, but zero workflow runs were supplied.', { language: null, license: 'absent', documentation: { readme: 'present', contributing: 'absent', security: 'present' }, runs: { complete: true, items: [] } }),
    repo('no-workflows', 'Synthetic scenario (no_ci_configured): complete workflow inventory explicitly confirms zero configured GitHub Actions workflows.', { workflow_inventory: { complete: true, items: [] }, runs: { complete: true, items: [] } }),
    repo('pending-check', 'Synthetic scenario (unverified_offline): latest run for the active workflow is still in_progress.', { runs: { complete: true, items: [run(1, 1, { status: 'in_progress', conclusion: null })] } }),
    repo('sha-mismatch', 'Synthetic scenario (unverified_offline): completed run head_sha does not match the evaluated repository source_sha.', { runs: { complete: true, items: [run(1, 1, { head_sha: OTHER })] } })
  ]
};
