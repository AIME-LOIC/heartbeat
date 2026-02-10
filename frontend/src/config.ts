import { createClient, type SupabaseClient } from '@supabase/supabase-js';

type ViteEnv = {
  VITE_API_BASE_URL?: string;
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
};

const env = import.meta.env as unknown as ViteEnv;

export const API_BASE_URL = (env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '');
export const SUPABASE_URL = env.VITE_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = env.VITE_SUPABASE_ANON_KEY ?? '';

export const supabase: SupabaseClient | null =
  SUPABASE_URL && SUPABASE_ANON_KEY ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

export function apiUrl(path: string): string {
  if (!path.startsWith('/')) return apiUrl(`/${path}`);
  return `${API_BASE_URL}${path}`;
}
