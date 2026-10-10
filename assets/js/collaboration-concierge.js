// Collaboration Concierge — extends the existing connection request with a
// small, consent-aware collaboration context. It reuses connections for
// approval and realtime messaging for the actual conversation.

const SCHEDULE_OPTIONS = [
  { value: 'today', label: 'Today' },
  { value: 'this_week', label: 'This week' },
  { value: 'suggest_time', label: "I'll suggest a time" },
];

function db() { return window.supabase || null; }
function me() { return window.currentUserProfile?.id || null; }

async function sendInvite(recipientId, recipientName, reason) {
  const result = await window.sendConnectionRequest?.(
    recipientId,
    recipientName,
    'collaborator',
    {
      type: 'collaboration_concierge',
      reason,
      prompt: 'Compare what you are building and trade one useful resource.',
      outcome: 'Leave with one next step you can each take.',
    },
  );
  return result || { success: false, error: { message: 'Connection requests are still loading.' } };
}

async function respond(connectionId, status, schedule = null) {
  const client = db();
  if (!client || !connectionId || !me()) return { success: false, error: { message: 'Collaboration is not ready.' } };
  const patch = {
    context_status: status,
    context_schedule: schedule || null,
  };
  if (status === 'completed') {
    patch.context_completed_at = new Date().toISOString();
    patch.context_completed_by = me();
  }
  const { data, error } = await client
    .from('connections')
    .update(patch)
    .eq('id', connectionId)
    .select('id, from_user_id, to_user_id, context_status, context_schedule, context_prompt, context_reason, context_outcome')
    .maybeSingle();
  if (error || !data) return { success: false, error: error || { message: 'The collaboration response was not saved.' } };

  if (status === 'accepted' && data.from_user_id && window.sendDirectMessage) {
    await window.sendDirectMessage(
      data.from_user_id,
      `I accepted our Buildspace collaboration invitation. ${data.context_prompt || 'Let’s compare what we are building and trade one useful resource.'}`,
      { collaboration: { connectionId, targetCommunityUserId: data.from_user_id } },
    );
  }
  return { success: true, connection: data };
}

async function setSchedule(connectionId, schedule) {
  const client = db();
  if (!client || !connectionId || !me()) return { success: false };
  const { data, error } = await client.from('connections')
    .update({ context_schedule: schedule })
    .eq('id', connectionId)
    .select('id, context_schedule')
    .maybeSingle();
  return { success: !error && !!data, connection: data, error };
}

async function recordOutcome(connectionId, outcome) {
  const client = db();
  if (!client || !connectionId || !me() || !outcome) return { success: false };
  const { data, error } = await client.from('connections')
    .update({ context_outcome: outcome })
    .eq('id', connectionId)
    .select('id, context_outcome')
    .maybeSingle();
  if (!error && data) window.Telemetry?.logEvent('collaboration_outcome_recorded', { entityType: 'connection', entityId: connectionId });
  return { success: !error && !!data, connection: data, error };
}

function scheduleOptions() { return SCHEDULE_OPTIONS.slice(); }

window.CollaborationConcierge = { sendInvite, respond, setSchedule, recordOutcome, accept: connectionId => respond(connectionId, 'accepted'), scheduleOptions };
window.addEventListener('profile-loaded', () => { window.CollaborationConcierge.ready = true; });
