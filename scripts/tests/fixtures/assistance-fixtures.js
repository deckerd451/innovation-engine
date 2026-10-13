// Test-only fixture community for the assistance acceptance tests and the
// rendered browser journey. None of this is production data; names are
// placeholders and nothing here is ever seeded into Supabase.
(function (root) {
  'use strict';
  const ID = {
    me: '11111111-1111-4111-8111-111111111111',
    dana: '22222222-2222-4222-8222-222222222222',
    sam: '33333333-3333-4333-8333-333333333333',
    riley: '44444444-4444-4444-8444-444444444444',
    jordan: '55555555-5555-4555-8555-555555555555',
    harbor: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    lab: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    stealth: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    speakerTask: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    venueTask: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    stealthTask: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
    demoPkg: '99999999-0000-4000-8000-000000000001',
    danaPkg: '99999999-0000-4000-8000-000000000002',
    rileyPrivatePkg: '99999999-0000-4000-8000-000000000003',
  };

  function seed() {
    return {
      __me: ID.me,
      community: [
        { id: ID.me, user_id: 'auth-me', name: 'Test Member', skills: ['Python'], interests: [] },
        { id: ID.dana, user_id: 'auth-dana', name: 'Dana (fixture)', skills: ['Public Speaking', 'Event Planning'], interests: [] },
        { id: ID.sam, user_id: 'auth-sam', name: 'Sam (fixture)', skills: ['React'], interests: ['Gaming'] },
        { id: ID.riley, user_id: 'auth-riley', name: 'Riley (fixture)', skills: ['Public speaking'], interests: [] },
        { id: ID.jordan, user_id: 'auth-jordan', name: 'Jordan (fixture)', skills: ['Keynote'], interests: [] },
      ],
      connections: [
        { from_user_id: ID.me, to_user_id: ID.dana, status: 'accepted' },
        { from_user_id: ID.sam, to_user_id: ID.me, status: 'accepted' },
        { from_user_id: ID.me, to_user_id: ID.jordan, status: 'pending' },
      ],
      projects: [
        { id: ID.harbor, title: 'Harborhack 2026 prep', description: 'Annual hackathon', status: 'active', creator_id: ID.me, created_at: '2026-09-01T00:00:00Z' },
        { id: ID.lab, title: 'Startup lab', description: 'Weekly founder sessions', status: 'active', creator_id: ID.sam, created_at: '2026-08-01T00:00:00Z' },
        { id: ID.stealth, title: 'Investor day', description: 'Private planning for investor day speakers', status: 'active', creator_id: ID.riley, created_at: '2026-07-01T00:00:00Z' },
      ],
      project_members: [
        { project_id: ID.lab, user_id: ID.me, role: 'member' },
        { project_id: ID.stealth, user_id: ID.jordan, role: 'member' },
      ],
      project_tasks: [
        { id: ID.speakerTask, project_id: ID.harbor, title: 'select speaker(s)', description: null, status: 'open', priority: 'high', due_date: null, created_at: '2026-09-02T00:00:00Z' },
        { id: ID.venueTask, project_id: ID.harbor, title: 'Book the venue', description: null, status: 'open', priority: 'medium', due_date: null, created_at: '2026-09-03T00:00:00Z' },
        { id: ID.stealthTask, project_id: ID.stealth, title: 'Choose keynote speakers for investor day', description: 'Private shortlist', status: 'open', priority: 'high', due_date: null, created_at: '2026-07-02T00:00:00Z' },
      ],
      capability_packages: [
        { id: ID.demoPkg, project_id: ID.lab, creator_id: ID.sam, title: 'Validate a business idea through customer interviews', goal: 'Determine whether potential customers have a real problem worth solving.', summary: 'DEMONSTRATION CONTENT — Use this example to test goal search and task import. It represents a reusable interview workflow; it is not evidence that the workflow has been completed.', steps: ['Identify five potential customers.', 'Prepare five open-ended interview questions.', 'Interview the customers.', 'Record recurring problems.', 'Decide whether to prototype the idea.'], tools: [], constraints: { demonstration: true }, permission_mode: 'community', evidence_status: 'untested', version: 1, updated_at: '2026-10-01T00:00:00Z' },
        { id: ID.danaPkg, project_id: ID.lab, creator_id: ID.dana, title: 'Recruit hackathon speakers through sponsors', goal: 'Get confirmed speakers for a student hackathon.', summary: 'Asked each sponsor for one engineer to speak.', steps: ['List sponsors', 'Ask each sponsor for one speaker', 'Confirm logistics'], tools: [], constraints: {}, permission_mode: 'community', evidence_status: 'tested', version: 1, updated_at: '2026-09-20T00:00:00Z' },
        { id: ID.rileyPrivatePkg, project_id: ID.stealth, creator_id: ID.riley, title: 'Keynote speaker shortlist for investor day', goal: 'Pick keynote speakers.', summary: 'Private.', steps: ['Private step'], tools: [], constraints: {}, permission_mode: 'private', evidence_status: 'untested', version: 1, updated_at: '2026-10-05T00:00:00Z' },
      ],
      capability_attempts: [
        { id: 'attempt-dana-1', capability_id: ID.danaPkg, member_id: ID.sam, outcome_status: 'succeeded', verification_status: 'self_reported', task_ids: [] },
      ],
    };
  }

  const api = { ID, seed };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AssistanceFixtures = api;
})(typeof window !== 'undefined' ? window : globalThis);
