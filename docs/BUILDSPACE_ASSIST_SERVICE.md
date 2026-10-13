# Buildspace tailored help (buildspace-assist service)

Not to be confused with the coordination-detection “Intelligence Layer” (docs/INTELLIGENCE_LAYER.md).

Status: implemented and tested locally with a scripted stand-in model.
**Not deployed. No live model has been called.** The page flag ships `off`.

## What it changes for a member

Deterministic guides still answer familiar objectives (speakers, sponsors,
validation, collaborators, promotion, prototype, event dependencies) instantly
and at no cost. When no guide fits — e.g. the Harborhack task **“Supply
Agents”** (“Agent Heights? What other Agents?”), which previously produced the
generic “What’s in the way right now?” worksheet — the assistance overlay asks
the intelligence service instead:

1. It reads the task, its project and sibling tasks (the member types nothing).
2. Either it produces an editable, prefilled work product immediately, or it
   asks **one** question in the member’s own words with 2–4 choices plus free
   text (“For Harborhack, what kind of agents…?”), or it gives a labelled
   provisional action.
3. The work product is rendered by the existing blocks (brief, checklist,
   comparison matrix, message) and saved/resumed/reported through the existing
   task-notes workflow. “I did this step” asks for the next step with the
   reported progress as context.
4. Shared methods and accepted connections that genuinely change the help are
   listed with their evidence level and how they changed it.

If the service is off or fails, the member sees the existing general guide
with a notice saying it is not specific to their task, and (when retryable)
“Try tailored help again”. Failures are never presented as tailored help.

## Architecture and data flow

```
Browser (GitHub Pages)                          Supabase Edge Function: buildspace-assist
assets/js/mobile-task-assistance.js             supabase/functions/buildspace-assist/index.ts (Deno wrapper)
  └ AssistanceEngine.decide()  — guide?           └ _shared/assist/handler.mjs
       no guide → AssistanceIntelligence            1. CORS/origin, POST, ≤8 KB body, contract v1 validation
assets/js/assistance-intelligence.js               2. auth.getUser(member JWT) → community profile
  └ supabase.functions.invoke('buildspace-assist',  3. provider resolution (approved ∩ configured; preference honoured or 409)
       { version:1, mode, projectId, taskId |       4. task + project + siblings via member-JWT client (RLS); 404 if not visible
         objective, clarifications,                 5. budget claim (service role → claim_assistance_ai_request)
         providerPreference:'automatic' })          6. permissioned community retrieval (RLS + server re-filter), pseudonymised
  ← { status, assistance, communityUsed,           7. prompt: fixed system rules + JSON data envelope (untrusted)
      provenance }                                  8. provider.call() with timeout + max tokens (structured tool output)
  └ normalizeResponse() → decisionFrom()           9. validateAssistance(): bounds, gates, ref resolution, claim checks
  └ existing renderer / save / report / share     10. settle actual usage; respond (names restored server-side)
```

Shared modules are plain ESM (`.mjs`, no imports outside the folder) so the
same code runs in Deno and in the Node tests.

| File | Responsibility |
|---|---|
| `supabase/functions/_shared/assist/contract.mjs` | Contract v1: request validation, provider-neutral JSON Schema, output validation |
| `…/retrieval.mjs` | Task/project/sibling context and community retrieval under the member’s JWT; pseudonymisation |
| `…/prompt.mjs` | System rules and the `<buildspace-data>` envelope |
| `…/providers.mjs` | Provider interface, Anthropic adapter, registry, approval and preference resolution |
| `…/handler.mjs` | Request lifecycle, budgets, timeouts, logging, responses |
| `supabase/functions/buildspace-assist/index.ts` | Deno entry: clients from env, `Deno.serve` |
| `supabase/sql/migrations/20261014_buildspace_assist_usage.sql` | Usage ledger, limits, claim/settle functions (service role only) |
| `assets/js/assistance-intelligence.js` | Browser transport, flag, defensive normalisation, contract → decision |

### Assistance contract (v1)

`assistance` = `{ mode: assist|clarify|provisional, interpretation { objective,
intendedOutcome, known[], inferred[], constraints[] }, uncertainties[{about,
impact}], clarification {question, why, choices[]} | null, intervention {title,
why, immediateAction, observeNext, blocks[1–4]} | null }`, plus `communityUsed[]`
(method: title, evidence, evidenceLabel, howItChanges; person: name,
matchedSkills, howItChanges, caveat) and `provenance` (provider, model,
generatedAt, retrieved counts). Blocks: `fields`, `checklist`, `matrix`,
`message`, `list` — the types the existing UI already renders.

The validator rejects (→ `invalid_output`, member sees the labelled guide):
missing fields; unsupported block types; more than one question; generic
questions (“what’s in the way”, “what does success look like”, …) or questions
that use none of the member’s context terms; repeated questions; a fourth
question; blank worksheets (more than half, or more than three, fields empty);
work products with under 200 characters of substance beyond the objective;
platitudes; claims that a person is available/agreed/an expert; describing a
non-verified method as proven/verified. Unknown community refs are dropped;
raw refs in text are replaced with names (`[name]` if unknown).

## Provider independence

- Providers implement one call (`system, prompt, schema, maxTokens, signal → output, usage, model`).
  Nothing else knows a wire format. One adapter exists: **Anthropic** (forced tool call for structured output).
- A provider is usable only if **configured** (its key is set on the function) **and approved**
  (`BUILDSPACE_AI_APPROVED_PROVIDERS`). Default policy is `automatic` (first usable approved provider).
- A request may name a preferred provider. If it is not usable the service returns `409 provider_unavailable`
  and calls **no** provider. There is no member UI for choosing yet (only one provider exists, and unavailable
  providers are not offered); organisation preferences would be resolved server-side before step 3.
- No bring-your-own-key.

## Configuration and secrets

Set as Edge Function secrets (`supabase secrets set …`), never in the repo or the browser:

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | yes (for Anthropic) | — | Provider credential (server only) |
| `BUILDSPACE_AI_APPROVED_PROVIDERS` | yes | *(empty → off)* | Comma list, e.g. `anthropic` |
| `BUILDSPACE_AI_ANTHROPIC_MODEL` | no | `claude-sonnet-5-5` | Model id |
| `BUILDSPACE_AI_MAX_OUTPUT_TOKENS` | no | `2000` (cap 4000) | Per-request output ceiling |
| `BUILDSPACE_AI_TIMEOUT_MS` | no | `25000` (cap 60000) | Provider timeout |
| `BUILDSPACE_AI_DISABLED` | no | — | `true` = kill switch |
| `BUILDSPACE_ALLOWED_ORIGINS` | no | github.io + charlestonhacks.com | CORS allow-list |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | provided by Supabase | | Member-scoped client; ledger client |
| `BUILDSPACE_SUPABASE_PUBLISHABLE_KEY` | only if `SUPABASE_ANON_KEY` is absent | — | Publishable (public) key for the member-scoped client |

The service-role client is used **only** for the two ledger RPCs; all reads of
member/community data use the member’s JWT so RLS applies.

## Cost and limits

Measured with the fixtures: system rules ≈3.2k characters, output schema ≈3.8k,
task data ≈1.3–1.5k → roughly **2–3k input tokens** per request (up to ~5k
with long task notes and several methods); a full work product ≈2.5k
characters → roughly **0.6–0.9k output tokens** (hard cap 2,000). A typical
unfamiliar task uses 2 requests (question + work product) and 1 more per
reported step. Familiar objectives use **0**. Cost per request =
input tokens × input price + output tokens × output price for the configured
model — check the provider’s current price list; this document does not assume one.

Database-enforced limits (rolling windows; edit `public.assistance_ai_limits`):
12 requests/member/hour, 40/member/day, 500 requests/day globally,
3,000,000 tokens/day globally (open claims count their full reservation).
Every request — including failures — counts. If the ledger migration is not
applied, the service **fails closed** (`budget_unavailable`, no model call).

## Privacy and security

Sent to the provider: the task title, its human-readable description and notes
(the `state:` JSON line removed), project title/description, up to 15 sibling
task titles/statuses, the member’s typed objective and answers, up to 4 shared
methods (title, goal, summary, ≤8 steps, evidence level) that the member may
see and that share ≥2 distinctive terms with the context, and up to 6 accepted
connections as `P1…` with **only** the listed skills that overlap the context.

Never sent: names, emails, ids, bios, creator identities, pending or
non-connections, other members’ private methods, other teams’ tasks, the JWT,
keys. Logs record status, provider, counts, token usage and latency — no text.

Assumptions: RLS on `project_tasks`, `projects`, `capability_packages`,
`connections`, `community` is as in this repository’s migrations (verified
locally, not in production). Member-written text is untrusted: it is placed
only inside the data envelope (envelope tags in data are neutralised), the
system prompt is fixed, and the output validator — not the model — enforces
the rules above. A provider may retain inputs per its own terms; confirm a
suitable data-processing agreement before enabling.

## Failure behaviour

| Condition | HTTP / status | Member sees |
|---|---|---|
| Flag off | (no call) | Existing guide, unchanged |
| Not signed in / bad token | 401 `unauthenticated` | Guide + “Sign in…” notice |
| Task not visible | 404 `not_available` | Guide + notice (no model call) |
| No key / not approved | 503 `not_configured` | Guide + notice |
| Preferred provider unusable | 409 `provider_unavailable` | Notice; nothing sent anywhere |
| Ledger missing | 503 `budget_unavailable` | Guide + notice (fails closed) |
| Member limits | 429 `rate_limited` / `member_daily_limit` | Guide + notice |
| Global budget | 503 `budget_exhausted` | Guide + notice |
| Timeout / network / provider error | 504 / 503 | Guide + notice + retry |
| Output fails validation | 502 `invalid_output` | Guide + notice + retry |

## Deploying (requires explicit authorization — none of this has been done)

1. Approve the provider and data processing; obtain a key with a spend limit set at the provider.
2. Apply `supabase/sql/migrations/20261014_buildspace_assist_usage.sql` to production (additive; review limits).
3. `supabase secrets set ANTHROPIC_API_KEY=… BUILDSPACE_AI_APPROVED_PROVIDERS=anthropic`
4. `supabase functions deploy buildspace-assist`. The function verifies the member JWT itself; if the
   gateway rejects tokens issued with the project’s newer asymmetric signing keys, redeploy with `--no-verify-jwt`
   (in-function `auth.getUser` remains the check).
5. Verify on one device before everyone: set `localStorage['buildspace:intelligence'] = 'on'` in the site’s
   console, open “Supply Agents” on a real iPhone, and run the checks below.
6. Turn it on for everyone by changing `<meta name="buildspace-intelligence" content="off">` to `on` in
   `index.html` (and bump asset versions). Roll back with `BUILDSPACE_AI_DISABLED=true` or the meta flag.

## Production verification still required

- A live model run of `scripts/eval/assist-eval.mjs --live` with human ratings of every case.
- Real Supabase auth/JWT through the gateway, real RLS in production, CORS from the live origin.
- Ledger counts and settlements visible in `assistance_ai_usage` after real requests.
- The “Supply Agents” journey on a physical iPhone (Safari), including save, return and report.
- Provider spend matching the ledger after a day of use.
