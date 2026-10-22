import { withApiRoute } from '@/lib/observability/withApiRoute';

import { createRouteHandlerClient } from '@/lib/supabase-route-handler';
import { API_ERRORS } from '@/lib/api/errors';
import { ok, fail } from '@/lib/api/response';
import { requireAuth, UnauthorizedError } from '@/lib/api/auth';
import { hasAnyRole } from '@/lib/roles';
import type { Database, Json } from '@/lib/supabase/database.types';
import getSupabaseServer from '@/lib/supabase-server';
import { SUPPORT_STATUS_OPTIONS, type SupportStatus } from '@/lib/constants/support';

const STATUS_SET = new Set(SUPPORT_STATUS_OPTIONS);

function isSupportStatus(value: string): value is SupportStatus {
  return STATUS_SET.has(value as SupportStatus);
}

async function ensureAdmin(supabase: Awaited<ReturnType<typeof createRouteHandlerClient>>) {
  const session = await requireAuth(supabase);
  const { data: userData } = await supabase
    .from('users')
    .select('roles')
    .eq('id', session.user.id)
    .single();

  if (!userData || !hasAnyRole(userData, ['admin', 'owner', 'moderator'])) {
    throw new Error('FORBIDDEN');
  }

  return session;
}

async function GETHandler(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createRouteHandlerClient();
    await ensureAdmin(supabase);

    const { id: ticketId } = await context.params;

    const { data: ticket, error: ticketError } = await supabase
      .from('support_tickets')
      .select('*')
      .eq('id', ticketId)
      .single();

    if (ticketError || !ticket) {
      return fail(API_ERRORS.NOT_FOUND, API_ERRORS.NOT_FOUND.status);
    }

    const { error: markReadError } = await supabase.rpc('mark_support_ticket_as_read', {
      p_ticket_id: ticketId,
    });
    if (markReadError) {
      console.error('Admin support ticket mark-as-read error:', markReadError);
    }

    const { data: messages, error: messagesError } = await supabase
      .from('support_messages')
      .select('*')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true });

    if (messagesError) {
      console.error('Admin support messages fetch error:', messagesError);
      return fail(API_ERRORS.INTERNAL, API_ERRORS.INTERNAL.status);
    }

    const { data: attachments, error: attachmentsError } = await supabase
      .from('support_attachments')
      .select('*')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true });

    if (attachmentsError) {
      console.error('Admin support attachments fetch error:', attachmentsError);
      return fail(API_ERRORS.INTERNAL, API_ERRORS.INTERNAL.status);
    }

    const { data: events, error: eventsError } = await supabase
      .from('support_ticket_events')
      .select('*')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true });

    if (eventsError) {
      console.error('Admin support events fetch error:', eventsError);
      return fail(API_ERRORS.INTERNAL, API_ERRORS.INTERNAL.status);
    }

    const attachmentsWithUrls = await Promise.all(
      (attachments ?? []).map(async attachment => {
        const { data: signedData } = await supabase.storage
          .from('support-attachments')
          .createSignedUrl(attachment.storage_path, 60 * 60);

        return {
          ...attachment,
          signed_url: signedData?.signedUrl ?? null,
        };
      }),
    );

    return ok({
      ticket,
      messages: messages ?? [],
      attachments: attachmentsWithUrls,
      events: events ?? [],
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return fail(API_ERRORS.UNAUTHORIZED, API_ERRORS.UNAUTHORIZED.status);
    }
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      return fail(API_ERRORS.FORBIDDEN, API_ERRORS.FORBIDDEN.status);
    }
    console.error('Admin support ticket detail error:', error);
    return fail(API_ERRORS.INTERNAL, API_ERRORS.INTERNAL.status);
  }
}

async function PATCHHandler(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createRouteHandlerClient();
    const session = await ensureAdmin(supabase);
    const { id: ticketId } = await context.params;
    const body = await req.json();

    const status = typeof body.status === 'string' ? body.status : null;
    const hasAssignedTo = Object.prototype.hasOwnProperty.call(body, 'assigned_to');
    const assignedTo =
      typeof body.assigned_to === 'string' ? body.assigned_to : hasAssignedTo ? null : undefined;
    const labels = Array.isArray(body.labels) ? body.labels.map(String) : null;

    const { data: currentTicket, error: currentError } = await supabase
      .from('support_tickets')
      .select('status, assigned_to, labels')
      .eq('id', ticketId)
      .single();

    if (currentError || !currentTicket) {
      return fail(API_ERRORS.NOT_FOUND, API_ERRORS.NOT_FOUND.status);
    }

    const updates: Database['public']['Tables']['support_tickets']['Update'] = {};
    const events: Array<{ type: string; payload: Record<string, unknown> }> = [];

    if (status && isSupportStatus(status) && status !== currentTicket.status) {
      updates.status = status;
      events.push({
        type: 'status_change',
        payload: { from: currentTicket.status, to: status },
      });
    }

    if (assignedTo !== undefined && assignedTo !== currentTicket.assigned_to) {
      updates.assigned_to = assignedTo || null;
      events.push({
        type: 'assignment',
        payload: { from: currentTicket.assigned_to, to: assignedTo },
      });
    }

    if (labels !== null) {
      const currentLabels = Array.isArray(currentTicket.labels)
        ? currentTicket.labels.map(String).sort()
        : [];
      const nextLabels = labels.map(String).sort();
      const labelsChanged = JSON.stringify(currentLabels) !== JSON.stringify(nextLabels);
      if (labelsChanged) {
        updates.labels = labels;
        events.push({
          type: 'label_change',
          payload: { from: currentTicket.labels ?? [], to: labels },
        });
      }
    }

    if (Object.keys(updates).length === 0) {
      return ok({ ticket: currentTicket });
    }

    const { data: updatedTicket, error: updateError } = await supabase
      .from('support_tickets')
      .update(updates)
      .eq('id', ticketId)
      .select('*')
      .single();

    if (updateError || !updatedTicket) {
      console.error('Admin support ticket update error:', updateError);
      return fail(API_ERRORS.INTERNAL, API_ERRORS.INTERNAL.status);
    }

    if (events.length > 0) {
      const insertPayload: Database['public']['Tables']['support_ticket_events']['Insert'][] =
        events.map(event => ({
          ticket_id: ticketId,
          type: event.type,
          payload: event.payload as Json,
          actor_user_id: session.user.id,
        }));
      await supabase.from('support_ticket_events').insert(insertPayload);
    }

    return ok({ ticket: updatedTicket });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return fail(API_ERRORS.UNAUTHORIZED, API_ERRORS.UNAUTHORIZED.status);
    }
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      return fail(API_ERRORS.FORBIDDEN, API_ERRORS.FORBIDDEN.status);
    }
    console.error('Admin support ticket update error:', error);
    return fail(API_ERRORS.INTERNAL, API_ERRORS.INTERNAL.status);
  }
}

export const dynamic = 'force-dynamic';

async function DELETEHandler(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createRouteHandlerClient();
    await ensureAdmin(supabase);
    const { id: ticketId } = await context.params;

    const supabaseServer = getSupabaseServer();
    const { error } = await supabaseServer.from('support_tickets').delete().eq('id', ticketId);
    if (error) {
      console.error('Admin support ticket delete error:', error);
      return fail(API_ERRORS.INTERNAL, API_ERRORS.INTERNAL.status);
    }

    return ok({ message: 'Ticket was permanently deleted.' });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return fail(API_ERRORS.UNAUTHORIZED, API_ERRORS.UNAUTHORIZED.status);
    }
    if (error instanceof Error && error.message === 'FORBIDDEN') {
      return fail(API_ERRORS.FORBIDDEN, API_ERRORS.FORBIDDEN.status);
    }
    console.error('Admin support ticket delete error:', error);
    return fail(API_ERRORS.INTERNAL, API_ERRORS.INTERNAL.status);
  }
}

export const GET = withApiRoute(GETHandler);
export const PATCH = withApiRoute(PATCHHandler);
export const DELETE = withApiRoute(DELETEHandler);
