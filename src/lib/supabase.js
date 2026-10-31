import { createClient } from '@supabase/supabase-js';

// flowType 'pkce' — токен приходит в ?code=, а не в #hash (hash занят HashRouter)
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  { auth: { flowType: 'pkce' } },
);

export const BUCKET = 'event-images';

export function imageUrl(path) {
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}
