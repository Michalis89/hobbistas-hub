-- 20261023_rc056_admin_user_emails.sql
-- Purpose: audit log for emails the owner sends to a single user from the
-- admin users table (POST /api/admin/support/users/[id]/email).
--
-- One row per send attempt. The row is written as 'pending' before the
-- provider call and moved to 'accepted' (provider took it - not proof of
-- delivery), 'failed' (sanitized error stored) or 'simulated' (development
-- without a mail key; nothing left the machine).
--
-- The message body is deliberately not stored: only the subject, the address
-- used at send time, and provider metadata.
--
-- (sender_user_id, idempotency_key) is unique: the composer sends one key per
-- compose session, so a double click or a retried request cannot create a
-- second email. The route also counts recent rows to cap sends per recipient
-- and per sender, hence the two time-ordered indexes.
--
-- Rows go with the recipient's account (on delete cascade), so deleting an
-- account also erases the address it was mailed at. The sender column is set
-- null instead, keeping the history if an admin account is removed.
--
-- Service role only: RLS is enabled with no policies, and table privileges
-- are revoked from anon and authenticated.

create table if not exists public.admin_user_emails (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references public.users (id) on delete cascade,
  recipient_email text not null,
  sender_user_id uuid references public.users (id) on delete set null,
  subject text not null check (char_length(subject) between 1 and 150),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'failed', 'simulated')),
  provider text not null default 'resend',
  provider_message_id text,
  error_code text,
  error_message text,
  idempotency_key uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists admin_user_emails_sender_idempotency_key
  on public.admin_user_emails (sender_user_id, idempotency_key);

create index if not exists admin_user_emails_recipient_created_idx
  on public.admin_user_emails (recipient_user_id, created_at desc);

create index if not exists admin_user_emails_sender_created_idx
  on public.admin_user_emails (sender_user_id, created_at desc);

alter table public.admin_user_emails enable row level security;

revoke all on table public.admin_user_emails from anon, authenticated;
