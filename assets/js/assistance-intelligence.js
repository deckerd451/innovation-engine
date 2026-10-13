// Client side of the Buildspace intelligence layer. It only talks to the
// buildspace-assist Edge Function (no provider, key or prompt lives in the
// browser), re-checks the response shape defensively, and converts the
// versioned assistance contract into the decision shape the existing
// accomplishment UI already renders. Off unless the page enables it
// (<meta name="buildspace-intelligence" content="on">) or a tester opts in on
// one device (localStorage "buildspace:intelligence" = "on").
(function () {
  'use strict';
  if (window.AssistanceIntelligence) return;

  const CONTRACT_VERSION = 1;
  const FUNCTION_NAME = 'buildspace-assist';
  const FLAG_KEY = 'buildspace:intelligence';
  const BLOCK_TYPES = new Set(['fields', 'checklist', 'matrix', 'message', 'list']);
  const RETRYABLE = new Set(['timeout', 'network_error', 'provider_error', 'provider_rate_limited', 'invalid_output', 'internal_error', 'rate_limited']);

  function enabled() {
    let override = null;
    try { override = window.localStorage.getItem(FLAG_KEY); } catch (_) { /* storage is optional */ }
    if (override === 'off') return false;
    const meta = document.querySelector('meta[name="buildspace-intelligence"]')?.getAttribute('content');
    return (override === 'on' || meta === 'on') && typeof window.supabase?.functions?.invoke === 'function';
  }

  const text = (value, max) => String(value ?? '').slice(0, max);
  const strings = (value, maxItems, max) => (Array.isArray(value) ? value : []).map(item => text(item, max)).filter(Boolean).slice(0, maxItems);

  function normalizeBlock(block) {
    if (!block || !BLOCK_TYPES.has(block.type) || !block.id || !block.label) return null;
    const base = { type: block.type, id: text(block.id, 24), label: text(block.label, 80) };
    if (block.type === 'fields') return { ...base, items: (block.items || []).filter(item => item?.key && item.label).slice(0, 8).map(item => ({ key: text(item.key, 24), label: text(item.label, 80), value: text(item.value, 400), hint: item.hint ? text(item.hint, 160) : undefined })) };
    if (block.type === 'checklist') return { ...base, items: (block.items || []).filter(item => item?.key && item.text).slice(0, 8).map(item => ({ key: text(item.key, 24), text: text(item.text, 200), detail: item.detail ? text(item.detail, 240) : undefined })) };
    if (block.type === 'matrix') {
      const criteria = (block.criteria || []).filter(item => item?.key && item.label).slice(0, 5).map(item => ({ key: text(item.key, 24), label: text(item.label, 60) }));
      if (criteria.length < 2) return null;
      const defaults = strings(block.defaults, 6, 80);
      return { ...base, criteria, defaults, rows: Math.max(3, defaults.length), rowLabel: text(block.rowLabel || 'Option', 30) };
    }
    if (block.type === 'message') return block.body ? { ...base, subject: text(block.subject, 120), body: text(block.body, 1500) } : null;
    return { ...base, items: strings(block.items, 6, 200) };
  }

  function normalizeAssistance(raw) {
    if (!raw || !['assist', 'clarify', 'provisional'].includes(raw.mode)) return null;
    const interp = raw.interpretation || {};
    const out = {
      mode: raw.mode,
      interpretation: { objective: text(interp.objective, 200), intendedOutcome: text(interp.intendedOutcome, 240), known: strings(interp.known, 6, 160), inferred: strings(interp.inferred, 5, 160), constraints: strings(interp.constraints, 4, 160) },
      uncertainties: (raw.uncertainties || []).filter(item => item?.about).slice(0, 4).map(item => ({ about: text(item.about, 160), impact: ['high', 'medium', 'low'].includes(item.impact) ? item.impact : 'medium' })),
      clarification: raw.clarification?.question ? { question: text(raw.clarification.question, 200), why: text(raw.clarification.why, 200), choices: (raw.clarification.choices || []).filter(choice => choice?.label).slice(0, 4).map(choice => ({ label: text(choice.label, 60), value: text(choice.value || choice.label, 120) })) } : null,
      intervention: null,
    };
    if (raw.intervention) {
      const blocks = (raw.intervention.blocks || []).map(normalizeBlock).filter(Boolean).slice(0, 4);
      if (blocks.length) out.intervention = { title: text(raw.intervention.title, 120), why: text(raw.intervention.why, 300), immediateAction: text(raw.intervention.immediateAction, 200), observeNext: text(raw.intervention.observeNext, 200), blocks };
    }
    if (out.mode === 'clarify' && !out.clarification) return null;
    if (out.mode !== 'clarify' && !out.intervention) return null;
    return out;
  }

  function normalizeCommunity(items) {
    return (Array.isArray(items) ? items : []).slice(0, 4).map(item => {
      if (item?.kind === 'method' && item.id && item.title) return { kind: 'method', id: text(item.id, 64), title: text(item.title, 100), evidence: text(item.evidence, 24), evidenceLabel: text(item.evidenceLabel, 120), howItChanges: text(item.howItChanges, 240) };
      if (item?.kind === 'person' && item.id) return { kind: 'person', id: text(item.id, 64), name: text(item.name || 'Community member', 80), matchedSkills: strings(item.matchedSkills, 6, 40), howItChanges: text(item.howItChanges, 240), caveat: text(item.caveat, 160) };
      return null;
    }).filter(Boolean);
  }

  function failed(status, message) {
    return { status, message: message || 'Tailored help couldn’t be reached.', retryable: RETRYABLE.has(status) };
  }

  function normalizeResponse(data) {
    if (!data || data.version !== CONTRACT_VERSION || data.status !== 'ok') return failed('invalid_output', 'Tailored help returned something Buildspace couldn’t check, so it isn’t shown.');
    const assistance = normalizeAssistance(data.assistance);
    if (!assistance) return failed('invalid_output', 'Tailored help returned something Buildspace couldn’t check, so it isn’t shown.');
    const p = data.provenance || {};
    return { status: 'ok', assistance, communityUsed: normalizeCommunity(data.communityUsed), provenance: { provider: text(p.provider, 32), model: text(p.model, 80), generatedAt: text(p.generatedAt, 40), retrieved: { methods: Number(p.retrieved?.methods) || 0, people: Number(p.retrieved?.people) || 0 } } };
  }

  /** payload: { mode:'task', projectId, taskId } | { mode:'objective', objective }, plus clarifications */
  async function request(payload, { timeoutMs = 35000 } = {}) {
    if (!enabled()) return failed('disabled', 'Tailored help is switched off.');
    let timer;
    try {
      const call = window.supabase.functions.invoke(FUNCTION_NAME, { body: { version: CONTRACT_VERSION, providerPreference: 'automatic', ...payload } });
      const timeout = new Promise(resolve => { timer = window.setTimeout(() => resolve({ timedOut: true }), timeoutMs); });
      const result = await Promise.race([call, timeout]);
      if (result?.timedOut) return failed('timeout', 'Tailored help took too long to respond.');
      if (result?.error) {
        let detail = null;
        try { detail = await result.error.context?.json?.(); } catch (_) { detail = null; }
        return failed(typeof detail?.status === 'string' ? detail.status : 'network_error', typeof detail?.message === 'string' ? detail.message : null);
      }
      return normalizeResponse(result?.data);
    } catch (_) {
      return failed('network_error');
    } finally {
      window.clearTimeout(timer);
    }
  }

  // Contract → the decision shape mobile-task-assistance renders. Block ids
  // are namespaced by generation so values typed into an earlier answer never
  // leak into a later one.
  function decisionFrom(stored, generation, base) {
    const a = stored.assistance;
    const common = { ...base, playbook: null, clarify: null, complete: false, stepIndex: 0, stepCount: 0, ai: { ...stored, generation }, aiClarify: null };
    const clarify = a.clarification ? { question: a.clarification.question, why: a.clarification.why, choices: a.clarification.choices } : null;
    if (a.mode === 'clarify') return { ...common, outcome: null, step: null, intervention: null, aiClarify: clarify };
    return {
      ...common,
      outcome: a.interpretation.intendedOutcome ? { text: a.interpretation.intendedOutcome, inferred: true } : null,
      step: { title: a.intervention.title, obstacle: a.intervention.why, inferred: true },
      intervention: { kind: 'ai', blocks: a.intervention.blocks.map(block => ({ ...block, id: `ai${generation}-${block.id}` })) },
      aiClarify: a.mode === 'provisional' ? clarify : null,
    };
  }

  const api = { enabled, request, normalizeResponse, normalizeAssistance, decisionFrom, CONTRACT_VERSION, FLAG_KEY };
  window.AssistanceIntelligence = api;
  window.AssistanceIntelligenceTesting = api;
})();
