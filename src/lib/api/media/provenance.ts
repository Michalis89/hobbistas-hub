/**
 * Where a search result came from: our own database or an external API, and
 * which providers contributed. A debugging aid for tuning the providers.
 *
 * Decided on the server and left out of the response entirely in production,
 * so it cannot leak through a client-side check. Shown in local development
 * and on Vercel preview deployments (VERCEL_ENV=preview), where NODE_ENV is
 * also "production" — hence VERCEL_ENV is checked first.
 */
export type SearchProvenance = {
  origin: 'local' | 'external';
  providers: string[];
};

export function exposeSearchProvenance(): boolean {
  const vercelEnv = process.env.VERCEL_ENV;
  if (vercelEnv) {
    return vercelEnv !== 'production';
  }
  return process.env.NODE_ENV !== 'production';
}

/** `{ provenance }` outside production, `{}` in production. */
export function provenanceField(
  origin: SearchProvenance['origin'],
  providers: (string | null | undefined)[],
): { provenance?: SearchProvenance } {
  if (!exposeSearchProvenance()) {
    return {};
  }
  return {
    provenance: {
      origin,
      providers: providers.filter((provider): provider is string => !!provider),
    },
  };
}
