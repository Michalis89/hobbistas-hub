/**
 * Recovering JSON from a model response.
 *
 * Constrained decoding makes malformed output rare rather than impossible: a fence, a leading
 * apology, or a truncated tail all still happen. These helpers do the cheap recovery and nothing
 * more — they never repair the *contents*, only the wrapper, because a patched-up object that
 * passes validation is worse than a clean rejection.
 */

export function stripJsonFence(text: string): string {
  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced?.[1]?.trim() ?? text;
}

export function extractJsonObject(text: string): string | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) {
    return null;
  }
  return text.slice(start, end + 1);
}

/**
 * Parses model output, retrying once against the outermost `{...}` span.
 *
 * `onInvalid` supplies the error to throw so each caller keeps its own failure classification —
 * the distinction between "unparseable" and "quota" drives different backoffs, and a shared
 * generic error would erase it.
 */
export function parseStructuredJson(text: string, onInvalid: () => Error): unknown {
  const unfenced = stripJsonFence(text.trim());

  try {
    return JSON.parse(unfenced);
  } catch {
    const extracted = extractJsonObject(unfenced);
    if (extracted) {
      try {
        return JSON.parse(extracted);
      } catch {
        throw onInvalid();
      }
    }
    throw onInvalid();
  }
}
