// Shared, channel-truthful contact helpers for owner-reviewed interest flows.

export function createNativeEmailDraft({ email, recipientName, subject, body }) {
  const recipient = String(email || '').trim();
  return {
    email: recipient,
    subject,
    body,
    href: `mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
    recipientName: recipientName || 'there',
  };
}

export function recordFollowupBestEffort(startRecording, onError = console.error) {
  try {
    void startRecording().catch(onError);
  } catch (error) {
    onError(error);
  }
}

export function summarizeFollowups(followups = []) {
  const byChannel = new Map();
  followups.forEach(followup => {
    if (!['message', 'email'].includes(followup.channel)) return;
    const current = byChannel.get(followup.channel);
    if (!current) {
      byChannel.set(followup.channel, { channel: followup.channel, count: 1, latest: followup.initiated_at });
      return;
    }
    current.count += 1;
    if (new Date(followup.initiated_at) > new Date(current.latest)) current.latest = followup.initiated_at;
  });
  return ['message', 'email'].flatMap(channel => byChannel.get(channel) || []);
}
