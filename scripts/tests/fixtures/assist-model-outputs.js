// TEST-ONLY scripted stand-in for a model provider. It is NOT a model and
// proves nothing about semantic quality: it returns fixed, contract-shaped
// outputs chosen from what the service put in the prompt, so tests can check
// that context, clarifications and permissioned community data flow through
// the real service, validator and UI. Live quality is evaluated separately
// (scripts/eval/assist-eval.mjs, requires an authorized provider key).
(function (root) {
  'use strict';

  function dataFrom(prompt) {
    const match = String(prompt).match(/<buildspace-data>\n([\s\S]*)\n<\/buildspace-data>/);
    return match ? JSON.parse(match[1]) : null;
  }

  const clarifyAgents = () => ({
    interpretation: { objective: 'Supply the “agents” Harborhack 2026 needs', intendedOutcome: 'Harborhack has the agents it needs, arranged before the event', known: ['Task: Supply Agents', 'Note: “Agent Heights? What other Agents?”', 'Project: Harborhack 2026 prep'], inferred: ['“Agent Heights” may be a product, a team, or a supplier'], constraints: [] },
    uncertainties: [{ about: 'Whether “agents” means AI software agents or people acting as agents', impact: 'high' }],
    mode: 'clarify',
    clarification: {
      question: 'For Harborhack, what kind of agents are you trying to supply — AI agents for teams to build with, or people acting as agents?',
      why: 'The plan for software agents (platforms, credits, templates) is completely different from the plan for people (roles, recruiting, briefing).',
      choices: [{ label: 'AI agents (software)', value: 'AI agents — software for hackathon teams' }, { label: 'People acting as agents', value: 'People acting as agents or representatives' }, { label: 'Something else', value: 'Something else' }],
    },
  });

  function assistAiAgents(data) {
    const method = (data.community?.methods || [])[0];
    const person = (data.community?.connections || [])[0];
    const steps = [
      { text: 'List what teams need from an agent: model access, tool calling, hosting', detail: 'Decides which options below actually qualify' },
      { text: 'Ask Agent Heights for a hackathon offer (credits, seats, support)', detail: 'Your note names them — treat them as one candidate, not the answer' },
      { text: 'Pick one default option and one fallback, then announce them to teams', detail: 'One default stops 30 teams from each setting up something different' },
    ];
    if (method) steps.splice(1, 0, { text: 'Arrange sponsor API credits before registration closes', detail: `From a shared method (${method.evidence.replace('_', ' ')})` });
    return {
      interpretation: { objective: 'Supply AI agent tooling for Harborhack 2026 teams', intendedOutcome: 'Every team can run an AI agent on day one, with one supported default option', known: ['Task: Supply Agents', 'Agent Heights is mentioned as one option'], inferred: ['Teams will build with AI agents during the hackathon'], constraints: [] },
      uncertainties: [{ about: 'How many teams and what budget, if any, exists for credits', impact: 'medium' }],
      mode: 'assist',
      clarification: null,
      intervention: {
        title: 'Compare agent options for Harborhack teams',
        why: 'The note asks “What other Agents?”, so the useful next move is a side-by-side comparison against what hackathon teams need, with Agent Heights as one candidate.',
        immediateAction: 'Score the three options below, then send the offer request to the top one.',
        observeNext: 'A written offer (credits or seats) from at least one provider before registration closes.',
        blocks: [
          { type: 'matrix', label: 'Agent options for Harborhack teams', rowLabel: 'Option', criteria: [{ label: 'Free for teams' }, { label: 'Setup under 30 min' }, { label: 'Tool calling' }, { label: 'Sponsor fit' }], rows: ['Agent Heights', 'Open-source agent framework + hosted model', 'Low-code agent builder'] },
          { type: 'checklist', label: 'Supply plan', items: steps },
          { type: 'message', label: 'Offer request', subject: 'Harborhack 2026 — agent access for hackathon teams', body: 'Hi — I’m helping run Harborhack 2026. Our teams will build with AI agents, and we’re choosing which platform to recommend as the default. Could you offer hackathon access (credits or seats for each team, plus a contact for support during the event)? If useful, we can feature you as the recommended agent platform. What would you need from us?' },
        ],
      },
      community: [
        ...(method ? [{ ref: method.ref, howItChanges: 'Adds arranging sponsor API credits before registration closes, which a previous hackathon found necessary.' }] : []),
        ...(person ? [{ ref: person.ref, howItChanges: 'Lists AI agents as a skill — worth asking to sanity-check the comparison.' }] : []),
      ],
    };
  }

  const assistPeopleAgents = () => ({
    interpretation: { objective: 'Recruit people to act as agents for Harborhack 2026', intendedOutcome: 'Enough briefed people are confirmed to cover the agent role during Harborhack', known: ['Task: Supply Agents'], inferred: ['“Agents” are people representing or helping teams'], constraints: [] },
    uncertainties: [{ about: 'How many agents are needed', impact: 'medium' }],
    mode: 'assist',
    clarification: null,
    intervention: {
      title: 'Define the agent role and recruit for it',
      why: 'People can only volunteer for a role they understand, so a short role brief and a ready invitation come first.',
      immediateAction: 'Check the role brief, then send the invitation to three people.',
      observeNext: 'Three people reply yes or maybe within a week.',
      blocks: [
        { type: 'fields', label: 'Agent role brief', items: [{ label: 'What an agent does', value: 'Represents a group of teams: answers questions, routes problems to organizers, keeps them on schedule' }, { label: 'Time needed', value: 'Event weekend, two 4-hour shifts' }, { label: 'Who fits', value: 'Past participants or organizers who know the venue and schedule' }] },
        { type: 'message', label: 'Agent invitation', subject: 'Be an agent at Harborhack 2026?', body: 'Hi — we’re looking for a few people to act as agents at Harborhack 2026: each agent looks after a group of teams, answers questions, and routes problems to organizers. It’s two 4-hour shifts over the event weekend. Would you be up for it, or know someone who would be?' },
      ],
    },
    community: [],
  });

  // Picks an output from the prompt the real service built.
  function respond(prompt) {
    const data = dataFrom(prompt);
    const answers = (data?.answeredQuestions || []).map(item => item.answer.toLowerCase());
    if (!answers.length) return clarifyAgents();
    if (answers.some(answer => /\bai\b|software/.test(answer))) return assistAiAgents(data);
    return assistPeopleAgents(data);
  }

  const api = { dataFrom, respond, clarifyAgents, assistAiAgents, assistPeopleAgents };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AssistModelOutputs = api;
})(typeof window !== 'undefined' ? window : globalThis);
