/**
 * Opaque per-run candidate identifiers.
 *
 * Candidates travel to the provider as c01, c02, ... rather than media ids. Two reasons, both
 * structural: real ids never leave the app, and pinning the response schema's enum to exactly the
 * tokens issued this run makes a hallucinated candidate impossible rather than merely detectable.
 */

export type RerankTokenMap = {
  /** token to mediaId */
  toMediaId: Map<string, number>;
  /** mediaId to token */
  toToken: Map<number, string>;
  /** Issued tokens, in deterministic shortlist order. */
  tokens: string[];
};

export function buildRerankTokenMap(mediaIds: readonly number[], maxCount: number): RerankTokenMap {
  const toMediaId = new Map<string, number>();
  const toToken = new Map<number, string>();
  const tokens: string[] = [];

  mediaIds.slice(0, maxCount).forEach((mediaId, index) => {
    const token = `c${String(index + 1).padStart(2, '0')}`;
    tokens.push(token);
    toMediaId.set(token, mediaId);
    toToken.set(mediaId, token);
  });

  return { toMediaId, toToken, tokens };
}
