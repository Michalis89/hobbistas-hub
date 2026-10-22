import { withApiRoute } from '@/lib/observability/withApiRoute';

import { createRouteHandlerClient } from '@/lib/supabase-route-handler';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { API_ERRORS } from '@/lib/api/errors';
import { fail, ok } from '@/lib/api/response';
import { UnauthorizedError } from '@/lib/api/auth';
import { ForbiddenError, requireAdminRole } from '@/lib/api/permissions';
import { isOwner } from '@/lib/roles';
import { rateLimit, rateLimitHeaders } from '@/lib/rate-limit';
import {
  ADMIN_EMAIL_PER_RECIPIENT_DAILY,
  ADMIN_EMAIL_PER_SENDER_DAILY,
  personalizeAdminMessage,
  resolveRecipientName,
  validateAdminEmailInput,
} from '@/lib/email/adminMessage';
import { sendAdminMessageEmail } from '@/lib/email/send';

/** Statuses that count toward the daily caps: failed attempts do not. */
const COUNTED_STATUSES = ['pending', 'accepted', 'simulated'];
const DAY_MS = 24 * 60 * 60 * 1000;

const NOT_ELIGIBLE = {
  error: 'This user cannot be contacted by email.',
  code: 'RECIPIENT_NOT_ELIGIBLE',
};

/**
 * Owner-only: email one user. The recipient address is always resolved here
 * from the user id; the request body only carries subject, message and a
 * per-compose idempotency key. Every attempt is recorded in admin_user_emails.
 */
async function POSTHandler(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createRouteHandlerClient();
    const { session, user: actor } = await requireAdminRole(supabase);
    if (!isOwner(actor)) {
      throw new ForbiddenError('Owner access required');
    }
    const senderId = session.user.id;

    const { id: userId } = await context.params;
    if (!userId) {
      return fail(API_ERRORS.BAD_REQUEST, API_ERRORS.BAD_REQUEST.status);
    }

    const body = await req.json().catch(() => null);
    const input = validateAdminEmailInput(body);
    if (!input.ok) {
      return fail({ error: input.error, code: 'BAD_REQUEST' }, 400);
    }
    const { subject, message, idempotencyKey } = input.value;

    const limit = await rateLimit('adminEmailSend', senderId);
    if (!limit.success) {
      return fail(
        { error: 'Too many emails sent. Please wait a few minutes.', code: 'RATE_LIMITED' },
        429,
        { headers: rateLimitHeaders(limit) },
      );
    }

    const admin = createSupabaseAdminClient();

    const { data: target, error: targetError } = await admin
      .from('users')
      .select('id,username,display_name,account_status,is_demo')
      .eq('id', userId)
      .maybeSingle();
    if (targetError) {
      console.error('Admin user email target fetch error:', targetError);
      return fail(API_ERRORS.INTERNAL, API_ERRORS.INTERNAL.status);
    }
    if (!target) {
      return fail(API_ERRORS.NOT_FOUND, API_ERRORS.NOT_FOUND.status);
    }
    if (target.account_status === 'deleted' || target.is_demo) {
      return fail(NOT_ELIGIBLE, 422);
    }

    // auth.users holds the address the user signs in with and whether they
    // ever proved they own it. Never mail an unconfirmed address: it may
    // belong to someone who did not sign up.
    const { data: authData, error: authError } = await admin.auth.admin.getUserById(userId);
    if (authError || !authData?.user) {
      return fail(NOT_ELIGIBLE, 422);
    }
    const recipientEmail = authData.user.email;
    if (!recipientEmail || !authData.user.email_confirmed_at) {
      return fail(NOT_ELIGIBLE, 422);
    }

    const since = new Date(Date.now() - DAY_MS).toISOString();
    const [recipientCount, senderCount] = await Promise.all([
      admin
        .from('admin_user_emails')
        .select('id', { count: 'exact', head: true })
        .eq('recipient_user_id', userId)
        .in('status', COUNTED_STATUSES)
        .gte('created_at', since),
      admin
        .from('admin_user_emails')
        .select('id', { count: 'exact', head: true })
        .eq('sender_user_id', senderId)
        .in('status', COUNTED_STATUSES)
        .gte('created_at', since),
    ]);
    if (recipientCount.error || senderCount.error) {
      console.error('Admin user email cap check error:', recipientCount.error ?? senderCount.error);
      return fail(API_ERRORS.INTERNAL, API_ERRORS.INTERNAL.status);
    }
    if ((recipientCount.count ?? 0) >= ADMIN_EMAIL_PER_RECIPIENT_DAILY) {
      return fail(
        {
          error: `This user has already received ${ADMIN_EMAIL_PER_RECIPIENT_DAILY} emails in the last 24 hours.`,
          code: 'RECIPIENT_DAILY_LIMIT',
        },
        429,
      );
    }
    if ((senderCount.count ?? 0) >= ADMIN_EMAIL_PER_SENDER_DAILY) {
      return fail(
        {
          error: `You have reached the limit of ${ADMIN_EMAIL_PER_SENDER_DAILY} emails per 24 hours.`,
          code: 'SENDER_DAILY_LIMIT',
        },
        429,
      );
    }

    const recipientName = resolveRecipientName(target);
    const personalizedSubject = personalizeAdminMessage(subject, recipientName);
    const personalizedMessage = personalizeAdminMessage(message, recipientName);

    const { data: logRow, error: insertError } = await admin
      .from('admin_user_emails')
      .insert({
        recipient_user_id: userId,
        recipient_email: recipientEmail,
        sender_user_id: senderId,
        // A long display name can push the personalized subject past the
        // column limit; the stored copy is for reference only.
        subject: personalizedSubject.slice(0, 150),
        status: 'pending',
        idempotency_key: idempotencyKey,
      })
      .select('id')
      .single();
    if (insertError) {
      if (insertError.code === '23505') {
        return fail(
          { error: 'This email has already been submitted.', code: 'DUPLICATE_SUBMISSION' },
          409,
        );
      }
      console.error('Admin user email audit insert error:', insertError);
      return fail(API_ERRORS.INTERNAL, API_ERRORS.INTERNAL.status);
    }

    const result = await sendAdminMessageEmail({
      to: recipientEmail,
      subject: personalizedSubject,
      message: personalizedMessage,
      idempotencyKey,
    });

    const { error: updateError } = await admin
      .from('admin_user_emails')
      .update(
        result.status === 'failed'
          ? {
              status: 'failed',
              error_code: result.errorCode,
              error_message: result.errorMessage,
              updated_at: new Date().toISOString(),
            }
          : {
              status: result.status,
              provider_message_id: result.status === 'accepted' ? result.providerMessageId : null,
              updated_at: new Date().toISOString(),
            },
      )
      .eq('id', logRow.id);
    if (updateError) {
      // The email outcome stands; the row stays 'pending' and still counts
      // toward the caps, which is the safe direction.
      console.error('Admin user email audit update error:', updateError);
    }

    if (result.status === 'failed') {
      console.error('Admin user email provider error:', result.errorCode);
      return fail(
        {
          error: 'The email provider rejected the message. Nothing was sent.',
          code: 'EMAIL_PROVIDER_ERROR',
        },
        502,
      );
    }

    return ok({ id: logRow.id, status: result.status });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return fail(API_ERRORS.UNAUTHORIZED, API_ERRORS.UNAUTHORIZED.status);
    }
    if (error instanceof ForbiddenError) {
      return fail(API_ERRORS.FORBIDDEN, API_ERRORS.FORBIDDEN.status);
    }
    console.error('Admin user email error:', error);
    return fail(API_ERRORS.INTERNAL, API_ERRORS.INTERNAL.status);
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withApiRoute(POSTHandler);
