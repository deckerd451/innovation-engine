import { createClient } from "npm:@supabase/supabase-js@2.119.0";
import { createCampaignHandler, emailContent } from "./handler.mjs";
const url = Deno.env.get("SUPABASE_URL")!,
  anon = Deno.env.get("SUPABASE_ANON_KEY")!,
  service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const base = new URL(
  Deno.env.get("CAMPAIGN_APP_URL") ||
    "https://deckerd451.github.io/innovation-engine/",
);
if (
  base.protocol !== "https:" ||
  base.search ||
  base.hash ||
  base.username ||
  base.password ||
  !base.pathname.endsWith("/")
)
  throw Error("Configure a fixed HTTPS app base ending in /");
const webhookSecret = Deno.env.get("RESEND_WEBHOOK_SECRET");
const apiKey = Deno.env.get("RESEND_API_KEY"),
  postal = Deno.env.get("CAMPAIGN_POSTAL_ADDRESS"),
  sender =
    Deno.env.get("CAMPAIGN_FROM_EMAIL") ||
    "CharlestonHacks <noreply@notify.charlestonhacks.com>";
const options = {
  global: {
    fetch: (input: RequestInfo | URL, init?: RequestInit) =>
      fetch(input, { ...init, signal: AbortSignal.timeout(15000) }),
  },
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
    flowType: "implicit" as const,
  },
};
const db = createClient(url, service, options);
async function rpc(name: string, args: Record<string, unknown>) {
  const { data, error } = await db.rpc(name, args);
  if (error) throw error;
  return data;
}
Deno.serve(
  createCampaignHandler({
    origin: base.origin,
    ready: () =>
      Boolean(
        webhookSecret?.startsWith("whsec_") &&
          apiKey &&
          postal &&
          postal.trim().length >= 10 &&
          sender &&
          !/[\r\n]/.test(sender),
      ),
    authenticate: async (token: string) => {
      const { data, error } = await createClient(
        url,
        anon,
        options,
      ).auth.getUser(token.slice(7));
      if (error) throw error;
      return data.user;
    },
    reserve: (id: string, actor: string, mode: string, reviewed: boolean) =>
      rpc("reserve_email_campaign_batch", {
        p_id: id,
        p_actor: actor,
        p_mode: mode,
        p_reviewed: reviewed,
      }),
    unsubscribe: (token: string) =>
      rpc("unsubscribe_campaign_email", { p_token: token }),
    finish: (
      id: string,
      outcome: { status: string; provider_id?: string; code?: string },
    ) =>
      rpc("finish_email_campaign_recipient", {
        p_id: id,
        p_status: outcome.status,
        p_provider_id: outcome.provider_id || null,
        p_code: outcome.code || null,
      }),
    send: async (row: {
      id: string;
      email: string;
      needs_claim: boolean;
      is_test: boolean;
      unsubscribe_token: string;
    }) => {
      await new Promise((resolve) => setTimeout(resolve, 600));
      let claimUrl: string | undefined;
      if (row.needs_claim && !row.is_test) {
        const { data, error } = await db.auth.admin.generateLink({
          type: "magiclink",
          email: row.email,
          options: { redirectTo: new URL("claim.html", base).href },
        });
        if (error || !data.properties?.action_link)
          return { status: "failed", code: "claim_link_unavailable" };
        claimUrl = data.properties.action_link;
      }
      const content = emailContent(row, {
        base: base.href,
        postal: postal!,
        claimUrl,
      });
      const oneClick = new URL(url + "/functions/v1/campaign-email");
      oneClick.searchParams.set("unsubscribe", row.unsubscribe_token);
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        signal: AbortSignal.timeout(15000),
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `campaign-${row.id}`,
        },
        body: JSON.stringify({
          from: sender,
          to: [row.email],
          ...content,
          headers: {
            "List-Unsubscribe": `<${oneClick.href}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
        }),
      });
      if (!response.ok)
        return {
          status: response.status >= 500 ? "unknown" : "failed",
          code:
            response.status === 429
              ? "provider_rate_limit"
              : "provider_rejected",
        };
      let data;
      try {
        data = await response.json();
      } catch {
        return { status: "unknown", code: "invalid_provider_receipt" };
      }
      return typeof data.id === "string"
        ? { status: "accepted", provider_id: data.id, code: "accepted" }
        : { status: "unknown", code: "missing_provider_receipt" };
    },
  }),
);
