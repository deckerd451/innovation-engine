// Supabase Edge Function: buildspace-assist
// Thin Deno wrapper; all behaviour lives in ../_shared/assist/ so it can be
// tested under Node. See docs/BUILDSPACE_ASSIST_SERVICE.md before deploying.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { createHandler } from '../_shared/assist/handler.mjs';
import { createProviderRegistry } from '../_shared/assist/providers.mjs';

const ENV_KEYS = [
  'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'BUILDSPACE_SUPABASE_PUBLISHABLE_KEY',
  'ANTHROPIC_API_KEY', 'BUILDSPACE_AI_ANTHROPIC_MODEL', 'BUILDSPACE_AI_APPROVED_PROVIDERS',
  'BUILDSPACE_AI_DISABLED', 'BUILDSPACE_AI_TIMEOUT_MS', 'BUILDSPACE_AI_MAX_OUTPUT_TOKENS',
  'BUILDSPACE_ALLOWED_ORIGINS',
];
const env: Record<string, string> = Object.fromEntries(ENV_KEYS.map((key) => [key, Deno.env.get(key) ?? '']));
const noSession = { auth: { persistSession: false, autoRefreshToken: false } };

Deno.serve(createHandler({
  env,
  // Acts as the member: every read is subject to row-level security.
  // Projects without a legacy anon key can supply their publishable key instead.
  createUserClient: (jwt: string) => createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY || env.BUILDSPACE_SUPABASE_PUBLISHABLE_KEY, {
    ...noSession,
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  }),
  // Used only for the usage-ledger RPCs, which are not granted to members.
  createLedgerClient: () => (env.SUPABASE_SERVICE_ROLE_KEY ? createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, noSession) : null),
  providers: createProviderRegistry(env, fetch),
  log: (entry: Record<string, unknown>) => console.log(JSON.stringify(entry)),
}));
