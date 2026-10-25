#!/usr/bin/env node
'use strict';

// Home's Reflection rail runs the real start-daily-digest.js and
// start-sequence-report.js in a sandbox:
//  1. One Move (Collaboration Concierge) never offers a new connection to the
//     member, an existing connection, a teammate, or anyone with a request
//     waiting in either direction.
//  2. A brief or report still loading for the previous member never appears
//     after sign-out or for the next member, and sign-out clears the rail.
//  3. "Needs attention" lists only what others are waiting on the member for;
//     what the member sent is not urgent work.
//  4. Desktop Home's heading welcomes the member by name instead of "You".

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

class FakeElement {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.ownText = '';
    this.style = {};
    this.dataset = {};
    this.attributes = {};
    this.listeners = {};
    this.hidden = false;
    this.className = '';
    this.section = null;
    const classes = new Set();
    this.classList = {
      add: (...names) => names.forEach(name => classes.add(name)),
      remove: (...names) => names.forEach(name => classes.delete(name)),
      toggle: (name, force) => ((force ?? !classes.has(name)) ? classes.add(name) : classes.delete(name)),
      contains: name => classes.has(name),
    };
  }
  get textContent() { return [this.ownText, ...this.children.map(child => child.textContent)].filter(Boolean).join(' '); }
  set textContent(value) { this.ownText = String(value ?? ''); this.children = []; }
  get innerHTML() { return this.textContent; }
  set innerHTML(value) { this.textContent = String(value).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); }
  appendChild(child) { this.children.push(child); return child; }
  append(...children) {
    children.forEach(child => {
      if (typeof child !== 'string') return this.appendChild(child);
      const text = new FakeElement('#text');
      text.ownText = child;
      return this.appendChild(text);
    });
  }
  replaceChildren(...children) { this.children = []; this.append(...children); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  addEventListener(type, handler) { (this.listeners[type] = this.listeners[type] || []).push(handler); }
  closest(selector) { return selector === '.network-reflection-section' ? this.section : null; }
  querySelector() { return null; }
  querySelectorAll() { return []; }
}

// A Supabase query builder: every method chains; awaiting it resolves the
// rows the test supplies for that table.
function fakeSupabase({ tables = {}, authId, rpc }) {
  const builder = (table) => {
    const proxy = new Proxy({}, {
      get(_, prop) {
        if (prop === 'then') {
          const rows = typeof tables[table] === 'function' ? tables[table]() : (tables[table] || []);
          return (resolve, reject) => Promise.resolve({ data: rows, error: null, count: 0 }).then(resolve, reject);
        }
        return () => proxy;
      },
    });
    return proxy;
  };
  return {
    from: builder,
    rpc: rpc || (async () => ({ data: null, error: null })),
    auth: { getUser: async () => ({ data: { user: authId() ? { id: authId() } : null }, error: null }) },
  };
}

function createPage() {
  const elements = {};
  const sectionFor = id => {
    const el = new FakeElement();
    el.section = new FakeElement('section');
    elements[id] = el;
    return el;
  };
  ['network-reflection-focus', 'network-reflection-attention', 'network-reflection-next-moves'].forEach(sectionFor);
  elements['network-reflection-brief'] = new FakeElement();
  elements['network-reflection-summary'] = new FakeElement();

  const listeners = {};
  const store = new Map();
  const page = {
    console: { log() {}, info() {}, warn() {}, debug() {}, error() {} },
    setTimeout, clearTimeout, setInterval, clearInterval, Promise, Date, JSON, Math, Map, Set,
    localStorage: { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, String(value)), removeItem: key => store.delete(key) },
    innerWidth: 1366,
    document: {
      currentScript: null,
      head: new FakeElement('head'),
      body: new FakeElement('body'),
      getElementById: id => elements[id] || null,
      createElement: tag => new FakeElement(tag),
      querySelector: () => null,
      querySelectorAll: () => [],
    },
    addEventListener(type, handler) { (listeners[type] = listeners[type] || []).push(handler); },
    removeEventListener() {},
    dispatchEvent() { return true; },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    Event: class { constructor(type) { this.type = type; } },
    emit(type, detail) { (listeners[type] || []).forEach(handler => handler({ type, detail })); },
    elements,
  };
  page.window = page;
  vm.createContext(page);
  vm.runInContext(read('assets/js/start-sequence-report.js'), page, { filename: 'start-sequence-report.js' });
  vm.runInContext(read('assets/js/start-daily-digest.js'), page, { filename: 'start-daily-digest.js' });
  return page;
}

const settle = () => new Promise(resolve => setTimeout(resolve, 0));
const person = (id, name, extra = {}) => ({
  id: `person:${id}`, category: 'person', headline: name, subhead: 'Shared skills', score: 5,
  primary_refs: [{ nodeType: 'person', nodeId: id, label: name }], ...extra,
});
const brief = (communityId, people) => ({
  user: { community_id: communityId },
  meta: {},
  sections: { people_worth_knowing: people, opportunities_for_you: [], signals_moving: [], your_pattern: [] },
});

// Briefs resolve when the test says so, in any order.
function deferredEngine(page) {
  const calls = [];
  vm.runInContext('_briefEnginePromise = Promise.resolve({ generateDailyBrief: (args) => window.__nextBrief(args) })', page);
  page.__nextBrief = (args) => new Promise(resolve => calls.push({ args, resolve }));
  return calls;
}

(async () => {
  // --- 1. One Move offers new introductions only --------------------------
  {
    const page = createPage();
    page.currentUserProfile = { id: 'me' };
    page.supabase = fakeSupabase({
      authId: () => 'auth-me',
      tables: {
        connections: [
          { from_user_id: 'me', to_user_id: 'asked-by-me', status: 'pending' },
          { from_user_id: 'asked-me', to_user_id: 'me', status: 'pending' },
          { from_user_id: 'friend', to_user_id: 'me', status: 'accepted' },
        ],
      },
    });
    const candidates = [
      person('me', 'Me myself', { score: 99 }),
      person('known', 'Already connected', { score: 90, relationship: 'connected' }),
      person('teammate', 'Teammate', { score: 80, relationship: 'teammate' }),
      person('asked-by-me', 'Requested by me', { score: 70 }),
      person('asked-me', 'Requested me', { score: 60 }),
      person('friend', 'Friend', { score: 50 }),
      person('newcomer', 'New person', { score: 10 }),
    ];
    const pick = await vm.runInContext(`(async () => {
      await _loadConciergeRelatedConnections(window.currentUserProfile);
      return _getConciergeCandidate(window.__brief, window.currentUserProfile);
    })()`, Object.assign(page, { __brief: brief('me', candidates) }));
    assert.equal(pick?.entityId, 'newcomer',
      'One Move skips the member, existing connections, teammates and pending requests in either direction');
    page.__brief = brief('someone-else', candidates);
    assert.equal(vm.runInContext('_getConciergeCandidate(window.__brief, window.currentUserProfile)', page), null,
      'a brief generated for another member is never used');
  }

  // --- 2a. Account switch: a late brief for the previous member is dropped --
  {
    const page = createPage();
    let auth = 'auth-a';
    page.currentUserProfile = { id: 'a' };
    page.supabase = fakeSupabase({ authId: () => auth });
    page.getStartSequenceData = async () => ({ profile: { id: page.currentUserProfile?.id }, immediate_actions: {} });
    const calls = deferredEngine(page);

    const first = page.StartDailyDigest.renderNetworkReflection({ id: 'a' });
    await settle();
    assert.equal(calls.length, 1, 'the first brief is loading');

    page.currentUserProfile = null;
    page.emit('user-logged-out');
    auth = 'auth-b';
    page.currentUserProfile = { id: 'b' };
    const second = page.StartDailyDigest.renderNetworkReflection({ id: 'b' });
    await settle();
    assert.equal(calls.length, 2, 'the second brief is loading');

    calls[1].resolve(brief('b', [person('carol', 'Carol New')]));
    await second;
    // The first account's brief arrives last and recommends the new member.
    calls[0].resolve(brief('a', [person('b', 'Bea (the member now signed in)', { score: 99 })]));
    await first;
    await settle();

    const briefText = page.elements['network-reflection-brief'].textContent;
    const focusText = page.elements['network-reflection-focus'].textContent;
    assert.match(focusText, /Meet Carol New/, 'One Move comes from the current member\'s brief');
    assert.doesNotMatch(briefText + focusText, /Bea/, 'nothing from the previous member\'s brief appears');
    assert.equal(vm.runInContext('_lastDailyBrief.user.community_id', page), 'b');
  }

  // --- 2b. Sign-out with a brief in flight and after one has rendered -------
  {
    const page = createPage();
    let auth = 'auth-a';
    page.currentUserProfile = { id: 'a' };
    page.supabase = fakeSupabase({ authId: () => auth });
    page.getStartSequenceData = async () => ({ profile: { id: 'a' }, immediate_actions: { unread_messages: { count: 2 } } });
    const calls = deferredEngine(page);

    const rendered = page.StartDailyDigest.renderNetworkReflection({ id: 'a' });
    await settle();
    calls[0].resolve(brief('a', [person('dana', 'Dana')]));
    await rendered;
    assert.match(page.elements['network-reflection-focus'].textContent, /Meet Dana/);
    assert.match(page.elements['network-reflection-attention'].textContent, /waiting on your reply/);

    const late = page.StartDailyDigest.renderNetworkReflection({ id: 'a' });
    await settle();
    auth = null;
    page.emit('user-logged-out');
    calls[1].resolve(brief('a', [person('dana', 'Dana')]));
    await late;
    await settle();
    ['network-reflection-brief', 'network-reflection-focus', 'network-reflection-attention', 'network-reflection-next-moves'].forEach(id => {
      assert.equal(page.elements[id].textContent, '', `${id} is empty after sign-out`);
    });
    assert.equal(page.elements['network-reflection-attention'].section.hidden, true, 'Needs attention is hidden after sign-out');
    assert.equal(vm.runInContext('_lastDailyBrief', page), null, 'no brief is kept after sign-out');
  }

  // --- 2c. The 5-minute report cache belongs to one member ----------------
  {
    const page = createPage();
    const pending = [];
    let auth = 'auth-a';
    page.supabase = fakeSupabase({
      authId: () => auth,
      rpc: (name, args) => new Promise(resolve => pending.push({ args, resolve })),
    });
    const forA = page.getStartSequenceData(false);
    await settle();
    page.emit('user-logged-out');
    auth = 'auth-b';
    const forB = page.getStartSequenceData(false);
    await settle();
    assert.equal(pending.length, 2, 'the next member does not wait on the previous member\'s report');
    pending[1].resolve({ data: { has_profile: true, profile: { id: 'b' } }, error: null });
    assert.equal((await forB).profile.id, 'b');
    pending[0].resolve({ data: { has_profile: true, profile: { id: 'a' } }, error: null });
    await forA;
    assert.equal((await page.getStartSequenceData(false)).profile.id, 'b', 'the previous member\'s late report is not cached');
  }

  // --- 3. Needs attention is inbound only ---------------------------------
  {
    const page = createPage();
    const attention = page.elements['network-reflection-attention'];
    vm.runInContext(`_renderReflectionAttention({
      immediate_actions: {
        pending_requests: { count: 1 }, unread_messages: { count: 2 }, bids_to_review: { count: 1 },
        messages_awaiting_reply: { count: 30 }, pending_bids: { count: 4 },
      },
      opportunities: { skill_matched_projects: { count: 3, items: [{ matched_skills: ['design'] }] } },
    })`, page);
    const text = attention.textContent;
    assert.match(text, /1 person wants to connect with you/);
    assert.match(text, /2 people are waiting on your reply/);
    assert.match(text, /1 person offered to help on your projects/);
    assert.doesNotMatch(text, /waiting to hear back|you sent|30|match your skills/,
      'messages and offers the member sent, and skill matches, are not urgent work');
    assert.equal(attention.section.hidden, false);

    vm.runInContext(`_renderReflectionAttention({
      immediate_actions: { messages_awaiting_reply: { count: 30 }, pending_bids: { count: 4 } },
    })`, page);
    assert.equal(attention.section.hidden, true, 'with only outgoing items, Needs attention is not shown');
    assert.equal(attention.textContent, '');

    // Projects matching the member's skills stay available, calmly, as a Move.
    vm.runInContext(`_renderReflectionNextMoves({
      has_profile: true, immediate_actions: {},
      opportunities: { skill_matched_projects: { count: 3, items: [{ matched_skills: ['design'] }] } },
    })`, page);
    assert.match(page.elements['network-reflection-next-moves'].textContent, /3 projects match your skills/);
  }

  // --- 5. What Home takes from the brief ---------------------------------
  {
    const page = createPage();
    page.currentUserProfile = { id: 'me' };
    page.supabase = fakeSupabase({ authId: () => 'auth-me', tables: { connections: [{ from_user_id: 'me', to_user_id: 'friend', status: 'accepted' }] } });
    const item = (type, id, name, score) => ({ id: `${type}:${id}`, category: type, headline: name, subhead: `Why ${name}`, score,
      invitation_reason: `Why ${name}`, primary_refs: [{ nodeType: type, nodeId: id, label: name }] });
    page.__brief = brief('me', [
      person('friend', 'Friend', { score: 9 }),
      person('ana', 'Ana', { score: 8 }),
      person('bo', 'Bo', { score: 7 }),
    ]);
    page.__brief.sections.opportunities_for_you = [item('opportunity', 'o1', 'Mentor founders', 6), item('opportunity', 'o2', 'Judge a pitch', 5), item('opportunity', 'o3', 'Host a table', 4)];
    // Recent activity is never an invitation on its own
    // (test-home-credible-invitations.js covers what is).
    page.__brief.sections.signals_moving = [item('opportunity', 'o9', 'Busy elsewhere', 9)];
    vm.runInContext(`_lastDailyBrief = window.__brief`, page);
    await vm.runInContext(`_loadConciergeRelatedConnections(window.currentUserProfile)`, page);
    const first = page.StartDailyDigest.homeSuggestions();
    assert.equal(first.status, 'ready');
    assert.equal(first.person?.name, 'Ana', 'one new introduction (an existing connection is skipped)');
    assert.equal(JSON.stringify(first.joinIn.map(entry => entry.name)), '["Mentor founders","Judge a pitch"]', 'up to two ways to join in');

    // "Not now" on Home moves to the next person, never to an opportunity.
    const root = new FakeElement();
    let emptied = 0;
    page.StartDailyDigest.renderIntroduction(root, first.person, () => { emptied += 1; });
    assert.match(root.textContent, /Meet Ana/);
    assert.doesNotMatch(root.textContent, /ONE MOVE/, 'Home shows no rail eyebrow');
    const notNow = (el) => el.className === 'network-reflection-concierge-link' ? el : el.children.map(notNow).find(Boolean);
    notNow(root).listeners.click[0]();
    assert.match(root.textContent, /Meet Bo/);
    notNow(root).listeners.click[0]();
    assert.equal(emptied, 1, 'with no one left, Home is told so');
    assert.equal(page.StartDailyDigest.homeSuggestions().person, null, 'set-aside people stay set aside');

    vm.runInContext(`_lastDailyBrief = null; _setBriefStatus('loading')`, page);
    assert.equal(page.StartDailyDigest.homeSuggestions().status, 'loading');
    page.__brief = brief('someone-else', [person('zed', 'Zed')]);
    vm.runInContext(`_lastDailyBrief = window.__brief`, page);
    assert.equal(page.StartDailyDigest.homeSuggestions().person, null, 'never another member\'s suggestions');
  }

  // --- 4. Desktop Home's heading welcomes the member (You is the profile) ---
  {
    const html = read('index.html');
    const dashboard = read('assets/js/command-dashboard.js');
    assert.match(html, /<h1 class="cd-identity-name" id="cd-user-name">Welcome<\/h1>/, 'Home has a real heading');
    assert.doesNotMatch(dashboard, /nameEl\.textContent = 'You'/, 'Home is never titled "You"');
    assert.match(dashboard, /`Welcome, \$\{_displayName\(profile\)\}` : 'Welcome'/);
    assert.match(dashboard, /profile\?\.name \|\| profile\?\.full_name \|\| profile\?\.username/);
  }

  console.log('Home trustworthy suggestions and calm attention: all checks passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
