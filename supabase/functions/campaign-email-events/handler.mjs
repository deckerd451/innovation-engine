import { readBody } from "../campaign-email/handler.mjs";
const decode = (value) =>
  Uint8Array.from(atob(value), (ch) => ch.charCodeAt(0));
export async function verifyWebhook(raw, headers, secret, now = Date.now()) {
  try {
    const id = headers.get("svix-id"),
      stamp = headers.get("svix-timestamp"),
      signature = headers.get("svix-signature");
    if (
      !id ||
      id.length > 200 ||
      !/^\d{10}$/.test(stamp || "") ||
      Math.abs(now / 1000 - Number(stamp)) > 300 ||
      !signature ||
      !secret?.startsWith("whsec_")
    )
      return false;
    const key = await crypto.subtle.importKey(
      "raw",
      decode(secret.slice(6)),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const input = new TextEncoder().encode(`${id}.${stamp}.${raw}`);
    for (const part of signature.split(" ")) {
      const [version, value] = part.split(",");
      if (
        version === "v1" &&
        value &&
        (await crypto.subtle.verify("HMAC", key, decode(value), input))
      )
        return true;
    }
  } catch {
    /* Invalid signatures fail closed. */
  }
  return false;
}
export function createWebhookHandler({ secret, record }) {
  return async (request) => {
    if (request.method !== "POST")
      return new Response("Use POST", { status: 405 });
    let raw;
    try {
      raw = await readBody(request, 131072);
    } catch {
      return new Response("Invalid body", { status: 400 });
    }
    if (!(await verifyWebhook(raw, request.headers, secret)))
      return new Response("Invalid signature", { status: 401 });
    let event;
    try {
      event = JSON.parse(raw);
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }
    if (
      ["email.delivered", "email.bounced", "email.complained"].includes(
        event.type,
      ) &&
      typeof event.data?.email_id === "string"
    ) {
      try {
        await record(
          request.headers.get("svix-id"),
          event.data.email_id,
          event.type,
        );
      } catch {
        return new Response("Retry later", { status: 503 });
      }
    }
    return new Response("ok", { status: 200 });
  };
}
