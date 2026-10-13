// The Buildspace intelligence service, independent of the runtime: the Deno
// entry point (../../buildspace-assist/index.ts) and the Node tests both call
// createHandler() with their own clients, providers and clock.
//
// Order of operations is deliberate: cheap checks first, nothing reaches a
// model before the member is authenticated, the task is confirmed visible to
// them under RLS, and a budget slot has been claimed. Logs carry statuses and
// counts only — never objective text, retrieved content, or model output.

import { CONTRACT_VERSION, OUTPUT_SCHEMA, LIMITS, validateRequest, validateAssistance, distinctiveTerms } from './contract.mjs';
import { memberForUser, loadTaskContext, loadCommunity, communityForModel, refTable } from './retrieval.mjs';
import { SYSTEM_PROMPT, boundedPrompt } from './prompt.mjs';
import { resolveProvider, approvedProviders, ProviderError } from './providers.mjs';

const FAILURES = {
  method_not_allowed: [405, 'Use POST.'],
  forbidden_origin: [403, 'This site isn’t allowed to use Buildspace assistance.'],
  unauthenticated: [401, 'Sign in to get help tailored to your work.'],
  bad_request: [400, 'That request couldn’t be read.'],
  input_too_large: [413, 'That’s more text than tailored help can take at once.'],
  no_profile: [403, 'Finish setting up your Buildspace profile to get tailored help.'],
  not_available: [404, 'This task isn’t available to you.'],
  disabled: [503, 'Tailored help is switched off right now.'],
  not_configured: [503, 'Tailored help isn’t set up yet.'],
  provider_unavailable: [409, 'The AI provider chosen for you isn’t available, so nothing was sent to any provider.'],
  budget_unavailable: [503, 'Tailored help isn’t set up yet.'],
  rate_limited: [429, 'You’ve asked for a lot of tailored help in a short time. Try again in a little while.'],
  member_daily_limit: [429, 'You’ve reached today’s limit for tailored help.'],
  budget_exhausted: [503, 'Tailored help has reached its limit for today.'],
  timeout: [504, 'Tailored help took too long to respond.'],
  network_error: [503, 'Tailored help couldn’t be reached.'],
  provider_error: [503, 'Tailored help couldn’t be reached.'],
  provider_auth: [503, 'Tailored help couldn’t be reached.'],
  provider_rate_limited: [503, 'Tailored help is busy right now.'],
  invalid_output: [502, 'Tailored help produced something Buildspace couldn’t check, so it isn’t shown.'],
  internal_error: [500, 'Something went wrong preparing tailored help.'],
};

const DEFAULT_ORIGINS = ['https://deckerd451.github.io', 'https://charlestonhacks.com', 'https://www.charlestonhacks.com'];

export function allowedOrigins(env) {
  const configured = String(env.BUILDSPACE_ALLOWED_ORIGINS || '').split(',').map(item => item.trim()).filter(Boolean);
  return configured.length ? configured : DEFAULT_ORIGINS;
}

function corsHeaders(origin, env) {
  const headers = { 'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type', 'access-control-allow-methods': 'POST, OPTIONS', vary: 'Origin' };
  if (origin && allowedOrigins(env).includes(origin)) headers['access-control-allow-origin'] = origin;
  return headers;
}

function respond(status, body, cors) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...cors } });
}

function failure(code, cors, extra = {}) {
  const [status, message] = FAILURES[code] || FAILURES.internal_error;
  return respond(status, { version: CONTRACT_VERSION, status: code in FAILURES ? code : 'internal_error', message, ...extra }, cors);
}

const SCHEMA_CHARS = JSON.stringify(OUTPUT_SCHEMA).length;
const intEnv = (value, fallback, max) => Math.min(Math.max(Number.parseInt(value, 10) || fallback, 1), max);

/**
 * deps: {
 *   env,                              // plain object of configuration
 *   createUserClient(jwt),            // Supabase client acting as the member (RLS applies)
 *   createLedgerClient(),             // service client used ONLY for the usage ledger RPCs
 *   providers,                        // registry from createProviderRegistry()
 *   now?, log?, setTimer?, clearTimer?
 * }
 */
export function createHandler(deps) {
  const env = deps.env || {};
  const now = deps.now || (() => new Date());
  const log = deps.log || (() => {});
  const setTimer = deps.setTimer || setTimeout;
  const clearTimer = deps.clearTimer || clearTimeout;

  return async function handle(request) {
    const started = Date.now();
    const origin = request.headers.get('origin');
    const cors = corsHeaders(origin, env);
    const record = { status: 'internal_error' };
    try {
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
      if (request.method !== 'POST') return failure(record.status = 'method_not_allowed', cors);
      if (origin && !allowedOrigins(env).includes(origin)) return failure(record.status = 'forbidden_origin', cors);

      const jwt = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
      if (!jwt) return failure(record.status = 'unauthenticated', cors);

      const raw = await request.text();
      if (new TextEncoder().encode(raw).length > LIMITS.bodyBytes) return failure(record.status = 'input_too_large', cors);
      let body;
      try { body = JSON.parse(raw); } catch (_) { return failure(record.status = 'bad_request', cors); }
      const parsed = validateRequest(body);
      if (!parsed.ok) return failure(record.status = 'bad_request', cors, { errors: parsed.errors });
      const input = parsed.value;

      const db = deps.createUserClient(jwt);
      const { data: userData, error: userError } = await db.auth.getUser(jwt);
      const user = userData?.user;
      if (userError || !user?.id) return failure(record.status = 'unauthenticated', cors);

      if (String(env.BUILDSPACE_AI_DISABLED || '').toLowerCase() === 'true') return failure(record.status = 'disabled', cors);
      const resolved = resolveProvider(deps.providers || {}, approvedProviders(env), input.providerPreference);
      if (resolved.error) return failure(record.status = resolved.error, cors);
      const provider = resolved.provider;
      record.provider = provider.id;

      const memberId = await memberForUser(db, user.id);
      if (!memberId) return failure(record.status = 'no_profile', cors);

      let taskContext = null;
      if (input.mode === 'task') {
        taskContext = await loadTaskContext(db, memberId, input);
        if (!taskContext) return failure(record.status = 'not_available', cors);
      }

      const contextText = [taskContext?.task.title, taskContext?.task.description, taskContext?.project.title, taskContext?.project.description, input.objective, ...input.clarifications.map(item => item.answer)].filter(Boolean).join(' ');
      const community = await loadCommunity(db, memberId, contextText);
      record.methods = community.methods.length;
      record.people = community.people.length;

      let prompt;
      try {
        prompt = boundedPrompt({
          mode: input.mode,
          today: now().toISOString().slice(0, 10),
          project: taskContext?.project, task: taskContext?.task, otherTasks: taskContext?.otherTasks,
          objective: input.objective, clarifications: input.clarifications,
          community: communityForModel(community),
        });
      } catch (error) { return failure(record.status = error.code === 'input_too_large' ? 'input_too_large' : 'internal_error', cors); }

      const maxTokens = intEnv(env.BUILDSPACE_AI_MAX_OUTPUT_TOKENS, 2000, 4000);
      // Conservative reservation (~3 characters per token, schema included);
      // settled to actual usage after the call.
      const reserve = Math.ceil((SYSTEM_PROMPT.length + prompt.length + SCHEMA_CHARS) / 3) + maxTokens;
      const ledger = deps.createLedgerClient ? deps.createLedgerClient() : null;
      if (!ledger) return failure(record.status = 'budget_unavailable', cors);
      const { data: claim, error: claimError } = await ledger.rpc('claim_assistance_ai_request', { p_member_id: memberId, p_provider: provider.id, p_model: provider.model || null, p_reserve_tokens: reserve });
      if (claimError || !claim) return failure(record.status = 'budget_unavailable', cors);
      if (!claim.allowed) return failure(record.status = FAILURES[claim.reason] ? claim.reason : 'budget_exhausted', cors);

      const controller = new AbortController();
      const timer = setTimer(() => controller.abort(), intEnv(env.BUILDSPACE_AI_TIMEOUT_MS, 25000, 60000));
      let result;
      let usage = { inputTokens: 0, outputTokens: 0 };
      try {
        result = await provider.call({ system: SYSTEM_PROMPT, prompt, schema: OUTPUT_SCHEMA, maxTokens, signal: controller.signal });
        usage = result.usage || usage;
      } catch (error) {
        record.status = error instanceof ProviderError && FAILURES[error.code] ? error.code : (error?.name === 'AbortError' ? 'timeout' : 'provider_error');
      } finally {
        clearTimer(timer);
      }

      let validated = null;
      if (result) {
        const refs = refTable(community);
        const contextTerms = distinctiveTerms(contextText);
        validated = validateAssistance(result.output, { refs, contextTerms, clarifications: input.clarifications });
        record.status = validated.ok ? 'ok' : 'invalid_output';
        record.rejections = validated.errors?.length || 0;
      }
      // Settle actual usage; until settled the claim's reservation counts in full.
      try { await ledger.rpc('settle_assistance_ai_request', { p_id: claim.id, p_status: record.status, p_input_tokens: usage.inputTokens, p_output_tokens: usage.outputTokens }); } catch (_) { /* reservation stands */ }
      record.inputTokens = usage.inputTokens;
      record.outputTokens = usage.outputTokens;
      if (record.status !== 'ok') return failure(record.status, cors);

      const refs = refTable(community);
      const used = validated.value.community.map(item => {
        const ref = refs[item.ref];
        return ref.kind === 'method'
          ? { kind: 'method', id: ref.id, title: ref.title, evidence: ref.evidence, evidenceLabel: ref.label, howItChanges: item.howItChanges }
          : { kind: 'person', id: ref.id, name: ref.name, matchedSkills: ref.matchedSkills, howItChanges: item.howItChanges, caveat: 'Matched on skills their profile lists — that doesn’t mean they’re available or willing.' };
      });
      const { community: _refsOnly, ...assistance } = validated.value;
      return respond(200, {
        version: CONTRACT_VERSION,
        status: 'ok',
        assistance,
        communityUsed: used,
        provenance: {
          contractVersion: CONTRACT_VERSION,
          provider: provider.id,
          model: result.model || provider.model || null,
          generatedAt: now().toISOString(),
          retrieved: { methods: community.methods.length, people: community.people.length },
          clarificationsUsed: input.clarifications.length,
        },
      }, cors);
    } catch (error) {
      record.status = 'internal_error';
      return failure('internal_error', cors);
    } finally {
      record.ms = Date.now() - started;
      try { log({ event: 'buildspace_assist', ...record }); } catch (_) { /* logging is best-effort */ }
    }
  };
}
