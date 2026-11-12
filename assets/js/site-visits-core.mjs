// Aggregate first-party visits; no names, URLs, referrers, IPs or user agents.
export const BROWSER_KEY = 'ie_visit_browser_v1';
const SESSION_KEY = 'ie_visit_session_v1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function browserId(storage, uuid) {
  let id = storage.getItem(BROWSER_KEY);
  if (!UUID.test(id || '')) { id = uuid(); storage.setItem(BROWSER_KEY, id); }
  return id;
}
export function visitIdentity(storage, uuid, now, actor = null) {
  const browser = browserId(storage, uuid);
  let session;
  try { session = JSON.parse(storage.getItem(SESSION_KEY)); } catch { /* renew */ }
  if (!session || !UUID.test(session.id || '') || !Number.isFinite(session.at) || now - session.at >= 30 * 60 * 1000 || now < session.at || (session.actor && session.actor !== actor)) {
    session = { id: uuid(), at: now, actor };
  }
  session.at = now;
  session.actor = actor;
  storage.setItem(SESSION_KEY, JSON.stringify(session));
  return { p_session_id: session.id, p_browser_id: browser };
}
