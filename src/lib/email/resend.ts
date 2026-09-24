import { Resend } from 'resend';

/** Lets `npm run dev` boot without mail credentials; never sends anything. */
const DEV_PLACEHOLDER_KEY = 're_123456789';

let client: Resend | null = null;

/**
 * The Resend client, built on first use.
 *
 * Deliberately not constructed at module scope. `next build` imports every
 * route module while collecting page data, so a module-level throw makes the
 * whole route unloadable and fails the build anywhere the mail key is absent
 * - a CI runner, a fresh clone - even though nothing sends mail at build
 * time. Validating on first call moves the failure to the moment an email is
 * actually sent, where it is both accurate and actionable.
 */
export function getResendClient(): Resend {
  if (client) {
    return client;
  }

  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey && process.env.NODE_ENV !== 'development') {
    throw new Error('Missing RESEND_API_KEY environment variable');
  }

  client = new Resend(apiKey || DEV_PLACEHOLDER_KEY);
  return client;
}
