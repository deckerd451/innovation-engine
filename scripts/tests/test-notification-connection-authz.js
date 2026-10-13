#!/usr/bin/env node
// Static guard for the notification/connection authorization boundary.
// The database tests (scripts/tests/run-authz-db.sh) prove the boundary; this
// keeps browser code from drifting back to patterns the boundary now refuses.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const root = path.resolve(__dirname, '..', '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const browserFiles = execSync('git ls-files "*.js" "*.html"', { cwd: root }).toString().trim().split('\n')
  .filter(file => file && !file.startsWith('scripts/') && !file.startsWith('supabase/'));

function writesTo(table) {
  const found = [];
  for (const file of browserFiles) {
    const lines = read(file).split('\n');
    lines.forEach((line, index) => {
      if (!new RegExp(`from\\(\\s*['"\`]${table}['"\`]\\s*\\)`).test(line)) return;
      const window = lines.slice(index, index + 14).join('\n');
      const match = window.match(/\.(insert|upsert|update|delete)\(/);
      if (match) found.push({ file, line: index + 1, op: match[1], window: window.slice(window.indexOf(match[0])) });
    });
  }
  return found;
}

// 1. Browser code never creates notifications.
const notificationWrites = writesTo('notifications');
const creates = notificationWrites.filter(write => write.op === 'insert' || write.op === 'upsert');
assert.deepEqual(creates.map(write => `${write.file}:${write.line}`), [], 'browser code inserts notifications directly');
for (const write of notificationWrites.filter(item => item.op === 'update')) {
  const payload = write.window.slice(0, write.window.indexOf(')') + 1);
  assert.match(payload, /^\.update\(\{\s*read:\s*(true|false)\s*\}\)/, `${write.file}:${write.line} updates notification columns other than read`);
}
for (const file of browserFiles) {
  assert.doesNotMatch(read(file), /rpc\(\s*['"]create_notification['"]/, `${file} calls create_notification`);
}
assert.doesNotMatch(read('assets/js/comprehensive-fixes.js'), /createNotification/, 'comprehensive-fixes still has a notification writer');
console.log('✅ Browser: no direct notification inserts or create_notification calls; updates only mark read');

// 2. Browser code only ever creates pending connection requests.
for (const write of writesTo('connections').filter(item => item.op === 'insert')) {
  const payload = write.window.slice(0, 600);
  const status = payload.match(/status:\s*['"](\w+)['"]/);
  if (status) assert.equal(status[1], 'pending', `${write.file}:${write.line} inserts a ${status[1]} connection`);
}
const connections = read('assets/js/connections.js');
assert.match(connections, /status: isSender \? "canceled" : "rejected"/, 'cancel fallback must not have the recipient cancel');
console.log('✅ Browser: connection inserts are pending requests; recipients decline rather than cancel');

// 3. The migration and its rollback cover each piece.
const migration = read('supabase/sql/migrations/20261013_notification_connection_authz.sql');
for (const required of [
  /REVOKE ALL ON FUNCTION public\.create_notification\(uuid, text, text, text, text, jsonb\) FROM PUBLIC, anon, authenticated;/,
  /ALTER FUNCTION public\.create_notification\(uuid, text, text, text, text, jsonb\) SET search_path = public, pg_temp;/,
  /DROP POLICY IF EXISTS "System can create notifications" ON public\.notifications;/,
  /GRANT UPDATE \(read\) ON public\.notifications TO authenticated;/,
  /WITH CHECK \(user_id IN \(SELECT c\.id FROM public\.community c WHERE c\.user_id = auth\.uid\(\)\)\)/,
  /CREATE TRIGGER notify_project_request/,
  /CREATE TRIGGER notify_organization_join_request/,
  /CREATE TRIGGER enforce_connection_authorization\s+BEFORE INSERT OR UPDATE ON public\.connections/,
]) assert.match(migration, required);
assert.doesNotMatch(migration, /CREATE POLICY[^;]*ON public\.notifications FOR INSERT/, 'migration must not add a member INSERT policy');
const rollback = read('supabase/sql/rollback/20261013_notification_connection_authz_rollback.sql');
assert.match(rollback, /DROP TRIGGER IF EXISTS enforce_connection_authorization/);
assert.match(rollback, /CREATE POLICY "System can create notifications"/);
console.log('✅ Migration revokes, pins, replaces policies and adds triggers; rollback reverses them');

console.log('notification/connection authorization static checks passed');
