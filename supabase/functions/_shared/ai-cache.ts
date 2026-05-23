// Shared AI analysis cache helpers.
// Reads/writes rows in public.ai_analysis_cache so that AI analyses persist
// across views and only regenerate when the user explicitly forces a refresh.
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export type CacheKind = "candidate" | "donor" | "recipient" | "bill";

export interface CacheKey {
  kind: CacheKind;
  subject_id: string;
  cycle?: string | null;
  user_id?: string | null;
  input_fingerprint?: string | null;
}

export interface CachedRow<T = unknown> {
  payload: T;
  model: string | null;
  created_at: string;
  updated_at: string;
}

function adminClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, key);
}

export async function readCache<T = unknown>(key: CacheKey): Promise<CachedRow<T> | null> {
  try {
    const admin = adminClient();
    let q = admin
      .from("ai_analysis_cache")
      .select("payload, model, created_at, updated_at")
      .eq("kind", key.kind)
      .eq("subject_id", key.subject_id);
    q = key.cycle ? q.eq("cycle", key.cycle) : q.is("cycle", null);
    q = key.user_id ? q.eq("user_id", key.user_id) : q.is("user_id", null);
    q = key.input_fingerprint
      ? q.eq("input_fingerprint", key.input_fingerprint)
      : q.is("input_fingerprint", null);
    const { data, error } = await q.maybeSingle();
    if (error) {
      console.warn("ai-cache read error", error.message);
      return null;
    }
    return (data as CachedRow<T> | null) ?? null;
  } catch (e) {
    console.warn("ai-cache read threw", e);
    return null;
  }
}

export async function writeCache(
  key: CacheKey,
  payload: unknown,
  model?: string | null,
): Promise<{ updated_at: string } | null> {
  try {
    const admin = adminClient();
    const row = {
      kind: key.kind,
      subject_id: key.subject_id,
      cycle: key.cycle ?? null,
      user_id: key.user_id ?? null,
      input_fingerprint: key.input_fingerprint ?? null,
      payload,
      model: model ?? null,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await admin
      .from("ai_analysis_cache")
      .upsert(row, {
        onConflict: "kind,subject_id,cycle,user_id,input_fingerprint",
      })
      .select("updated_at")
      .maybeSingle();
    if (error) {
      console.warn("ai-cache write error", error.message);
      return null;
    }
    return data as { updated_at: string } | null;
  } catch (e) {
    console.warn("ai-cache write threw", e);
    return null;
  }
}

export async function fingerprint(input: unknown): Promise<string> {
  const canon = JSON.stringify(input, Object.keys(input as any).sort());
  const buf = new TextEncoder().encode(canon);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
