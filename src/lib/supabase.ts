import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env";

let client: SupabaseClient | null = null;

/** Server-only Supabase client using the secret key (bypasses RLS). Never import from client components. */
export function db(): SupabaseClient {
  if (!client) {
    client = createClient(env.supabaseUrl(), env.supabaseSecret(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

/** Throw on Supabase errors so callers can stay linear. */
export function must<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  if (res.data === null) throw new Error(`${what}: not found`);
  return res.data;
}

export type Lecture = {
  id: string;
  course_id: string;
  title: string;
  lecture_date: string;
  audio_path: string | null;
  status: string;
  error: string | null;
  duration_s: number | null;
};

export type Segment = {
  idx: number;
  start_s: number;
  end_s: number;
  speaker: string | null;
  text: string;
};
