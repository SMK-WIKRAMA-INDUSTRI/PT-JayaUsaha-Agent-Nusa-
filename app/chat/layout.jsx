import { redirect } from 'next/navigation';
import { getUser } from '../../lib/supabase/server';

export const metadata = {
  title: 'Chat Bantuan · Agent Nusa',
  description: 'Ngobrol dengan Agent Nusa, asisten virtual Agent Nusa.'
};

// /chat wajib login dan onboarding selesai (spec 5.1, keputusan Q26).
export default async function ChatLayout({ children }) {
  const { supabase, user } = await getUser();
  if (!user) redirect('/login?next=/chat');
  const { data: profile } = await supabase.from('profiles').select('onboarding_selesai_at').maybeSingle();
  if (!profile || !profile.onboarding_selesai_at) redirect('/onboarding');
  return children;
}
