import { ExternalFetchError } from '@/lib/api-cache/external';

/**
 * Book providers fail soft: a failed call just contributes no results. An
 * HTTP error from the provider (rate limit, 503) is expected and gets one
 * line; anything else (network, parsing, a bug) keeps the full error.
 */
export function logProviderError(provider: string, error: unknown) {
  if (error instanceof ExternalFetchError) {
    console.warn(`${provider} unavailable (HTTP ${error.status}); continuing without it.`);
    return;
  }
  console.warn(`${provider} error:`, error);
}
