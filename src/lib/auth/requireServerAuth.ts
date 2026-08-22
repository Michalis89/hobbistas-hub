import { redirect } from 'next/navigation';
import { createRouteHandlerClient } from '@/lib/supabase-route-handler';
import { getLoginUrl } from '@/lib/routes/authRoutes';

export async function requireServerAuth(redirectPath = '/dashboard') {
  const supabase = await createRouteHandlerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session || !session.user) {
    redirect(getLoginUrl(redirectPath));
  }

  return session;
}
