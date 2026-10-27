#!/usr/bin/env node
'use strict';

// Home's "Ways to join in" offers only credible invitations:
//  1. projects_for_you (the real builder in daily-brief-engine.js) never
//     offers a project the member created, joined or asked to join, or one
//     that is completed or otherwise not open; it keeps open projects that
//     match what the member listed or that someone they know is on, and says
//     which
//  2. opportunities_for_you leaves out what the member posted, what an
//     organization they run posted, and what they already said they're
//     interested in, and gives a reason only when there is one
//  3. Home (start-daily-digest.js) takes invitations from those two sections
//     only -- never recent activity on its own -- and drops items with no
//     reason, projects the member has since created or joined, and
//     opportunities past their deadline; with nothing left, Ways to join in
//     is empty and Home's quiet state can show

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '../..');
global.window = {};

const ME = 'me';
const now = new Date('2026-10-24T12:00:00Z');
const project = (id, title, extra = {}) => ({ id, title, description: '', status: 'open', creator_id: 'riley', tags: [], required_skills: [], ...extra });
const names = items => items.map(item => item.primary_refs[0].label).sort();

(async () => {
  const engine = await import(pathToFileURL(path.join(root, 'assets/js/intelligence/daily-brief-engine.js')).href);
  const buildProjects = engine.__testBuildProjectsForYou;
  const buildOpportunities = engine.__testBuildOpportunitiesForYou;
  const buildMemberships = engine.__testBuildMembershipMaps;
  assert.equal(typeof buildProjects, 'function', 'the engine exposes the projects_for_you builder for tests');

  const userProfile = { id: ME, skills: ['Python'], interests: ['Climate'] };
  const memberships = buildMemberships({
    communityId: ME,
    connections: [{ from_user_id: ME, to_user_id: 'dana', status: 'accepted' }],
    pendingConnections: [],
    projectMembers: [
      { project_id: 'p-joined', user_id: ME, role: 'member' },
      { project_id: 'p-requested', user_id: ME, role: 'pending' },
      { project_id: 'p-team', user_id: 'dana', role: 'member' },
      { project_id: 'p-asked', user_id: 'dana', role: 'pending' },
    ],
    orgMembers: [
      { organization_id: 'org-mine', community_id: ME, role: 'owner' },
      { organization_id: 'org-member', community_id: ME, role: 'member' },
    ],
    themeParticipants: [],
  });

  // --- 1. Projects ---------------------------------------------------------
  {
    const projects = [
      project('p-owned', 'My climate python project', { creator_id: ME }),
      project('p-joined', 'Joined climate project'),
      project('p-requested', 'Python study group'),
      project('p-closed', 'Climate data archive', { status: 'completed', description: 'Python' }),
      project('p-archived', 'Python archive', { status: 'archived' }),
      project('p-nomatch', 'Pottery studio', { description: 'Clay and kilns' }),
      project('p-match', 'Climate dashboard', { description: 'Flood maps with Python' }),
      project('p-skills', 'Data help', { status: 'recruiting', required_skills: ['Python'] }),
      project('p-friend', 'Tool library', { status: 'active', creator_id: 'dana' }),
      project('p-team', 'Community garden', { status: 'in-progress' }),
      project('p-asked', 'Bike repair night'),
    ];
    const items = buildProjects({ userProfile, projects, memberships, maxItems: 10 });
    const offered = names(items);
    for (const excluded of ['My climate python project', 'Joined climate project', 'Python study group']) {
      assert.ok(!offered.includes(excluded), `a project the member created, joined or asked to join is not an invitation: ${excluded}`);
    }
    for (const excluded of ['Climate data archive', 'Python archive']) {
      assert.ok(!offered.includes(excluded), `a completed or archived project is not an invitation: ${excluded}`);
    }
    assert.ok(!offered.includes('Pottery studio'), 'recent or open alone is not a reason');
    assert.ok(!offered.includes('Bike repair night'), 'a connection with only a pending request is not on the team');
    assert.deepEqual(offered, ['Climate dashboard', 'Community garden', 'Data help', 'Tool library'].sort(),
      'open projects that match what the member listed, or that a connection created or works on, stay');
    const reason = id => items.find(item => item.primary_refs[0].nodeId === id).invitation_reason;
    assert.equal(reason('p-match'), 'Matches what you listed: climate, python');
    assert.equal(reason('p-skills'), 'Matches what you listed: python');
    assert.equal(reason('p-friend'), 'Someone you’re connected to is on this project');
    assert.equal(reason('p-team'), 'Someone you’re connected to is on this project');
    assert.equal(items[0].primary_refs[0].nodeType, 'project');

    const noTerms = buildProjects({ userProfile: { id: ME, skills: [], interests: [] }, projects, memberships: buildMemberships({ communityId: ME }), maxItems: 10 });
    assert.deepEqual(noTerms, [], 'a newcomer with nothing listed and no connections gets no project invitations');
  }

  // --- 2. Opportunities ----------------------------------------------------
  {
    const opp = (id, title, extra = {}) => ({ id, title, description: '', status: 'open', is_public: true, skills: [], organization_id: 'org-other', posted_by: 'riley', created_at: now.toISOString(), ...extra });
    const opportunities = [
      opp('o-posted', 'Python mentor I posted', { posted_by: ME }),
      opp('o-managed', 'Python mentor from my org', { organization_id: 'org-mine' }),
      opp('o-interested', 'Python reviewer', { organization_id: 'org-x' }),
      opp('o-match', 'Python mentor for a coding club', { application_deadline: '2026-11-01T00:00:00Z' }),
      opp('o-org', 'Volunteer at our members night', { organization_id: 'org-member' }),
    ];
    const items = buildOpportunities({ userProfile, opportunities, opportunityInterests: [{ opportunity_id: 'o-interested' }], memberships, activityHitMap: {}, now, windowDays: 14, maxItems: 10 });
    const offered = names(items);
    assert.ok(!offered.includes('Python mentor I posted'), 'the member’s own opportunity is not an invitation');
    assert.ok(!offered.includes('Python mentor from my org'), 'an opportunity from an organization the member runs is not an invitation');
    assert.ok(!offered.includes('Python reviewer'), 'an opportunity the member already expressed interest in is not new');
    const match = items.find(item => item.primary_refs[0].nodeId === 'o-match');
    assert.equal(match.invitation_reason, 'Matches what you listed: python');
    assert.equal(match.available_until, '2026-11-01T00:00:00Z', 'the deadline travels with the invitation');
    const org = items.find(item => item.primary_refs[0].nodeId === 'o-org');
    assert.equal(org.invitation_reason, 'From an organization you belong to');
  }

  // --- 3. What Home takes from the brief -----------------------------------
  {
    const page = {
      console: { log() {}, info() {}, warn() {}, debug() {}, error() {} },
      setTimeout, clearTimeout, Promise, Date, JSON, Math, Map, Set,
      localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
      document: { currentScript: null, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], createElement: () => ({ style: {} }), head: { appendChild() {} }, body: { appendChild() {}, classList: { add() {}, remove() {} } } },
      addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
      CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
      currentUserProfile: { id: ME },
    };
    page.window = page;
    vm.createContext(page);
    vm.runInContext(fs.readFileSync(path.join(root, 'assets/js/start-daily-digest.js'), 'utf8'), page, { filename: 'start-daily-digest.js' });

    const item = (type, id, name, score, extra = {}) => ({ id: `${type}_${id}`, category: type, headline: name, subhead: `About ${name}`, score,
      primary_refs: [{ nodeType: type, nodeId: id, label: name }], ...extra });
    const yesterday = new Date(Date.now() - 86400000).toISOString();
    const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString();
    page.__brief = {
      user: { community_id: ME },
      sections: {
        people_worth_knowing: [],
        // Recent activity, including the member's own project: never an invitation on its own.
        signals_moving: [item('project', 'p-owned', 'My own project', 0.99), item('project', 'p-recent', 'Busy project', 0.98)],
        projects_for_you: [
          item('project', 'p-match', 'Climate dashboard', 0.6, { invitation_reason: 'Matches what you listed: climate' }),
          item('project', 'p-just-joined', 'Joined since the brief', 0.9, { invitation_reason: 'Matches what you listed: python' }),
        ],
        opportunities_for_you: [
          item('opportunity', 'o-unexplained', 'Fits your profile', 0.95),
          item('opportunity', 'o-closed', 'Deadline passed', 0.8, { invitation_reason: 'Matches what you listed: python', available_until: yesterday }),
          item('opportunity', 'o-open', 'Python mentor', 0.5, { invitation_reason: 'Matches what you listed: python', available_until: nextWeek }),
        ],
      },
    };
    vm.runInContext('_lastDailyBrief = window.__brief', page);
    const home = page.StartDailyDigest.homeSuggestions({ ownProjectIds: ['p-just-joined'] });
    assert.equal(home.status, 'ready');
    assert.deepEqual(JSON.parse(JSON.stringify(home.joinIn.map(entry => [entry.name, entry.reason]))), [
      ['Climate dashboard', 'Matches what you listed: climate'],
      ['Python mentor', 'Matches what you listed: python'],
    ], 'only reasoned, still-open invitations, never recent activity or a project joined since the brief');

    page.__brief.sections.projects_for_you = [];
    page.__brief.sections.opportunities_for_you = [item('opportunity', 'o-unexplained', 'Fits your profile', 0.95)];
    assert.deepEqual(JSON.parse(JSON.stringify(page.StartDailyDigest.homeSuggestions().joinIn)), [],
      'with no credible invitation, Ways to join in is empty (and Home can show its quiet state)');

    const homeView = fs.readFileSync(path.join(root, 'assets/js/home-view.js'), 'utf8');
    assert.match(homeView, /homeSuggestions\?\.\(\{ ownProjectIds \}\)/, 'Home passes the member’s own projects');
    assert.match(homeView, /calmly\(paintMine\);\n\s*calmly\(paintJoin\);/, 'invitations are checked again once the member’s projects load');
  }

  console.log('Home credible invitations: all checks passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
