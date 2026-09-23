import type { ZodError, ZodIssue } from 'zod';

/**
 * Turning a Zod failure into something safe to log.
 *
 * Gemini enforces types, enums and required fields under constrained decoding, but treats
 * string-length and array-length bounds as advisory — so an overrun that reaches Zod is almost
 * always a length one. Naming the field turns the next occurrence into a fact instead of a guess.
 *
 * Shape only, and that is the load-bearing property: path, code, the bound that was violated, and
 * the received type and size. Never the received *value*, which is generated text about the user's
 * library and must not reach a log line.
 */

export type TasteSchemaIssue = {
  path: string;
  code: string;
  expected: string;
  receivedType: string;
  receivedCount?: number;
};

const MAX_LOGGED_SCHEMA_ISSUES = 6;

export function summarizeTasteSchemaIssues(error: ZodError, raw: unknown): TasteSchemaIssue[] {
  return error.issues.slice(0, MAX_LOGGED_SCHEMA_ISSUES).map(issue => {
    const received = resolveAtPath(raw, issue.path);
    return {
      path: issue.path.map(String).join('.') || '<root>',
      code: issue.code,
      expected: describeConstraint(issue),
      receivedType: describeType(received),
      receivedCount: measureSize(received),
    };
  });
}

function describeConstraint(issue: ZodIssue): string {
  const candidate = issue as ZodIssue & {
    minimum?: number | bigint;
    maximum?: number | bigint;
    expected?: string;
    options?: unknown[];
  };
  if (candidate.minimum !== undefined) {
    return `min ${String(candidate.minimum)}`;
  }
  if (candidate.maximum !== undefined) {
    return `max ${String(candidate.maximum)}`;
  }
  if (candidate.options !== undefined) {
    return `one of ${candidate.options.length}`;
  }
  return candidate.expected ?? issue.code;
}

function describeType(value: unknown): string {
  if (value === null) {
    return 'null';
  }
  if (Array.isArray(value)) {
    return 'array';
  }
  return typeof value;
}

function measureSize(value: unknown): number | undefined {
  if (typeof value === 'string') {
    return value.length;
  }
  if (Array.isArray(value)) {
    return value.length;
  }
  return undefined;
}

function resolveAtPath(raw: unknown, path: ReadonlyArray<PropertyKey>): unknown {
  let cursor: unknown = raw;
  for (const segment of path) {
    if (cursor === null || typeof cursor !== 'object') {
      return undefined;
    }
    cursor = (cursor as Record<PropertyKey, unknown>)[segment];
  }
  return cursor;
}
