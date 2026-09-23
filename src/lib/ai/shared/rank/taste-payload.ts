/**
 * The slice of a taste profile that a reranker is allowed to see.
 *
 * Structural, not per-category, and that is a finding rather than an assumption: games, anime and
 * manga each own a different evidence document and a different `dataQuality`, but all three
 * enriched profiles expose the same outer shape — an identity, banded pillars, negative signals, a
 * summary and a sufficiency verdict. That shape is what ranking consumes, so mapping it once
 * stops three categories from maintaining three identical mappers.
 *
 * Two omissions are deliberate and must survive any future edit:
 *
 * *`evidenceTitles` never travel.* The pillar descriptions already carry the semantic claim, and
 * re-supplying library titles invites "more things like X" — the franchise-similarity behaviour
 * the deterministic side already handles better and cheaper.
 *
 * *`openQuestions` never travel.* They are ambiguities the profile itself flags as unresolved;
 * feeding them in silently promotes a stated uncertainty into a ranking criterion.
 */

/**
 * The minimum a category's enriched profile must expose to be rerankable.
 *
 * `kind` and `strengthBand` are plain strings, not unions, and that is deliberate rather than lazy.
 * Games pillars are `content | behavior` — what a player does — while anime and manga pillars are
 * `content | form`, because what a work *is* and how it is made is the axis that matters for
 * something you read or watch. A shared type that enumerated one taxonomy would silently exclude
 * the others, and the reranker has no business ranking taxonomies anyway: it passes both fields
 * through to its prompt verbatim.
 */
export type RerankTasteProfileSource = {
  identity: { label: string; description: string };
  pillars: ReadonlyArray<{
    name: string;
    kind: string;
    description: string;
    strengthBand: string;
  }>;
  negativeSignals: ReadonlyArray<{ name: string; description: string }>;
  summary: string;
  dataQuality: { sufficiency: string };
};

export type RerankTastePayload = {
  identity: { label: string; description: string };
  pillars: Array<{
    name: string;
    kind: string;
    description: string;
    strengthBand: string;
  }>;
  negativeSignals: Array<{ name: string; description: string }>;
  summary: string;
  sufficiency: string;
};

export function buildRerankTastePayload(profile: RerankTasteProfileSource): RerankTastePayload {
  return {
    identity: {
      label: profile.identity.label,
      description: profile.identity.description,
    },
    pillars: profile.pillars.map(pillar => ({
      name: pillar.name,
      kind: pillar.kind,
      description: pillar.description,
      strengthBand: pillar.strengthBand,
    })),
    negativeSignals: profile.negativeSignals.map(signal => ({
      name: signal.name,
      description: signal.description,
    })),
    summary: profile.summary,
    sufficiency: profile.dataQuality.sufficiency,
  };
}
