---
name: write-tests
description: Write or fix jest tests for this codebase — API route handlers, hooks, React components, or pure logic modules. Use when adding test coverage, doing TDD on a bug fix, mocking Supabase or lucide-react, choosing the node vs jsdom environment, or when a test fails for setup reasons rather than a real defect.
---

# Testing in Hobbistas

Jest + Testing Library, configured through `next/jest` in `jest.config.mjs`. Coverage is collected on every run (`npm test` = `jest --coverage`).

Setup facts that matter:
- Default `testEnvironment: 'jsdom'`.
- `moduleNameMapper`: `@/*` → `src/*`, and `lucide-react` → `__mocks__/lucide-react.js`.
- `setupFilesAfterEnv`: `jest.setup.ts` → `@testing-library/jest-dom`.
- `clearMocks: true` — mocks reset between tests automatically; do not add manual `clearAllMocks` in `beforeEach`.
- Tests co-locate in a `__tests__/` folder next to the source.

Run targeted first, always:
```
npx jest src/app/api/auth
npx jest src/lib/recommendations/v3
npm test                     # full suite + coverage
```

## API route handler tests

Use the node environment and hoisted mock functions declared **before** the `jest.mock` calls, then import the route **after** them.

```ts
/**
 * @jest-environment node
 */
import 'whatwg-fetch';

const createRouteHandlerClientMock = jest.fn();
const rateLimitMock = jest.fn();

jest.mock('@/lib/observability/withApiRoute', () => ({
  __esModule: true,
  withApiRoute: (handler: unknown) => handler,
}));

jest.mock('@/lib/supabase-route-handler', () => ({
  __esModule: true,
  createRouteHandlerClient: (...args: unknown[]) => createRouteHandlerClientMock(...args),
}));

jest.mock('@/lib/rate-limit', () => ({
  __esModule: true,
  rateLimit: (...args: unknown[]) => rateLimitMock(...args),
  getClientIp: () => '1.2.3.4',
  rateLimitHeaders: () => ({}),
}));

jest.mock('@/lib/api/response', () => ({
  __esModule: true,
  fail: jest.fn((body: unknown, status: number, init?: ResponseInit) => ({
    status, init, json: async () => body,
  })),
  ok: jest.fn((body: unknown, init?: ResponseInit) => ({
    status: 200, init, json: async () => ({ data: body }),
  })),
}));

import { POST } from '@/app/api/auth/login/route';
import { API_ERRORS } from '@/lib/api/errors';
```

Why each piece:
- `@jest-environment node` — route handlers use `Request`/`Response`, not the DOM.
- `'whatwg-fetch'` — supplies `Request`/`Response` in the node env.
- **Stubbing `withApiRoute` to identity** is required; otherwise the observability logger runs and swallows the shape you are asserting on.
- Stubbing `ok`/`fail` to plain objects makes assertions read `expect(res.status).toBe(401)` and `await res.json()` without touching `NextResponse`.

Build the request with a helper:
```ts
function makeRequest(body: unknown) {
  return new Request('http://localhost/api/auth/login', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}
```

### Mocking the Supabase chain

Supabase queries are fluent, so mock each link explicitly — build inside-out from the terminal method:

```ts
const maybeSingle = jest.fn().mockResolvedValue({ data: { email: 'a@b.c' }, error: null });
const eq = jest.fn().mockReturnValue({ maybeSingle });
const select = jest.fn().mockReturnValue({ eq });
const from = jest.fn().mockReturnValue({ select });

createRouteHandlerClientMock.mockResolvedValue({
  from,
  auth: {
    getSession: jest.fn().mockResolvedValue({ data: { session: null }, error: null }),
    signInWithPassword: jest.fn().mockResolvedValue({ data: {}, error: null }),
  },
  rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
});
```

When one test needs several tables, make `from` dispatch on the table name. Factor the whole thing into a `createXClient(opts)` helper in the test file so each case only overrides what it cares about — see `src/app/api/auth/__tests__/login.test.ts`.

Cover at minimum: happy path, each validation-failure branch, the auth/permission failure, the rate-limit rejection, and the Supabase-error → 500 path.

## Component and hook tests

Default jsdom environment, no directive needed.

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
```

- Query by role/label/text — not by class or test id, unless there is no accessible handle.
- Hooks: `renderHook` from `@testing-library/react`; wrap in the providers the hook actually needs rather than the whole app.
- Components reading Redux need a store wrapper; only `authSlice` exists, so a minimal `configureStore` with that reducer is enough.
- SWR-backed components: mock `@/lib/api/client`'s `apiClient`, not global `fetch`.
- `lucide-react` is auto-mocked — do not mock it again per test.

## Pure logic

Recommendation engines, scorers, validators, crypto helpers: plain unit tests, no mocks, table-driven where the input space is wide. `src/lib/recommendations/v3/__tests__/` is the model.

## Coverage notes

`coveragePathIgnorePatterns` excludes `src/lib`, `src/utils`, and `src/types` from the coverage report — those still need tests, they just do not move the number. Unreachable defensive branches are marked with `/* c8 ignore next */` (v8 provider); use that sparingly and only for genuinely unreachable guards.

## TDD

For non-trivial logic and every bug fix: write the failing test first, confirm it fails for the right reason, then fix. Never adjust a test to match broken behavior — fix the source.
