import type {GraphClaimType} from './evidence-graph';

export const localEvidencePolicy = Object.freeze({
  id: 'synthetic-evidence-sufficiency-v1',
  minimumDistinctSources: Object.freeze({
    'source-assertion': 1,
    hypothesis: 2,
    'care-gap-question': 2,
    'risk-question': 2,
  } satisfies Record<GraphClaimType, number>),
});

type EvidenceLink = {
  relationship: 'supported' | 'contradicting' | 'insufficient';
  source: {recordId: string; effectiveAt: string | null} | null;
};

export function assessEvidence(type: GraphClaimType, sourceChanged: boolean, links: readonly EvidenceLink[]) {
  const required = localEvidencePolicy.minimumDistinctSources[type];
  const datedSupport = new Set<string>();
  const flags = new Set<'stale-source' | 'contradiction' | 'insufficient-annotation' | 'unknown-effective-time' | 'missing-support'>();

  if (sourceChanged) flags.add('stale-source');
  for (const link of links) {
    if (!link.source) {
      flags.add('stale-source');
      continue;
    }
    if (link.relationship === 'contradicting') flags.add('contradiction');
    if (link.relationship === 'insufficient') flags.add('insufficient-annotation');
    if (link.relationship === 'supported') {
      if (link.source.effectiveAt && Number.isFinite(Date.parse(link.source.effectiveAt))) {
        datedSupport.add(link.source.recordId);
      } else {
        flags.add('unknown-effective-time');
      }
    }
  }
  if (datedSupport.size < required) flags.add('missing-support');

  return {
    policyId: localEvidencePolicy.id,
    status: flags.size ? 'insufficient' as const : 'meets-local-rule' as const,
    evidenceState: 'unverified' as const,
    distinctDatedSupport: datedSupport.size,
    required,
    flags: [...flags].sort(),
  };
}
