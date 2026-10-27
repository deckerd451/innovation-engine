// Unified assistance engine. Every entry point (My Space objective entry,
// focused task assistance) asks this module for one Assistance Decision:
// objective -> likely obstacle -> a concrete work product -> how to act ->
// what counts as progress -> what could become reusable learning.
//
// It is deterministic. Playbooks cover a small set of objective types that
// have defensible, reusable work products. Anything else gets one clarifying
// question about the obstacle instead of pretend understanding. Nothing here
// reads the network; community data is passed in by the caller after the
// database has applied its own permission rules.
(function () {
  'use strict';
  if (window.AssistanceEngine) return;

  const lower = (value) => String(value || '').toLowerCase();
  const words = (value) => lower(value).match(/[a-z0-9]+(?:'[a-z]+)?/g) || [];

  // Words that say nothing about what the work is. They never establish
  // relevance between an objective and a community resource.
  const GENERIC = new Set(['about', 'after', 'again', 'also', 'and', 'any', 'are', 'before', 'best', 'better', 'build', 'but', 'can', 'choose', 'create', 'doing', 'done', 'each', 'figure', 'find', 'first', 'for', 'from', 'get', 'getting', 'good', 'help', 'how', 'identify', 'into', 'just', 'make', 'more', 'need', 'new', 'next', 'not', 'our', 'out', 'pick', 'plan', 'prep', 'project', 'ready', 'real', 'select', 'some', 'start', 'step', 'steps', 'task', 'that', 'the', 'their', 'them', 'then', 'thing', 'things', 'this', 'through', 'want', 'way', 'week', 'what', 'when', 'whether', 'which', 'who', 'will', 'with', 'work', 'year', 'you', 'your']);

  function distinctiveTerms(text) {
    return Array.from(new Set(words(text)
      .map(token => token.replace(/'s$/, '').replace(/s$/, ''))
      .filter(token => token.length >= 3 && !GENERIC.has(token) && !GENERIC.has(`${token}s`) && !/^\d+$/.test(token))));
  }

  function eventNameFrom(projectTitle) {
    const cleaned = String(projectTitle || '').replace(/\b(prep|preparation|planning|plan|team|project|organizing|organising|committee)\b/gi, '').replace(/\s{2,}/g, ' ').replace(/[\s\-—:]+$/, '').trim();
    return cleaned || '';
  }

  // ------------------------------------------------------------------
  // Generic, objective-independent obstacle interventions. These are what
  // an unfamiliar objective gets after the member answers one question.
  // ------------------------------------------------------------------
  const OBSTACLES = {
    start: {
      label: 'I don’t know where to start',
      title: 'Turn the objective into a first move you can finish this week',
      obstacle: 'The objective is clear to you but the first concrete action is not.',
      blocks: (ctx) => [
        { type: 'fields', id: 'shape', label: 'Make the result concrete', items: [
          { key: 'done', label: 'It is done when…', value: '', hint: 'A specific thing someone could check, e.g. “5 people signed up”, “draft sent to Sam”.' },
          { key: 'deadline', label: 'By when (only if there is a real date)', value: '' },
          { key: 'unknown', label: 'The one thing you don’t know yet that blocks you', value: '', hint: 'A question you could answer, not a feeling.' },
        ] },
        { type: 'checklist', id: 'first-move', label: 'Pick the first move that answers that question', items: [
          { key: 'ask', text: 'Ask one person who has done this before a single specific question', detail: 'Fastest when the unknown is “how is this usually done?”' },
          { key: 'example', text: 'Find one finished example and list what it contains', detail: 'Fastest when the unknown is “what does good look like?”' },
          { key: 'draft', text: 'Produce a rough first version in 30 minutes and show it to someone', detail: 'Fastest when the unknown is “will this work?”' },
          { key: 'constraint', text: 'Confirm the hard constraint (budget, date, approval) with whoever owns it', detail: 'Fastest when the unknown is “am I allowed / can we afford it?”' },
        ] },
      ],
    },
    people: {
      label: 'I need someone with specific skills or experience',
      title: 'A ready-to-send help request',
      obstacle: 'Progress depends on knowledge or skills you don’t have yet.',
      blocks: (ctx, values) => [
        { type: 'fields', id: 'need', label: 'Be specific about the help', items: [
          { key: 'skill', label: 'Skill or experience needed', value: '', hint: 'e.g. “event sponsorship”, “React”, “grant writing”. Buildspace uses this to check your connections.', searchable: true },
          { key: 'ask', label: 'The specific question or task', value: '' },
          { key: 'time', label: 'How much of their time', value: '20 minutes on a call, or a written answer' },
        ] },
        { type: 'message', id: 'request', label: 'Help request', subject: `Quick question: ${ctx.quoted}`, body: `Hi — I’m working on ${ctx.quoted}. I’m stuck on ${values['need.ask'] || '[the specific question]'}, and you have experience with ${values['need.skill'] || '[the skill]'}. Would you be open to ${values['need.time'] || '20 minutes on a call'} this week? If you’re not the right person, a pointer to someone who is would help just as much.` },
      ],
    },
    decide: {
      label: 'I have to choose between options',
      title: 'A decision matrix that ranks your options',
      obstacle: 'Several options are possible and none is clearly better yet.',
      blocks: () => [
        { type: 'matrix', id: 'options', label: 'Score each option 1–3 against what matters', criteria: [
          { key: 'impact', label: 'Moves the objective most' },
          { key: 'effort', label: 'Least effort / cost' },
          { key: 'risk', label: 'Lowest risk' },
          { key: 'reversible', label: 'Easy to undo' },
        ], rows: 3, rowLabel: 'Option' },
        { type: 'list', id: 'tie', label: 'If two options tie', items: ['Choose the one that is easier to reverse and set a date to review it.', 'If one option produces information the other needs, do it first.'] },
      ],
    },
    waiting: {
      label: 'I’m waiting on someone else',
      title: 'A follow-up that gets a clear answer',
      obstacle: 'Someone else holds a decision or input you need.',
      blocks: (ctx, values) => [
        { type: 'fields', id: 'waiting', label: 'Make the ask answerable', items: [
          { key: 'who', label: 'Who you are waiting on', value: '' },
          { key: 'what', label: 'The exact decision or input you need', value: '' },
          { key: 'by', label: 'When you need it, and why', value: '' },
          { key: 'default', label: 'What you will do if you don’t hear back', value: '', hint: 'A stated default turns silence into a decision.' },
        ] },
        { type: 'message', id: 'followup', label: 'Follow-up message', subject: `Need a decision: ${ctx.quoted}`, body: `Hi ${values['waiting.who'] || '[name]'} — following up on ${ctx.quoted}. To keep it moving I need ${values['waiting.what'] || '[the decision or input]'} by ${values['waiting.by'] || '[date]'}. If I don’t hear back by then, I’ll ${values['waiting.default'] || '[your default]'}. A one-line reply is plenty.` },
      ],
    },
  };

  // ------------------------------------------------------------------
  // Playbooks. Each one must earn its place with work products that save
  // effort for that kind of objective; matching is phrase-based and guarded
  // against obvious false positives (a "bluetooth speaker" is not a talk).
  // ------------------------------------------------------------------
  const PLAYBOOKS = [
    {
      id: 'speaker-selection',
      label: 'Choosing speakers',
      match: (text) => /\b(speakers?|keynotes?|panelists?|presenters?|guest talks?|fireside)\b/.test(text) && !/\b(bluetooth|wireless|audio|sound system|smart speaker|subwoofer|amp|amplifier)\b/.test(text),
      outcome: 'Confirmed speakers who fit your audience, with dates and logistics agreed.',
      communityTerms: ['public speaking', 'speaking', 'keynote', 'event planning', 'events', 'community organizing', 'conference', 'meetups', 'hackathons'],
      learning: 'Which sources produced good candidates, what the invitation said, and how many replied.',
      steps: [
        {
          title: 'Agree what a good speaker looks like, then rank candidates',
          obstacle: 'Without agreed criteria a shortlist becomes a list of famous names nobody can book.',
          blocks: (ctx) => [
            { type: 'checklist', id: 'criteria', label: `Criteria for ${ctx.event || 'this event'} — keep the ones that matter`, items: [
              { key: 'audience', text: 'Speaks at your attendees’ level', detail: 'Students and first-time builders need different talks than senior engineers.' },
              { key: 'topic', text: 'Fits the theme or tracks', detail: 'A strong speaker on the wrong topic lowers the event, not raises it.' },
              { key: 'delivery', text: 'Has given talks before you can check', detail: 'A recorded talk or a reference from another organizer.' },
              { key: 'logistics', text: 'Can realistically attend', detail: 'Local, or travel fits your budget; available on the date.' },
              { key: 'mix', text: 'Adds a perspective the other speakers don’t', detail: 'Background, industry, career stage.' },
              { key: 'cost', text: 'Honorarium / travel within budget', detail: 'Know your number before you ask.' },
            ] },
            { type: 'matrix', id: 'shortlist', label: 'Shortlist — add names, score 1–3', criteria: [
              { key: 'fit', label: 'Topic & audience fit' },
              { key: 'delivery', label: 'Proven speaker' },
              { key: 'available', label: 'Likely available' },
              { key: 'cost', label: 'Within budget' },
            ], rows: 3, rowLabel: 'Candidate' },
            { type: 'list', id: 'sources', label: 'Where candidates usually come from', items: ['Sponsors’ engineers or founders (often happy to speak, and it helps the sponsorship)', 'Local university faculty and lab leads', 'Organizers of nearby meetups and user groups', 'Past winners or alumni of this event', 'Founders from your local startup community'] },
          ],
        },
        {
          title: 'Invite your top choices',
          obstacle: 'Good candidates say yes to specific, easy invitations and ignore vague ones.',
          blocks: (ctx, values, derived) => [
            { type: 'fields', id: 'invite', label: 'Fill in once — the message updates', items: [
              { key: 'date', label: 'Date and place', value: '' },
              { key: 'audience', label: 'Who attends, and how many', value: '' },
              { key: 'format', label: 'Format and length', value: '20-minute talk + 10 minutes Q&A' },
              { key: 'offer', label: 'What you can offer', value: 'Travel covered / honorarium / recording they can share', hint: 'Only list what is actually approved.' },
            ] },
            { type: 'message', id: 'invitation', label: `Invitation${derived.leader ? ` to ${derived.leader}` : ''}`, subject: `Speaking invitation: ${ctx.event || 'our event'}`, body: `Hi ${derived.leader || '[name]'} — I’m helping organize ${ctx.event || '[event]'} on ${values['invite.date'] || '[date and place]'}. We’re expecting ${values['invite.audience'] || '[who and how many]'}, and your work on [their topic] is exactly what this group needs to hear.\n\nWould you be open to a ${values['invite.format'] || '20-minute talk'}? We can offer ${values['invite.offer'] || '[what you can offer]'}.\n\nIf it’s a fit, a reply with your availability is all we need for now. If not, is there someone you’d recommend?` },
            { type: 'checklist', id: 'before-send', label: 'Before sending', items: [
              { key: 'date', text: 'The date is fixed (don’t invite to a maybe-date)' },
              { key: 'budget', text: 'Whatever you offered is approved' },
              { key: 'one', text: 'Send to your top 2–3, not the whole list — keep backups for declines' },
              { key: 'reply', text: 'Note when you’ll follow up (5 working days is normal)' },
            ] },
          ],
        },
        {
          title: 'Confirm details and line up a backup',
          obstacle: 'A yes isn’t a booked speaker until the logistics are settled.',
          blocks: () => [
            { type: 'checklist', id: 'confirm', label: 'Collect from each confirmed speaker', items: [
              { key: 'title', text: 'Talk title and two-sentence abstract' },
              { key: 'bio', text: 'Short bio and headshot (with permission to publish)' },
              { key: 'av', text: 'A/V needs: slides, mic, adapters, remote attendance' },
              { key: 'travel', text: 'Travel and arrival time; who meets them' },
              { key: 'recording', text: 'Consent to record and share' },
              { key: 'backup', text: 'A backup speaker or format if someone cancels' },
            ] },
            { type: 'message', id: 'confirmation', label: 'Confirmation message', subject: 'Confirmed — a few details for your talk', body: 'Thank you for agreeing to speak! To finish the program, could you send: a talk title and two-sentence abstract, a short bio and headshot we can publish, your A/V needs, and your travel/arrival plans? Please also let us know whether we may record and share the talk.' },
          ],
        },
      ],
    },
    {
      id: 'sponsorship',
      label: 'Finding sponsors',
      match: (text) => /\b(sponsors?|sponsorships?|sponsoring)\b/.test(text),
      outcome: 'Committed sponsors with agreed tiers and what they receive.',
      communityTerms: ['sponsorship', 'partnerships', 'fundraising', 'business development', 'sales'],
      learning: 'Which kinds of sponsors said yes, at what tier, and what the ask looked like.',
      steps: [
        {
          title: 'Rank prospects before writing to anyone',
          obstacle: 'Cold asks to poorly-matched companies waste the few weeks you have.',
          blocks: () => [
            { type: 'matrix', id: 'prospects', label: 'Prospects — score 1–3', criteria: [
              { key: 'audience', label: 'Wants your audience' },
              { key: 'history', label: 'Has sponsored similar events' },
              { key: 'contact', label: 'You have a warm contact' },
              { key: 'size', label: 'Budget fits a tier' },
            ], rows: 4, rowLabel: 'Company' },
            { type: 'fields', id: 'tiers', label: 'Tiers (what each sponsor gets)', items: [
              { key: 'top', label: 'Top tier — amount and benefits', value: 'Logo on stage, 5-minute talk, recruiting table, attendee list (opt-in only)' },
              { key: 'mid', label: 'Middle tier', value: 'Logo on site and slides, recruiting table' },
              { key: 'inkind', label: 'In-kind (food, prizes, credits)', value: 'Named thanks at opening and closing' },
            ] },
          ],
        },
        {
          title: 'Send a specific ask',
          obstacle: 'Sponsors respond to a clear amount and clear benefits.',
          blocks: (ctx, values, derived) => [
            { type: 'message', id: 'ask', label: `Sponsorship ask${derived.leader ? ` to ${derived.leader}` : ''}`, subject: `Partnering on ${ctx.event || 'our event'}`, body: `Hi — I’m organizing ${ctx.event || '[event]'} for [audience, size]. Teams like yours sponsor events like this to [recruit / reach developers / launch to builders].\n\nOur ${values['tiers.mid'] ? 'middle tier' : '[tier]'} includes ${values['tiers.mid'] || '[benefits]'}. Would ${derived.leader || '[company]'} be open to a 15-minute call next week to see if there’s a fit?` },
            { type: 'checklist', id: 'ask-check', label: 'Before sending', items: [
              { key: 'deck', text: 'One-page sponsor sheet with past numbers attached' },
              { key: 'deadline', text: 'Commitment deadline stated (leave time for invoicing)' },
              { key: 'owner', text: 'One named person follows up' },
            ] },
          ],
        },
      ],
    },
    {
      id: 'idea-validation',
      label: 'Validating an idea',
      match: (text) => /\b(validat\w*|customer discovery|customer interviews?|product[- ]market fit|willingness to pay|is there demand|test (my|the|an?) (business )?idea|business idea|startup idea)\b/.test(text),
      outcome: 'Evidence from real potential customers that supports a decision to proceed, change, or stop.',
      communityTerms: ['customer discovery', 'user research', 'product management', 'entrepreneurship', 'startups', 'market research', 'ux research'],
      learning: 'Who you talked to, the questions that produced real answers, and what you decided.',
      steps: [
        {
          title: 'Name the assumption that would kill the idea',
          obstacle: 'Most ideas fail on one untested assumption, usually about the customer’s problem.',
          blocks: () => [
            { type: 'fields', id: 'assumption', label: 'Validation brief', items: [
              { key: 'who', label: 'Who exactly has the problem', value: '', hint: 'Narrow: “organizers of student hackathons”, not “event planners”.' },
              { key: 'problem', label: 'The problem, in their words', value: '' },
              { key: 'today', label: 'What they do about it today', value: '', hint: 'If the answer is “nothing”, the problem may not hurt enough.' },
              { key: 'risk', label: 'Riskiest assumption', value: 'They have this problem often enough to change what they do today.' },
              { key: 'signal', label: 'What would change your mind', value: 'Fewer than 3 of 5 people describe the problem without being prompted.' },
            ] },
          ],
        },
        {
          title: 'Talk to five people without pitching',
          obstacle: 'Pitching produces polite compliments; asking about past behaviour produces evidence.',
          blocks: (ctx, values) => [
            { type: 'message', id: 'recruit', label: 'Message to find interviewees', subject: 'Could I ask you about how you handle something?', body: `Hi — I’m researching how ${values['assumption.who'] || '[people like you]'} deal with ${values['assumption.problem'] || '[the problem]'}. I’m not selling anything. Could I ask you a few questions for 15 minutes this week?` },
            { type: 'checklist', id: 'questions', label: 'Interview guide — ask about the past, not the future', items: [
              { key: 'last', text: '“Tell me about the last time this happened.”' },
              { key: 'did', text: '“What did you do about it?”' },
              { key: 'hard', text: '“What was the hardest part?”' },
              { key: 'tried', text: '“What have you tried or paid for to fix it?”' },
              { key: 'who', text: '“Who else should I talk to about this?”' },
            ] },
            { type: 'list', id: 'avoid', label: 'Avoid', items: ['“Would you use…?” and “Would you pay for…?” — people are bad at predicting', 'Describing your solution before they describe their problem'] },
          ],
        },
        {
          title: 'Decide: proceed, change, or stop',
          obstacle: 'Evidence only helps if it is turned into a decision.',
          blocks: (ctx, values) => [
            { type: 'fields', id: 'evidence', label: 'What you heard', items: [
              { key: 'count', label: 'How many of the people described the problem unprompted', value: '' },
              { key: 'workaround', label: 'Workarounds or money they already spend', value: '' },
              { key: 'surprise', label: 'What surprised you', value: '' },
            ] },
            { type: 'list', id: 'rule', label: 'Decision rule you set earlier', items: [values['assumption.signal'] || 'Fewer than 3 of 5 describe the problem unprompted → change the customer or the problem before building.'] },
          ],
        },
      ],
    },
    {
      id: 'recruiting',
      label: 'Finding collaborators',
      match: (text) => /\b(co-?founders?|teammates?|volunteers?|collaborators?|recruit\w*|hire|hiring|mentors?|find (a|an|some) (developer|designer|engineer|partner)s?|build (a|my|the) team)\b/.test(text),
      outcome: 'A specific person committed to a defined role.',
      communityTerms: [],
      learning: 'How you described the role and where the people who said yes came from.',
      steps: [
        {
          title: 'Define the role so the right person recognizes themselves',
          obstacle: '“Looking for help” gets no replies; a concrete role with a time commitment does.',
          blocks: (ctx, values) => [
            { type: 'fields', id: 'role', label: 'Role brief', items: [
              { key: 'skills', label: 'Skills needed (comma separated)', value: '', hint: 'Buildspace checks your connections’ profiles for these exact skills.', searchable: true },
              { key: 'own', label: 'What they would own', value: '' },
              { key: 'time', label: 'Time commitment and duration', value: '3–5 hours a week for 6 weeks' },
              { key: 'gain', label: 'What’s in it for them', value: '' },
            ] },
            { type: 'message', id: 'pitch', label: 'Role invitation', subject: `Looking for ${values['role.skills'] || '[role]'} help`, body: `Hi — I’m working on ${ctx.quoted}. I’m looking for someone with ${values['role.skills'] || '[skills]'} to own ${values['role.own'] || '[what they’d own]'}. It’s about ${values['role.time'] || '[time commitment]'}. In return: ${values['role.gain'] || '[what they get]'}. Interested, or know someone who might be?` },
          ],
        },
      ],
    },
    {
      id: 'promotion',
      label: 'Getting people to show up',
      match: (text) => /\b(promot\w*|marketing|get (more )?(attendees|signups|sign-ups|registrations|participants)|attendance|registrations?|signups?|sign-ups?|spread the word|announce\w*)\b/.test(text),
      outcome: 'A target number of the right people registered.',
      communityTerms: ['marketing', 'social media', 'community management', 'communications', 'growth'],
      learning: 'Which channels produced registrations, and the message that worked.',
      steps: [
        {
          title: 'Pick the channels where your people already are',
          obstacle: 'Posting everywhere spreads effort thin; two good channels usually do most of the work.',
          blocks: (ctx) => [
            { type: 'fields', id: 'reach', label: 'Promotion brief', items: [
              { key: 'who', label: 'Exactly who should come', value: '' },
              { key: 'target', label: 'Registration target and date', value: '' },
              { key: 'hook', label: 'Why they’d come (in their terms)', value: '' },
            ] },
            { type: 'matrix', id: 'channels', label: 'Channels — score 1–3', criteria: [
              { key: 'reach', label: 'Reaches the right people' },
              { key: 'trust', label: 'You have an insider' },
              { key: 'effort', label: 'Low effort' },
            ], rows: 4, rowLabel: 'Channel', placeholder: 'e.g. university CS club, local Slack, LinkedIn' },
            { type: 'message', id: 'post', label: 'Announcement draft', subject: `${ctx.event || 'Event'} — registration open`, body: `${ctx.event || '[Event]'} is happening on [date] at [place]. It’s for [who should come]: [why they’d come]. Free / [cost]. Register: [link]. Questions? Reply here.` },
          ],
        },
      ],
    },
    {
      id: 'prototype',
      label: 'Building a first version',
      match: (text) => /\b(prototype|mvp|minimum viable|first version|v1|proof of concept|poc|mock-?up|build (an?|my|the) (app|tool|website|site|product|demo))\b/.test(text),
      outcome: 'Something a real user can try, built with the least effort that answers your biggest question.',
      communityTerms: ['prototyping', 'product design', 'ux design', 'web development', 'no-code', 'figma', 'software engineering', 'product management'],
      learning: 'What the first version included, what was cut, and what the first users did with it.',
      steps: [
        {
          title: 'Define the smallest deliverable',
          obstacle: 'First versions stall when the scope is “the product” instead of one job for one user.',
          blocks: () => [
            { type: 'fields', id: 'scope', label: 'First-deliverable brief', items: [
              { key: 'user', label: 'Who will try it first', value: '' },
              { key: 'job', label: 'The one job it must do', value: '' },
              { key: 'out', label: 'Explicitly out of scope', value: 'Accounts, settings, payments, admin screens' },
              { key: 'done', label: 'Done when', value: 'One real user completes the job without your help.' },
            ] },
            { type: 'matrix', id: 'approach', label: 'Pick the build approach — score 1–3', criteria: [
              { key: 'speed', label: 'Fast to first user' },
              { key: 'learn', label: 'Tests the risky part' },
              { key: 'skills', label: 'Uses your skills' },
            ], rows: 4, rowLabel: 'Approach', defaults: ['Clickable mockup', 'No-code tool', 'Small code build', 'Do it manually for the first users'] },
          ],
        },
        {
          title: 'Put it in front of three users',
          obstacle: 'A build is only progress when someone outside your head uses it.',
          blocks: (ctx, values) => [
            { type: 'message', id: 'tryit', label: 'Invite testers', subject: 'Would you try something for 15 minutes?', body: `Hi — I’ve built an early version of something for ${values['scope.user'] || '[who it’s for]'} that helps with ${values['scope.job'] || '[the job]'}. Could you try it for 15 minutes while I watch? It’s rough on purpose; I want to see where it breaks.` },
            { type: 'checklist', id: 'session', label: 'During each session', items: [
              { key: 'silent', text: 'Give the task, then stay silent while they try' },
              { key: 'stuck', text: 'Note every place they hesitate or ask a question' },
              { key: 'again', text: 'Ask: “Would you use this next time? What would make it worth it?”' },
            ] },
          ],
        },
      ],
    },
    {
      id: 'event-planning',
      label: 'Planning an event',
      match: (text) => /\b(hackathons?|meetups?|conferences?|workshops?|summit|demo day|venue|run of show|catering)\b/.test(text) || (/\bevents?\b/.test(text) && /\b(plan|planning|organi[sz]e|host|hosting|run|running|put on|throw)\b/.test(text)),
      outcome: 'The event happens on the date with every dependency settled.',
      communityTerms: ['event planning', 'events', 'hackathons', 'community organizing', 'operations', 'project management'],
      learning: 'Which dependency blocked progress, and how it was unblocked.',
      steps: [
        {
          title: 'Find the dependency that is blocking everything else',
          obstacle: 'Events stall on one unsettled dependency, usually date and venue.',
          blocks: () => [
            { type: 'checklist', id: 'deps', label: 'Check what is already settled — in the order they block each other', computeFirstOpen: true, items: [
              { key: 'date', short: 'date and venue', text: 'Date and venue confirmed in writing', detail: 'Book 8–12 weeks out; everything else depends on it.' },
              { key: 'budget', short: 'budget', text: 'Budget known (sponsors or funds committed)', detail: 'Decides food, prizes, and travel offers.' },
              { key: 'people', short: 'speakers, judges, or mentors', text: 'Speakers, judges, or mentors confirmed', detail: 'Invite 6–8 weeks out.' },
              { key: 'registration', short: 'registration page', text: 'Registration page live', detail: 'Promotion can’t start without a link.' },
              { key: 'promotion', short: 'promotion', text: 'Promotion running', detail: 'Start 4–6 weeks out.' },
              { key: 'ops', short: 'food, A/V, wifi, and volunteers', text: 'Food, A/V, wifi, and volunteers arranged', detail: 'Lock 2 weeks out.' },
              { key: 'runofshow', short: 'run-of-show', text: 'Run-of-show written and shared', detail: 'Final week.' },
            ] },
          ],
        },
        {
          title: 'Unblock it with one clear ask',
          obstacle: 'Blocked items move when one named person is asked for one decision by one date.',
          blocks: (ctx, values, derived) => [
            { type: 'fields', id: 'unblock', label: `Unblock: ${derived.firstOpen || 'the blocking item'}`, items: [
              { key: 'owner', label: 'Who can decide or provide it', value: '' },
              { key: 'decision', label: 'The exact decision you need', value: '' },
              { key: 'by', label: 'By when', value: '' },
            ] },
            { type: 'message', id: 'unblock-msg', label: 'Message', subject: `Decision needed for ${ctx.event || 'the event'}: ${derived.firstOpen || ''}`.trim(), body: `Hi ${values['unblock.owner'] || '[name]'} — to keep ${ctx.event || 'the event'} on track we need ${values['unblock.decision'] || `a decision on ${derived.firstOpen || '[item]'}`} by ${values['unblock.by'] || '[date]'}. Everything after it (${derived.afterFirstOpen || 'the remaining items'}) is waiting on this. Can you confirm, or tell me who can?` },
          ],
        },
      ],
    },
  ];

  const BANNED = /\b(make a plan|search for help|browse (the )?(directory|community)|stay motivated|you can do it|break it (down )?into smaller steps|keep going)\b/i;

  function classify(text) {
    const value = lower(text);
    if (!value.trim()) return null;
    return PLAYBOOKS.find(playbook => playbook.match(value)) || null;
  }

  function blockText(block) {
    return [block.label, block.subject, block.body,
      ...(block.items || []).map(item => typeof item === 'string' ? item : [item.label, item.text, item.detail, item.value, item.hint].join(' ')),
      ...(block.criteria || []).map(item => item.label)].join(' ');
  }

  // The meaningful-help gate. An intervention must contain an artifact a
  // member can use (a message, a decision aid, a substantive checklist, or a
  // prefilled brief) and must not just echo the objective or give platitudes.
  function isMeaningful(intervention, objective) {
    const reasons = [];
    const blocks = intervention?.blocks || [];
    const objectiveText = lower(objective).trim();
    const actionable = blocks.filter(block => block.type === 'message' || block.type === 'matrix'
      || (block.type === 'checklist' && (block.items || []).length >= 3)
      || (block.type === 'fields' && (block.items || []).length >= 3));
    if (!actionable.length) reasons.push('no usable artifact');
    const text = blocks.map(blockText).join(' ');
    const substantive = objectiveText ? text.split(objectiveText).join('') : text;
    if (substantive.replace(/\s+/g, ' ').trim().length < 200) reasons.push('too little substance beyond the objective');
    if (BANNED.test(text)) reasons.push('generic advice');
    if (blocks.some(block => objectiveText && lower(block.body || block.label).trim() === objectiveText)) reasons.push('restates the objective');
    return { ok: reasons.length === 0, reasons };
  }

  function matrixRows(block, values) {
    const saved = values[`${block.id}.rows`];
    if (Array.isArray(saved) && saved.length) return saved;
    return Array.from({ length: block.rows || 3 }, (_, index) => ({ name: (block.defaults || [])[index] || '', scores: {} }));
  }

  function rankMatrix(block, values) {
    return matrixRows(block, values)
      .filter(row => String(row.name || '').trim())
      .map(row => ({ name: String(row.name).trim(), total: block.criteria.reduce((sum, criterion) => sum + (Number(row.scores?.[criterion.key]) || 0), 0), scored: block.criteria.filter(criterion => Number(row.scores?.[criterion.key]) > 0).length }))
      .sort((a, b) => b.total - a.total);
  }

  // Values that later steps reuse (the top-ranked option, the first unsettled
  // dependency) are derived from earlier work products, never invented.
  function deriveFromValues(playbook, values) {
    const derived = {};
    if (!playbook) return derived;
    playbook.steps.forEach(step => step.blocks(baseContext(''), values, {}).forEach(block => {
      if (block.type === 'matrix') {
        const ranked = rankMatrix(block, values);
        if (ranked.length && ranked[0].scored) derived.leader = derived.leader || ranked[0].name;
      }
      if (block.type === 'checklist' && block.computeFirstOpen) {
        const checked = new Set(values[`${block.id}.checked`] || []);
        const open = block.items.filter(item => !checked.has(item.key));
        derived.firstOpen = open[0] ? (open[0].short || open[0].text) : '';
        derived.afterFirstOpen = open.slice(1, 3).map(item => item.short || item.text).join(', ');
      }
    }));
    return derived;
  }

  // Prefilled field values count as the member's starting values so that
  // generated messages agree with what the brief shows.
  function withDefaults(stepsBlocks, values) {
    const merged = { ...(values || {}) };
    stepsBlocks.forEach(blocksFor => blocksFor(merged).forEach(block => {
      if (block.type !== 'fields') return;
      block.items.forEach(item => {
        const key = `${block.id}.${item.key}`;
        if (merged[key] === undefined && item.value) merged[key] = item.value;
      });
    }));
    return merged;
  }

  function baseContext(objective, projectTitle) {
    const clean = String(objective || '').trim();
    const shortObjective = clean.length > 80 ? `${clean.slice(0, 77)}…` : (clean || 'this');
    // Messages quote the member's own words rather than re-casing them into
    // a sentence they didn't write.
    return { objective: clean, shortObjective: shortObjective.charAt(0).toLowerCase() + shortObjective.slice(1), quoted: `“${shortObjective}”`, event: eventNameFrom(projectTitle) };
  }

  /**
   * Build an Assistance Decision.
   * input: { objective, source: 'task'|'member', projectTitle, state }
   * state (optional, persisted): { playbook, obstacle, step, values, overridden }
   */
  function decide(input = {}) {
    const objective = String(input.objective || '').trim();
    const state = input.state || {};
    const ctx = baseContext(objective, input.projectTitle);
    const classified = state.overridden ? null : (PLAYBOOKS.find(p => p.id === state.playbook) || classify(objective));
    const obstacleKey = state.obstacle && OBSTACLES[state.obstacle] ? state.obstacle : null;
    const generators = [
      ...(classified ? classified.steps.map(step => vals => step.blocks(ctx, vals, {})) : []),
      ...(obstacleKey ? [vals => OBSTACLES[obstacleKey].blocks(ctx, vals, {})] : []),
    ];
    const values = withDefaults(generators, state.values);
    const decision = {
      objective,
      objectiveSource: input.source === 'task' ? 'task' : 'member',
      playbook: classified ? { id: classified.id, label: classified.label } : null,
      outcome: classified ? { text: classified.outcome, inferred: true } : null,
      communityTerms: classified ? classified.communityTerms.slice() : [],
      learning: classified ? classified.learning : 'What you tried and what happened, so the next member starts further ahead.',
      stepIndex: 0,
      stepCount: 0,
      step: null,
      intervention: null,
      clarify: null,
      complete: false,
    };

    if (obstacleKey) {
      const obstacle = OBSTACLES[obstacleKey];
      decision.obstacleKey = obstacleKey;
      decision.step = { title: obstacle.title, obstacle: obstacle.obstacle, inferred: false };
      decision.intervention = { kind: `obstacle:${obstacleKey}`, blocks: obstacle.blocks(ctx, values, deriveFromValues(classified, values)) };
    } else if (classified) {
      decision.stepCount = classified.steps.length;
      const stepIndex = Math.min(Math.max(Number(state.step) || 0, 0), classified.steps.length);
      if (stepIndex >= classified.steps.length) {
        decision.complete = true;
        decision.stepIndex = classified.steps.length;
      } else {
        const step = classified.steps[stepIndex];
        decision.stepIndex = stepIndex;
        decision.step = { title: step.title, obstacle: step.obstacle, inferred: true };
        decision.intervention = { kind: `${classified.id}:${stepIndex}`, blocks: step.blocks(ctx, values, deriveFromValues(classified, values)) };
      }
    }

    if (decision.intervention) {
      const check = isMeaningful(decision.intervention, objective);
      if (!check.ok) { decision.rejected = check.reasons; decision.intervention = null; decision.step = null; }
    }
    if (!decision.intervention && !decision.complete) {
      decision.clarify = {
        question: 'What’s in the way right now?',
        note: classified ? null : 'Buildspace doesn’t have a guide for this kind of objective yet. Pick what’s blocking you and it will prepare something concrete.',
        options: Object.entries(OBSTACLES).map(([key, item]) => ({ key, label: item.label })),
      };
    }
    return decision;
  }

  // ------------------------------------------------------------------
  // Relevance: a community resource is relevant only through the same kind of
  // objective, or several distinctive shared terms in what it is *about*.
  // ------------------------------------------------------------------
  function sharedTerms(objective, text) {
    const target = new Set(distinctiveTerms(text));
    return distinctiveTerms(objective).filter(term => target.has(term));
  }

  function methodRelevance(pkg, objective) {
    const about = `${pkg?.title || ''}. ${pkg?.goal || ''}`;
    const mine = classify(objective);
    const theirs = classify(about);
    if (mine && theirs && mine.id === theirs.id) return { relevant: true, reason: `Also about ${mine.label.toLowerCase()}`, matched: [] };
    if (mine && theirs && mine.id !== theirs.id) return { relevant: false, reason: `About ${theirs.label.toLowerCase()}, not ${mine.label.toLowerCase()}`, matched: [] };
    const matched = sharedTerms(objective, about);
    const needed = Math.min(2, distinctiveTerms(objective).length);
    if (needed && matched.length >= needed) return { relevant: true, reason: `Its goal shares: ${matched.join(', ')}`, matched };
    return { relevant: false, reason: 'No meaningful overlap', matched };
  }

  function personRelevance(person, terms) {
    const fields = [['skills', person?.skills], ['interests', person?.interests]];
    for (const [field, raw] of fields) {
      const entries = (Array.isArray(raw) ? raw : String(raw || '').split(',')).map(item => String(item || '').trim()).filter(Boolean);
      for (const entry of entries) {
        const entryLower = lower(entry);
        const hit = (terms || []).map(lower).find(term => term && (entryLower === term || new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(entryLower)));
        if (hit) return { relevant: true, reason: `Their profile ${field} include “${entry}”`, field, entry };
      }
    }
    return { relevant: false };
  }

  function projectRelevance(project, objective) {
    const about = `${project?.title || ''}. ${project?.description || ''}`;
    const mine = classify(objective);
    const theirs = classify(about);
    if (mine && theirs && mine.id === theirs.id) return { relevant: true, reason: `Also involved ${mine.label.toLowerCase()}` };
    const matched = sharedTerms(objective, about);
    if (matched.length >= 2) return { relevant: true, reason: `Shares: ${matched.join(', ')}` };
    return { relevant: false };
  }

  // Terms the member typed into a "skills needed" field are explicit intent,
  // so they are valid people-search terms even for unfamiliar objectives.
  function searchTerms(decision, values) {
    const typed = Object.entries(values || {})
      .filter(([key]) => /^(need\.skill|role\.skills)$/.test(key))
      .flatMap(([, value]) => String(value || '').split(','))
      .map(item => item.trim().toLowerCase()).filter(item => item.length >= 2);
    return Array.from(new Set([...(decision?.communityTerms || []), ...typed]));
  }

  // ------------------------------------------------------------------
  // Persistence inside the existing task description. The block is readable
  // in the desktop Tasks tab and carries a JSON state line for resuming.
  // ------------------------------------------------------------------
  const START = '── Buildspace working notes ──';
  const END = '── end of working notes ──';

  function parseNotes(description) {
    const text = String(description || '');
    const start = text.indexOf(START);
    const end = text.indexOf(END);
    let base = text;
    let state = null;
    if (start !== -1 && end > start) {
      base = `${text.slice(0, start)}${text.slice(end + END.length)}`;
      const stateLine = text.slice(start, end).split('\n').find(line => line.startsWith('state: '));
      if (stateLine) { try { state = JSON.parse(stateLine.slice(7)); } catch (_) { state = null; } }
    }
    const progress = [];
    base.split('\n').forEach(line => {
      const match = line.match(/^Progress · (\d{4}-\d{2}-\d{2}) · ([^:]+?)(?: \(member-reported\))?: ?(.*)$/);
      if (match) progress.push({ date: match[1], kind: match[2], note: match[3] });
      else if (/^Outcome note: /.test(line)) progress.push({ date: '', kind: 'Note', note: line.slice(14) });
    });
    const purpose = base.split('\n').filter(line => !/^Progress · |^Outcome note: /.test(line)).join('\n').trim();
    return { purpose, base: base.replace(/\n{3,}/g, '\n\n').trim(), state, progress };
  }

  function summarizeValues(values) {
    return Object.entries(values || {}).filter(([key, value]) => !/\.(rows|checked)$/.test(key) && String(value || '').trim())
      .map(([key, value]) => `${key.split('.').pop()}: ${String(value).replace(/\s+/g, ' ').trim()}`);
  }

  function writeNotes(description, state, label) {
    const { base } = parseNotes(description);
    const readable = summarizeValues(state.values);
    (Object.entries(state.values || {}).filter(([key]) => key.endsWith('.rows'))).forEach(([, rows]) => (rows || []).filter(row => row.name).forEach(row => readable.push(`option: ${row.name} (${Object.values(row.scores || {}).reduce((a, b) => a + (Number(b) || 0), 0)} pts)`)));
    const block = [START, label ? `Working on: ${label}` : null, ...readable, `state: ${JSON.stringify(state)}`, END].filter(Boolean).join('\n');
    return `${base ? `${base}\n\n` : ''}${block}`;
  }

  function appendProgress(description, kind, note, date = new Date()) {
    const day = date.toISOString().slice(0, 10);
    const line = `Progress · ${day} · ${kind} (member-reported): ${String(note || '').replace(/\s+/g, ' ').trim()}`;
    const text = String(description || '');
    const start = text.indexOf(START);
    if (start === -1) return `${text.trim() ? `${text.trim()}\n\n` : ''}${line}`;
    return `${text.slice(0, start).trimEnd()}\n${line}\n\n${text.slice(start)}`.replace(/^\n+/, '');
  }

  function briefText(decision, values) {
    const out = [decision.objective, decision.step ? `Next move: ${decision.step.title}` : ''];
    (decision.intervention?.blocks || []).forEach(block => {
      out.push('', block.label || '');
      if (block.type === 'fields') block.items.forEach(item => out.push(`${item.label}: ${values[`${block.id}.${item.key}`] ?? item.value ?? ''}`));
      if (block.type === 'checklist') { const checked = new Set(values[`${block.id}.checked`] || []); block.items.forEach(item => out.push(`[${checked.has(item.key) ? 'x' : ' '}] ${item.text}`)); }
      if (block.type === 'list') block.items.forEach(item => out.push(`- ${item}`));
      if (block.type === 'matrix') rankMatrix(block, values).forEach(row => out.push(`${row.name}: ${row.total}`));
      if (block.type === 'message') out.push(values[`${block.id}.body`] || block.body);
    });
    return out.filter(line => line != null).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  // Whether a word says nothing about what the work is (Home's idea search
  // uses the same list).
  const isGenericWord = (word) => GENERIC.has(lower(word));

  const api = { isGenericWord, decide, classify, isMeaningful, methodRelevance, personRelevance, projectRelevance, searchTerms, parseNotes, writeNotes, appendProgress, rankMatrix, matrixRows, briefText, distinctiveTerms, eventNameFrom, PLAYBOOKS, OBSTACLES };
  window.AssistanceEngine = api;
  window.AssistanceInterventionsTesting = api;
})();
