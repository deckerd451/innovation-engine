// Deterministic, honest cold-start interventions. These are reusable work
// products, not claims that Buildspace understands arbitrary objectives.
(function () {
  'use strict';
  if (window.AssistanceInterventions) return;
  function interventionFor(objective) {
    const text = String(objective || '').trim();
    const lower = text.toLowerCase();
    if (/speaker|speakers/.test(lower)) return { type: 'speaker-selection', title: 'A practical speaker shortlist starter', summary: 'Use this to make the first selection decision without inventing candidates.', actionLabel: 'Check connected people', target: 'people', fields: [['Selection criteria', 'Topic fit; audience value; availability; format; fee or travel limits'], ['Shortlist', 'Candidate / why they fit / contact path / status'], ['Outreach message', 'Hi — we are planning [event] for [audience] on [date]. Would you be open to speaking about [topic]? If so, could you share your format, availability, and fee expectations?']] };
    if (/validate|customer|demand|business idea|interview/.test(lower)) return { type: 'validation', title: 'A small validation brief', summary: 'Turn the idea into one assumption and a testable signal before building.', actionLabel: 'Review relevant methods', target: 'methods', fields: [['Assumption', 'The customer has this problem and considers it important'], ['Evidence to collect', 'Three repeated descriptions of the problem and one sign of willingness to try or pay'], ['Next test', 'Ask five people an open question about the problem before showing a solution']] };
    if (/event|conference|hackathon|workshop/.test(lower)) return { type: 'event-planning', title: 'A dependency check for the event', summary: 'Identify the one unresolved dependency that could block the event.', actionLabel: 'Review related help', target: 'methods', fields: [['Blocking dependency', 'Venue / people / schedule / budget / promotion'], ['Decision owner', 'Who can decide or provide the missing information?'], ['Next message', 'What specific answer do you need, and by when?']] };
    return { type: 'decision-brief', title: 'A useful first decision brief', summary: 'Make the next uncertainty explicit, then choose a reversible test.', actionLabel: 'Review available help', target: 'methods', fields: [['Desired result', text || 'What should be different when this is done?'], ['Main uncertainty', 'What do you need to learn before taking a larger step?'], ['Smallest test', 'What can you try this week that would produce evidence?']] };
  }
  function render(intervention, esc) {
    const escape = esc || (value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[ch])));
    return `<section class="ai-work-product"><h2>${escape(intervention.title)}</h2><p>${escape(intervention.summary)}</p>${intervention.fields.map(([label, value]) => `<label><span>${escape(label)}</span><textarea rows="2" data-ai-field>${escape(value)}</textarea></label>`).join('')}<button type="button" class="ai-copy-product" data-ai-copy>Copy this brief</button></section>`;
  }
  window.AssistanceInterventions = { interventionFor, render };
  window.AssistanceInterventionsTesting = { interventionFor };
})();
