#!/usr/bin/env node
const assert = require("node:assert/strict");
(async () => {
  const { createCampaignHandler, emailContent } = await import(
    "../../supabase/functions/campaign-email/handler.mjs"
  );
  const { verifyWebhook, createWebhookHandler } = await import(
    "../../supabase/functions/campaign-email-events/handler.mjs"
  );
  const id = "00000000-0000-4000-8000-000000000001",
    token = "a".repeat(64);
  let sent = 0,
    recorded = 0,
    unsubscribed = 0,
    mode = "accepted";
  const options = {
    origin: "https://app.test",
    ready: () => true,
    authenticate: async () => ({ id: "admin" }),
    reserve: async () => [
      {
        id,
        email: "server@example.test",
        name: "<img onerror=alert(1)>",
        message: "<script>bad</script>",
        subject: "Hello",
        destination: "projects",
        unsubscribe_token: token,
        needs_claim: true,
        is_test: false,
      },
    ],
    send: async () => {
      sent++;
      if (mode === "throw") throw Error("network");
      return { status: mode };
    },
    finish: async () => {
      recorded++;
    },
    unsubscribe: async () => {
      unsubscribed++;
    },
  };
  const handler = createCampaignHandler(options);
  const request = (body = {}, headers = {}) =>
    new Request("https://functions.test", {
      method: "POST",
      headers: {
        Authorization: "Bearer fixture",
        Origin: "https://app.test",
        ...headers,
      },
      body: JSON.stringify({ campaign_id: id, mode: "pilot", ...body }),
    });
  assert.equal(
    (await handler(new Request("https://functions.test", { method: "GET" })))
      .status,
    405,
  );
  assert.equal(
    (await handler(request({}, { Origin: "https://bad.test" }))).status,
    403,
  );
  assert.equal(
    (
      await handler(
        new Request("https://functions.test", { method: "POST", body: "{}" }),
      )
    ).status,
    401,
  );
  assert.equal(
    (await handler(request({ email: "attacker@example.test" }))).status,
    400,
  );
  assert.equal((await handler(request({ mode: "all" }))).status, 400);
  assert.equal((await handler(request({ reviewed: "yes" }))).status, 400);
  let response = await handler(request());
  assert.equal(response.status, 200);
  let result = await response.json();
  assert.equal(result.results[0].status, "accepted");
  assert.equal(sent, 1);
  assert.equal(recorded, 1);
  assert.ok(
    !JSON.stringify(result).includes(token) &&
      !JSON.stringify(result).includes("@"),
  );
  mode = "throw";
  result = await (await handler(request())).json();
  assert.equal(
    result.results[0].status,
    "unknown",
    "Timeout must not claim failure or acceptance",
  );
  mode = "failed";
  result = await (await handler(request())).json();
  assert.equal(result.results[0].status, "failed");
  const denied = createCampaignHandler({
    ...options,
    reserve: async () => {
      throw { code: "42501" };
    },
  });
  assert.equal((await denied(request())).status, 403);
  const setup = createCampaignHandler({ ...options, ready: () => false });
  assert.equal((await setup(request())).status, 503);
  const row = (await options.reserve())[0];
  const email = emailContent(row, {
    base: "https://app.test/engine/",
    postal: "123 Example Street, Charleston",
    claimUrl: "https://auth.test/verify?token=secret&redirect_to=claim",
  });
  assert.ok(
    email.html.includes("&lt;script&gt;") && !email.html.includes("<script>"),
  );
  assert.ok(email.html.includes("token=secret&amp;redirect_to=claim"));
  assert.ok(email.text.includes("unsubscribe.html#" + token));
  assert.ok(email.text.includes("Claim your profile"));
  const test = emailContent(
    { ...row, is_test: true },
    { base: "https://app.test/engine/", postal: "123 Example Street" },
  );
  assert.ok(test.subject.startsWith("[TEST]"));
  assert.ok(!test.text.includes("token=secret"));
  assert.ok(test.text.includes("campaign_resource=projects"));
  assert.throws(
    () =>
      emailContent(row, {
        base: "https://app.test/",
        postal: "123 Example Street",
      }),
    /claim link/,
  );
  assert.equal(
    (
      await handler(
        new Request("https://functions.test?unsubscribe=" + token, {
          method: "POST",
          body: "List-Unsubscribe=One-Click",
        }),
      )
    ).status,
    200,
  );
  assert.equal(unsubscribed, 1);
  assert.equal(
    (await handler(new Request("https://functions.test?unsubscribe=" + token)))
      .status,
    405,
  );
  assert.equal(unsubscribed, 1, "Link scanners must not unsubscribe on GET");
  const secretBytes = new TextEncoder().encode(
    "fixture-secret-with-enough-entropy",
  );
  const secret = "whsec_" + btoa(String.fromCharCode(...secretBytes));
  const stamp = String(Math.floor(Date.now() / 1000));
  const raw = JSON.stringify({
    type: "email.bounced",
    data: { email_id: "provider-id" },
  });
  const input = new TextEncoder().encode("event-1." + stamp + "." + raw);
  const key = await crypto.subtle.importKey(
    "raw",
    secretBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = btoa(
    String.fromCharCode(
      ...new Uint8Array(await crypto.subtle.sign("HMAC", key, input)),
    ),
  );
  const headers = new Headers({
    "svix-id": "event-1",
    "svix-timestamp": stamp,
    "svix-signature": "v1," + signature,
  });
  assert.ok(await verifyWebhook(raw, headers, secret));
  assert.equal(await verifyWebhook(raw + " ", headers, secret), false);
  assert.equal(
    await verifyWebhook(raw, headers, secret, Date.now() + 600000),
    false,
  );
  let events = 0;
  const webhook = createWebhookHandler({
    secret,
    record: async () => events++,
  });
  assert.equal(
    (
      await webhook(
        new Request("https://events.test", {
          method: "POST",
          headers,
          body: raw,
        }),
      )
    ).status,
    200,
  );
  assert.equal(events, 1);
  headers.set("svix-signature", "v1,bad");
  assert.equal(
    (
      await webhook(
        new Request("https://events.test", {
          method: "POST",
          headers,
          body: raw,
        }),
      )
    ).status,
    401,
  );
  assert.equal(events, 1);
  console.log(
    "Campaign request authorization, safe email rendering, provider outcomes, unsubscribe and signed webhook checks passed",
  );
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
