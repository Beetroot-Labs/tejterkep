import { supabaseBrowser } from '@/lib/supabaseBrowser'

export async function requireUser() {
  const { data, error } = await supabaseBrowser.auth.getUser()
  if (error) throw error
  if (!data.user) throw new Error('Nincs bejelentkezve')
  return data.user
}

