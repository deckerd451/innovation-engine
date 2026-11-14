// Server-owned recipient and link selection. No credentials or tokens leave this handler.
export const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (ch) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        ch
      ],
  );
export async function readBody(request, limit = 8192) {
  const reader = request.body?.getReader();
  if (!reader) throw Error("Missing body");
  let size = 0;
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw Error("Body too large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.length;
  }
  return new TextDecoder().decode(bytes);
}
export function emailContent(row, { base, postal, claimUrl }) {
  const unsubscribe = new URL("unsubscribe.html", base);
  unsubscribe.hash = row.unsubscribe_token;
  const destination = new URL("index.html", base);
  if (row.destination !== "home")
    destination.searchParams.set("campaign_resource", row.destination);
  const url = row.is_test
    ? destination.href
    : row.needs_claim
      ? claimUrl
      : destination.href;
  if (!url) throw Error("Verified claim link required");
  const label = row.is_test
    ? "Preview app destination (test only)"
    : row.needs_claim
      ? "Claim your profile"
      : "Explore your community";
  const intro = row.is_test
    ? "TEST EMAIL — no recipient profile is claimed by this preview."
    : `Hello${row.name ? " " + row.name : ""},`;
  const text = `${intro}\n\n${row.message}\n\n${label}: ${url}\n\nCharlestonHacks\n${postal}\n\nUnsubscribe from community campaigns: ${unsubscribe.href}\nSign-in and security emails are unaffected.`;
  const html = `<h1>${escapeHtml(row.subject)}</h1><p>${escapeHtml(intro)}</p><p style="white-space:pre-wrap">${escapeHtml(row.message)}</p><p><a href="${escapeHtml(url)}">${escapeHtml(label)}</a></p><hr><p>CharlestonHacks<br>${escapeHtml(postal)}</p><p><a href="${escapeHtml(unsubscribe.href)}">Unsubscribe from community campaigns</a><br>Sign-in and security emails are unaffected.</p>`;
  return { subject: (row.is_test ? "[TEST] " : "") + row.subject, text, html };
}
export function createCampaignHandler({
  origin,
  authenticate,
  reserve,
  send,
  finish,
  unsubscribe,
  ready,
}) {
  const headers = {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers":
      "authorization, apikey, x-client-info, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    Vary: "Origin",
  };
  const reply = (status, body) =>
    new Response(JSON.stringify(body), { status, headers });
  return async (request) => {
    if (
      request.headers.get("Origin") &&
      request.headers.get("Origin") !== origin
    )
      return reply(403, { error: "Origin not allowed" });
    if (request.method === "OPTIONS")
      return new Response(null, { status: 204, headers });
    if (request.method !== "POST") return reply(405, { error: "Use POST" });
    const token = new URL(request.url).searchParams.get("unsubscribe");
    if (token) {
      try {
        await readBody(request, 1024);
        await unsubscribe(token);
        return reply(200, { ok: true });
      } catch {
        return reply(503, { error: "Preference service unavailable" });
      }
    }
    const auth = request.headers.get("Authorization");
    if (!auth?.startsWith("Bearer "))
      return reply(401, { error: "Sign in again" });
    let user;
    try {
      user = await authenticate(auth);
    } catch {
      return reply(401, { error: "Sign in again" });
    }
    if (!user) return reply(401, { error: "Sign in again" });
    let body;
    try {
      body = JSON.parse(await readBody(request));
    } catch {
      return reply(400, { error: "Invalid request" });
    }
    if (
      !body ||
      Object.keys(body).some(
        (k) => !["campaign_id", "mode", "reviewed"].includes(k),
      ) ||
      !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(
        body.campaign_id || "",
      ) ||
      !["test", "pilot", "batch"].includes(body.mode) ||
      (body.reviewed !== undefined && typeof body.reviewed !== "boolean")
    )
      return reply(400, { error: "Invalid campaign request" });
    if (!ready())
      return reply(503, {
        error:
          "Campaign delivery needs server setup: sender, postal address, Resend credentials and signed webhook.",
      });
    let rows;
    try {
      rows = await reserve(
        body.campaign_id,
        user.id,
        body.mode,
        body.reviewed === true,
      );
      if (!Array.isArray(rows)) throw Error("Invalid reservations");
    } catch (error) {
      return reply(error.code === "42501" ? 403 : 400, {
        error:
          error.code === "42501"
            ? "Campaign unavailable or admin access required"
            : error.code === "22023"
              ? String(error.message).slice(0, 180)
              : "Campaign service unavailable",
      });
    }
    const results = [];
    const deadline = Date.now() + 70000;
    for (const row of rows) {
      let outcome = { status: "unknown", code: "interrupted" };
      if (Date.now() < deadline) {
        try {
          outcome = await send(row);
        } catch {
          /* Unknown outcome is never automatically retried. */
        }
      }
      let recorded = true;
      try {
        await finish(row.id, outcome);
      } catch {
        recorded = false;
      }
      results.push({ status: outcome.status, recorded });
    }
    return reply(200, { results, remaining_requires_action: true });
  };
}
