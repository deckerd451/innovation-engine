import { createClient } from "npm:@supabase/supabase-js@2.119.0";
import { createWebhookHandler } from "./handler.mjs";
const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input: RequestInfo | URL, init?: RequestInit) =>
        fetch(input, { ...init, signal: AbortSignal.timeout(15000) }),
    },
  },
);
Deno.serve(
  createWebhookHandler({
    secret: Deno.env.get("RESEND_WEBHOOK_SECRET"),
    record: async (id: string, provider: string, type: string) => {
      const { error } = await db.rpc("record_email_campaign_event", {
        p_id: id,
        p_provider_id: provider,
        p_type: type,
      });
      if (error) throw error;
    },
  }),
);
