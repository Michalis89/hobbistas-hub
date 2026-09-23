import { logApiRequest } from '@/lib/observability/requestLogger';
import { fail } from '@/lib/api/response';
import { DEMO_WRITE_BLOCKED_MESSAGE, isDemoWriteBlocked } from '@/lib/demo';

export function withApiRoute<Ctx extends unknown[]>(
  handler: (request: Request, ...context: Ctx) => Promise<Response>,
): (request: Request, ...context: Ctx) => Promise<Response> {
  return async function (request: Request, ...context: Ctx) {
    const start = Date.now();

    // The single choke point for demo writes that reach an API route. RLS
    // already refuses the ones the browser sends straight to Supabase, but a
    // route writing with the service role bypasses RLS entirely - this is what
    // stops those.
    if (isDemoWriteBlocked(request)) {
      const response = fail({ error: DEMO_WRITE_BLOCKED_MESSAGE, code: 'DEMO_READ_ONLY' }, 403);
      logApiRequest({
        method: request.method,
        path: new URL(request.url).pathname,
        status: 403,
        durationMs: Date.now() - start,
      });
      return response;
    }

    try {
      const response = await handler(request, ...context);
      const duration = Date.now() - start;
      logApiRequest({
        method: request.method,
        path: new URL(request.url).pathname,
        status: response?.status ?? 200,
        durationMs: duration,
      });
      return response;
    } catch (error) {
      const duration = Date.now() - start;
      logApiRequest({
        method: request.method,
        path: new URL(request.url).pathname,
        status: 500,
        durationMs: duration,
        error: true,
      });
      throw error;
    }
  };
}
