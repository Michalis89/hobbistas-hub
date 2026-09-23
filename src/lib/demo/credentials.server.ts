/**
 * The demo account's sign-in credentials.
 *
 * Deliberately its own module. `@/lib/demo` is imported by client components
 * for `isDemoEnabled` and `isDemoUserId`, and a reader of server-only secrets
 * has no business living in a file the browser bundle pulls in. Next.js does
 * strip non-`NEXT_PUBLIC_` variables from client output, so nothing leaked -
 * but that is a property of the bundler, not of the code, and the next person
 * to add a fallback here should not have to know it.
 */
export function getDemoCredentials(): { email: string; password: string } | null {
  const email = process.env.DEMO_USER_EMAIL;
  const password = process.env.DEMO_USER_PASSWORD;
  if (!email || !password) {
    return null;
  }
  return { email, password };
}
