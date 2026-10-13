// Buildspace assistance contract, version 1.
//
// One provider-independent shape shared by the intelligence service and the
// accomplishment UI. Providers are asked for OUTPUT_SCHEMA; whatever they
// return is untrusted until validateAssistance() has normalized it, bounded
// every string, resolved community references against what this member was
// actually allowed to see, and rejected generic or unsupported help.
// Plain JavaScript (no imports) so it runs unchanged in Deno and Node tests.

export const CONTRACT_VERSION = 1;

export const LIMITS = Object.freeze({
  bodyBytes: 8 * 1024,
  objective: 280,
  clarifications: 3,
  question: 200,
  answer: 300,
  blocks: 4,
  messageBody: 1500,
  shortText: 240,
});

const BLOCK_TYPES = ['fields', 'checklist', 'matrix', 'message', 'list'];
const MODES = ['assist', 'clarify', 'provisional'];
const PROVIDER_ID = /^[a-z][a-z0-9-]{1,31}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Words that carry no meaning about *what* an objective is. Kept in step with
// the GENERIC set in assets/js/assistance-interventions.js.
const GENERIC = new Set(['about', 'after', 'again', 'also', 'and', 'any', 'are', 'before', 'best', 'better', 'build', 'but', 'can', 'choose', 'create', 'doing', 'done', 'each', 'figure', 'find', 'first', 'for', 'from', 'get', 'getting', 'good', 'help', 'how', 'identify', 'into', 'just', 'make', 'more', 'need', 'new', 'next', 'not', 'our', 'out', 'pick', 'plan', 'prep', 'project', 'ready', 'real', 'select', 'some', 'start', 'step', 'steps', 'task', 'that', 'the', 'their', 'them', 'then', 'thing', 'things', 'this', 'through', 'want', 'way', 'week', 'what', 'when', 'whether', 'which', 'who', 'will', 'with', 'work', 'year', 'you', 'your', 'other', 'others', 'kind', 'trying']);

export function distinctiveTerms(text) {
  const words = String(text || '').toLowerCase().match(/[a-z0-9]+/g) || [];
  return [...new Set(words.map(word => (word.length > 4 && word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word))
    .filter(word => word.length >= 3 && !GENERIC.has(word) && !/^\d+$/.test(word)))];
}

// Strip control characters (keeping newlines and tabs) and bound length.
export function cleanText(value, max) {
  if (value == null) return '';
  const text = String(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F‪-‮⁦-⁩]/g, '').replace(/\r\n?/g, '\n').trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

// ------------------------------------------------------------------ request

export function validateRequest(body) {
  const errors = [];
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, errors: ['body must be a JSON object'] };
  if (body.version !== CONTRACT_VERSION) errors.push(`version must be ${CONTRACT_VERSION}`);
  const mode = body.mode;
  if (mode !== 'task' && mode !== 'objective') errors.push('mode must be "task" or "objective"');
  const value = { version: CONTRACT_VERSION, mode, clarifications: [], providerPreference: 'automatic' };
  if (mode === 'task') {
    if (!UUID.test(String(body.projectId || ''))) errors.push('projectId must be a UUID');
    if (!UUID.test(String(body.taskId || ''))) errors.push('taskId must be a UUID');
    value.projectId = String(body.projectId || '').toLowerCase();
    value.taskId = String(body.taskId || '').toLowerCase();
  }
  if (mode === 'objective') {
    const objective = cleanText(body.objective, LIMITS.objective + 1);
    if (!objective) errors.push('objective is required');
    if (objective.length > LIMITS.objective) errors.push(`objective must be at most ${LIMITS.objective} characters`);
    value.objective = objective;
  }
  if (body.clarifications != null) {
    if (!Array.isArray(body.clarifications) || body.clarifications.length > LIMITS.clarifications) errors.push(`clarifications must be an array of at most ${LIMITS.clarifications}`);
    else value.clarifications = body.clarifications.map(item => ({ question: cleanText(item?.question, LIMITS.question), answer: cleanText(item?.answer, LIMITS.answer) })).filter(item => item.question && item.answer);
  }
  if (body.providerPreference != null) {
    const preference = String(body.providerPreference);
    if (preference !== 'automatic' && !PROVIDER_ID.test(preference)) errors.push('providerPreference is not a valid provider id');
    value.providerPreference = preference;
  }
  return errors.length ? { ok: false, errors } : { ok: true, value };
}

// ------------------------------------------------------- provider schema

const str = (maxLength, description) => ({ type: 'string', maxLength, ...(description ? { description } : {}) });
const strList = (maxItems, maxLength) => ({ type: 'array', maxItems, items: str(maxLength) });

const BLOCK_SCHEMA = {
  type: 'object',
  description: 'One editable work product. fields: prefilled brief (items[].value filled from context). checklist: concrete actions. matrix: options scored against criteria (rows = candidate option names you can genuinely name from context, otherwise leave empty). message: ready-to-send draft. list: short reference list.',
  properties: {
    type: { type: 'string', enum: BLOCK_TYPES },
    label: str(80),
    items: { type: 'array', maxItems: 8, items: { type: 'object', properties: { key: str(24), label: str(80), value: str(400), hint: str(160), text: str(200), detail: str(240) } } },
    criteria: { type: 'array', maxItems: 5, items: { type: 'object', properties: { key: str(24), label: str(60) }, required: ['label'] } },
    rows: strList(6, 80),
    rowLabel: str(30),
    subject: str(120),
    body: str(LIMITS.messageBody),
    entries: strList(6, 200),
  },
  required: ['type', 'label'],
};

export const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    interpretation: {
      type: 'object',
      properties: {
        objective: str(200, 'What the member is trying to accomplish, in plain words.'),
        intendedOutcome: str(LIMITS.shortText, 'What will be true when this is done.'),
        known: strList(6, 160),
        inferred: strList(5, 160),
        constraints: strList(4, 160),
      },
      required: ['objective', 'intendedOutcome'],
    },
    uncertainties: { type: 'array', maxItems: 4, items: { type: 'object', properties: { about: str(160), impact: { type: 'string', enum: ['high', 'medium', 'low'] } }, required: ['about', 'impact'] } },
    mode: { type: 'string', enum: MODES, description: 'assist: enough context. clarify: one answer would materially change the work product. provisional: critical information is missing but a safe useful action exists.' },
    clarification: {
      type: 'object',
      description: 'Only in clarify mode (or provisional, optionally). Omit otherwise.',
      properties: {
        question: str(LIMITS.question, 'One specific question that uses the member\'s own words and context.'),
        why: str(200),
        choices: { type: 'array', minItems: 2, maxItems: 4, items: { type: 'object', properties: { label: str(60), value: str(120) }, required: ['label'] } },
      },
    },
    intervention: {
      type: 'object',
      description: 'Required in assist and provisional modes. Omit in clarify mode.',
      properties: {
        title: str(120),
        why: str(300, 'Why this is the right next move for this objective.'),
        immediateAction: str(200, 'What the member can do in the next 30 minutes.'),
        observeNext: str(200, 'What the member should see happen if it worked.'),
        blocks: { type: 'array', minItems: 1, maxItems: LIMITS.blocks, items: BLOCK_SCHEMA },
      },
    },
    community: {
      type: 'array',
      maxItems: 4,
      description: 'Only refs from the provided data (M1…, P1…), and only when they genuinely change the intervention.',
      items: { type: 'object', properties: { ref: str(4), howItChanges: str(LIMITS.shortText) }, required: ['ref', 'howItChanges'] },
    },
  },
  required: ['interpretation', 'mode'],
};

// ------------------------------------------------------- output validation

const GENERIC_QUESTION = /\b(what([’']?s| is) (in the way|blocking you|stopping you|your (goal|objective|deadline))|what does success look like|define (success|the (goal|objective))|what are you trying to (do|accomplish|achieve)|how can i help|tell me more|can you (clarify|elaborate|provide more))\b/i;
const PLATITUDE = /\b(make a plan|search for help|browse (the )?(directory|community)|stay motivated|you can do it|break it (down )?into smaller steps|keep going|reach out to your network)\b/i;
const CLAIM = /\b(is|are) (available|free|willing|keen|happy to|an? expert|experts?)\b|\b(has|have) (agreed|confirmed|committed)\b|\bagreed to\b|\bwill (help|join|speak|mentor)\b|\bguarantee/i;
const STRONG_EVIDENCE = /\b(proven|verified|guaranteed|validated|confirmed to work)\b/i;
const REF = /\b([MP])(\d{1,2})\b/g;
const KEY = value => String(value || '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24);

function list(value, maxItems, max) {
  return (Array.isArray(value) ? value : []).map(item => cleanText(item, max)).filter(Boolean).slice(0, maxItems);
}

function uniqueKeys(items, from) {
  const seen = new Set();
  return items.map((item, index) => {
    let key = KEY(from(item)) || `k${index + 1}`;
    while (seen.has(key)) key = `${key.slice(0, 20)}-${index + 1}`;
    seen.add(key);
    return { ...item, key };
  });
}

function normalizeBlock(raw, index, errors) {
  if (!raw || typeof raw !== 'object') { errors.push(`block ${index + 1} is not an object`); return null; }
  const type = raw.type;
  if (!BLOCK_TYPES.includes(type)) { errors.push(`block ${index + 1} has unsupported type`); return null; }
  const block = { type, id: `b${index + 1}`, label: cleanText(raw.label, 80) };
  if (!block.label) { errors.push(`block ${index + 1} has no label`); return null; }
  const items = Array.isArray(raw.items) ? raw.items.slice(0, 8) : [];
  if (type === 'fields') {
    block.items = uniqueKeys(items.map(item => ({ label: cleanText(item?.label, 80), value: cleanText(item?.value, 400), hint: cleanText(item?.hint, 160) || undefined, key: item?.key })).filter(item => item.label), item => item.key || item.label);
    if (!block.items.length) { errors.push(`fields block ${index + 1} is empty`); return null; }
  } else if (type === 'checklist') {
    block.items = uniqueKeys(items.map(item => ({ text: cleanText(item?.text ?? item?.label, 200), detail: cleanText(item?.detail, 240) || undefined, key: item?.key })).filter(item => item.text), item => item.key || item.text);
    if (block.items.length < 2) { errors.push(`checklist block ${index + 1} needs at least two items`); return null; }
  } else if (type === 'matrix') {
    block.criteria = uniqueKeys((Array.isArray(raw.criteria) ? raw.criteria : []).slice(0, 5).map(item => ({ label: cleanText(item?.label, 60), key: item?.key })).filter(item => item.label), item => item.key || item.label);
    if (block.criteria.length < 2) { errors.push(`matrix block ${index + 1} needs at least two criteria`); return null; }
    block.defaults = list(raw.rows, 6, 80);
    block.rows = Math.max(3, block.defaults.length);
    block.rowLabel = cleanText(raw.rowLabel, 30) || 'Option';
  } else if (type === 'message') {
    block.subject = cleanText(raw.subject, 120);
    block.body = cleanText(raw.body, LIMITS.messageBody);
    if (block.body.length < 80) { errors.push(`message block ${index + 1} is too short to send`); return null; }
  } else if (type === 'list') {
    block.items = list(raw.entries ?? raw.items, 6, 200);
    if (!block.items.length) { errors.push(`list block ${index + 1} is empty`); return null; }
  }
  return block;
}

function blockText(block) {
  return [block.label, block.subject, block.body,
    ...(block.items || []).map(item => (typeof item === 'string' ? item : [item.label, item.text, item.detail, item.value].join(' '))),
    ...(block.criteria || []).map(item => item.label), ...(block.defaults || [])].join(' ');
}

// Community references must never surface as raw ids in member-facing text.
function replaceRefs(text, refs) {
  return String(text || '').replace(REF, (match, kind, n) => {
    const ref = refs[`${kind}${n}`];
    if (!ref) return kind === 'P' ? '[name]' : '[method]';
    return kind === 'P' ? (ref.name || '[name]') : `“${ref.title}”`;
  });
}

function rewriteBlockRefs(block, refs) {
  const fix = value => (typeof value === 'string' ? replaceRefs(value, refs) : value);
  return {
    ...block,
    label: fix(block.label), subject: fix(block.subject), body: fix(block.body),
    items: block.items?.map(item => (typeof item === 'string' ? fix(item) : { ...item, label: fix(item.label), value: fix(item.value), text: fix(item.text), detail: fix(item.detail), hint: fix(item.hint) })),
    defaults: block.defaults?.map(fix),
  };
}

/**
 * Validate and normalize a provider's output.
 * context: { refs: { M1: {kind:'method', id, title, evidence}, P1: {kind:'person', id, name, matchedSkills} },
 *            contextTerms: distinctive terms from the objective/task/project the member supplied,
 *            clarifications: answers already given }
 * Returns { ok, value, errors, warnings }.
 */
export function validateAssistance(raw, context = {}) {
  const errors = [];
  const warnings = [];
  const refs = context.refs || {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, errors: ['output is not an object'], warnings };
  const interp = raw.interpretation || {};
  const interpretation = {
    objective: cleanText(interp.objective, 200),
    intendedOutcome: cleanText(interp.intendedOutcome, LIMITS.shortText),
    known: list(interp.known, 6, 160),
    inferred: list(interp.inferred, 5, 160),
    constraints: list(interp.constraints, 4, 160),
  };
  if (!interpretation.objective) errors.push('interpretation.objective is required');
  if (!interpretation.intendedOutcome) errors.push('interpretation.intendedOutcome is required');
  const mode = raw.mode;
  if (!MODES.includes(mode)) errors.push('mode is not supported');
  const uncertainties = (Array.isArray(raw.uncertainties) ? raw.uncertainties : []).slice(0, 4)
    .map(item => ({ about: cleanText(item?.about, 160), impact: ['high', 'medium', 'low'].includes(item?.impact) ? item.impact : 'medium' }))
    .filter(item => item.about);

  let clarification = null;
  if (raw.clarification && typeof raw.clarification === 'object') {
    const question = cleanText(raw.clarification.question, LIMITS.question);
    const choices = (Array.isArray(raw.clarification.choices) ? raw.clarification.choices : []).slice(0, 4)
      .map(choice => ({ label: cleanText(choice?.label, 60), value: cleanText(choice?.value || choice?.label, 120) })).filter(choice => choice.label);
    clarification = { question, why: cleanText(raw.clarification.why, 200), choices, allowFreeText: true };
    if (!question) errors.push('clarification.question is required');
    if (choices.length < 2) errors.push('clarification needs at least two choices');
    if ((question.match(/\?/g) || []).length > 1) errors.push('clarification must ask exactly one question');
    if (GENERIC_QUESTION.test(question)) errors.push('clarification is generic rather than about this objective');
    const terms = new Set(context.contextTerms || []);
    if (terms.size && !distinctiveTerms(question).some(term => terms.has(term))) errors.push('clarification does not use the member’s context');
    if ((context.clarifications || []).some(prior => prior.question.toLowerCase() === question.toLowerCase())) errors.push('clarification repeats a question already answered');
  }
  if (mode === 'clarify' && !clarification) errors.push('clarify mode requires a clarification');
  if (mode !== 'clarify') clarification = mode === 'provisional' ? clarification : null;
  if ((context.clarifications || []).length >= LIMITS.clarifications && mode === 'clarify') errors.push('clarification limit reached; assistance must be provided');

  let intervention = null;
  if (raw.intervention && typeof raw.intervention === 'object') {
    const iv = raw.intervention;
    const blockErrors = [];
    const blocks = (Array.isArray(iv.blocks) ? iv.blocks : []).slice(0, LIMITS.blocks).map((block, index) => normalizeBlock(block, index, blockErrors)).filter(Boolean);
    errors.push(...blockErrors);
    intervention = {
      title: cleanText(iv.title, 120),
      why: cleanText(iv.why, 300),
      immediateAction: cleanText(iv.immediateAction, 200),
      observeNext: cleanText(iv.observeNext, 200),
      blocks: blocks.map(block => rewriteBlockRefs(block, refs)),
    };
    if (!intervention.title) errors.push('intervention.title is required');
    if (!intervention.why) errors.push('intervention.why is required');
    if (!intervention.immediateAction) errors.push('intervention.immediateAction is required');
    if (!blocks.length) errors.push('intervention needs at least one work product');
    const objectiveText = interpretation.objective.toLowerCase();
    const actionable = blocks.filter(block => block.type === 'message' || block.type === 'matrix'
      || (block.type === 'checklist' && block.items.length >= 3)
      || (block.type === 'fields' && block.items.filter(item => item.value).length >= 2));
    if (blocks.length && !actionable.length) errors.push('no usable work product (needs a message, matrix, 3+ step checklist, or a prefilled brief)');
    const fieldItems = blocks.filter(block => block.type === 'fields').flatMap(block => block.items);
    const empty = fieldItems.filter(item => !item.value).length;
    if (fieldItems.length && (empty > 3 || empty / fieldItems.length > 0.5)) errors.push('work product is a blank worksheet (most fields are empty)');
    const text = blocks.map(blockText).join(' ');
    const substantive = objectiveText ? text.toLowerCase().split(objectiveText).join('') : text;
    if (blocks.length && substantive.replace(/\s+/g, ' ').trim().length < 200) errors.push('too little substance beyond restating the objective');
    if (PLATITUDE.test(`${text} ${intervention.why} ${intervention.immediateAction}`)) errors.push('generic advice');
    // Claims are only checked where a person is referenced: "the venue is
    // available Saturday" is fine; "P1 is available" is not.
    if (intervention.why.split(/(?<=[.!?])\s+/).some(sentence => /\bP\d{1,2}\b/.test(sentence) && CLAIM.test(sentence))) errors.push('unsupported claim about people');
    intervention.why = replaceRefs(intervention.why, refs);
    intervention.immediateAction = replaceRefs(intervention.immediateAction, refs);
    intervention.observeNext = replaceRefs(intervention.observeNext, refs);
  }
  if ((mode === 'assist' || mode === 'provisional') && !intervention) errors.push(`${mode} mode requires an intervention`);
  if (mode === 'provisional' && !uncertainties.some(item => item.impact === 'high')) errors.push('provisional mode must name the critical uncertainty');
  if (mode === 'clarify') intervention = intervention && intervention.blocks.length ? intervention : null;

  const community = [];
  const seen = new Set();
  (Array.isArray(raw.community) ? raw.community : []).slice(0, 4).forEach(item => {
    const refId = String(item?.ref || '').trim().toUpperCase();
    const ref = refs[refId];
    if (!ref) { warnings.push(`dropped unknown community ref ${refId || '(blank)'}`); return; }
    if (seen.has(refId)) return;
    const how = cleanText(item?.howItChanges, LIMITS.shortText);
    if (!how) { warnings.push(`dropped ${refId}: no explanation of how it changes the help`); return; }
    if (CLAIM.test(how)) { errors.push(`unsupported claim about ${ref.kind === 'person' ? 'a person' : 'a method'}`); return; }
    if (ref.kind === 'method' && ref.evidence !== 'verified' && STRONG_EVIDENCE.test(how)) { errors.push('overstates the evidence for a community method'); return; }
    seen.add(refId);
    community.push({ ref: refId, howItChanges: replaceRefs(how, refs) });
  });

  const value = { interpretation, uncertainties, mode, clarification, intervention, community };
  return { ok: errors.length === 0, value: errors.length ? null : value, errors, warnings };
}
