// Actual SDK adapter, no network permission. All responses are synthetic.
Deno.test(
  "campaign adapter verifies actor, generates private claim link and sends an idempotent email",
  async () => {
    const oldFetch = globalThis.fetch,
      oldServe = Deno.serve;
    const names = [
      "SUPABASE_URL",
      "SUPABASE_ANON_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
      "CAMPAIGN_APP_URL",
      "RESEND_API_KEY",
      "CAMPAIGN_POSTAL_ADDRESS",
      "RESEND_WEBHOOK_SECRET",
    ];
    const previous = names.map((n) => Deno.env.get(n));
    const values = [
      "https://fixture.supabase.test",
      "anon-fixture",
      "service-fixture",
      "https://app.test/engine/",
      "resend-fixture",
      "123 Example Street, Charleston",
      "whsec_fixture",
    ];
    let handler: ((r: Request) => Promise<Response>) | undefined;
    let test = false;
    const calls: {
      url: URL;
      request: Request;
      body: Record<string, unknown> | null;
    }[] = [];
    const check = (v: unknown, message: string) => {
      if (!v) throw Error(message);
    };
    try {
      names.forEach((n, i) => Deno.env.set(n, values[i]));
      globalThis.fetch = async (
        input: RequestInfo | URL,
        init?: RequestInit,
      ) => {
        const request = new Request(input, init),
          url = new URL(request.url),
          body = request.method === "POST" ? await request.json() : null;
        calls.push({ url, request, body });
        if (url.pathname === "/auth/v1/user")
          return Response.json({
            id: "00000000-0000-4000-8000-000000000001",
            email: "admin@example.test",
          });
        if (url.pathname.endsWith("/reserve_email_campaign_batch"))
          return Response.json([
            {
              id: "20000000-0000-4000-8000-000000000001",
              email: test ? "admin@example.test" : "recipient@example.test",
              name: "Recipient",
              subject: "Community update",
              message: "Hello <script>literal</script>",
              needs_claim: true,
              is_test: test,
              destination: "projects",
              unsubscribe_token: "a".repeat(64),
            },
          ]);
        if (url.pathname === "/auth/v1/admin/generate_link")
          return Response.json({
            action_link:
              "https://fixture.supabase.test/auth/v1/verify?token=private&redirect_to=https://app.test/engine/claim.html",
            email_otp: "000000",
            hashed_token: "private",
            redirect_to: "https://app.test/engine/claim.html",
            verification_type: "magiclink",
            id: "recipient",
            email: "recipient@example.test",
          });
        if (url.hostname === "api.resend.com")
          return Response.json({ id: "provider-fixture" });
        if (url.pathname.endsWith("/finish_email_campaign_recipient"))
          return new Response(null, { status: 204 });
        throw Error("Unexpected request");
      };
      Object.defineProperty(Deno, "serve", {
        configurable: true,
        value: (fn: typeof handler) => {
          handler = fn;
          return {};
        },
      });
      await import("./index.ts");
      const req = () =>
        new Request("https://functions.test", {
          method: "POST",
          headers: {
            Authorization: "Bearer user-fixture",
            Origin: "https://app.test",
          },
          body: JSON.stringify({
            campaign_id: "00000000-0000-4000-8000-000000000001",
            mode: test ? "test" : "pilot",
          }),
        });
      let response = await handler!(req());
      check(response.status === 200, "Campaign send failed");
      let result = await response.json();
      check(
        result.results[0].status === "accepted",
        "Provider acceptance not reported",
      );
      check(
        !JSON.stringify(result).includes("private"),
        "Claim token leaked to admin",
      );
      const reservation = calls.find((c) =>
        c.url.pathname.endsWith("/reserve_email_campaign_batch"),
      )!;
      check(
        reservation.body?.p_actor === "00000000-0000-4000-8000-000000000001",
        "Actor must come from verified Auth identity",
      );
      check(
        reservation.request.headers.get("Authorization") ===
          "Bearer service-fixture",
        "Reservation must use only service credentials",
      );
      const claim = calls.find(
        (c) => c.url.pathname === "/auth/v1/admin/generate_link",
      )!;
      check(
        (claim.body?.options as Record<string, unknown>)?.redirect_to ===
          undefined,
        "SDK should encode redirect as server query parameter",
      );
      check(
        claim.url.searchParams.get("redirect_to") ===
          "https://app.test/engine/claim.html",
        "Fixed claim callback required",
      );
      const email = calls.find((c) => c.url.hostname === "api.resend.com")!;
      check(
        email.request.headers.get("Idempotency-Key") ===
          "campaign-20000000-0000-4000-8000-000000000001",
        "Stable provider idempotency required",
      );
      check(
        String(email.body?.html).includes("&lt;script&gt;"),
        "Message must be escaped",
      );
      check(
        JSON.stringify(email.body?.headers).includes("List-Unsubscribe-Post"),
        "One-click unsubscribe missing",
      );
      test = true;
      calls.length = 0;
      response = await handler!(req());
      result = await response.json();
      check(result.results[0].status === "accepted", "Test failed");
      check(
        !calls.some((c) => c.url.pathname === "/auth/v1/admin/generate_link"),
        "Test must not generate a recipient claim link",
      );
    } finally {
      globalThis.fetch = oldFetch;
      Object.defineProperty(Deno, "serve", {
        configurable: true,
        value: oldServe,
      });
      names.forEach((n, i) =>
        previous[i] === undefined
          ? Deno.env.delete(n)
          : Deno.env.set(n, previous[i]!),
      );
    }
  },
);
