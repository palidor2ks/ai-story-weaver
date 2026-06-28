import { supabase } from '@/integrations/supabase/client';

/**
 * The one front door for calling Supabase edge functions from the app.
 *
 * Components/pages must not import the Supabase client directly (see
 * docs/ARCHITECTURE-AUDIT.md, Step 2); routing every `functions.invoke` through
 * this helper keeps client access in one place — a single seam for auth headers,
 * logging, or error normalization later. Returns the raw `{ data, error }` so
 * callers keep their existing branching.
 */
// Default T to `any` to match supabase-js's own `invoke<T = any>` default, so
// existing callers that read `data.foo` without a type argument keep working
// exactly as they did when calling the client directly.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function invokeEdgeFunction<T = any>(
  name: string,
  options?: Parameters<typeof supabase.functions.invoke>[1],
) {
  return supabase.functions.invoke<T>(name, options);
}
