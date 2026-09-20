const fs = require('fs');
const assert = require('assert');

const migration = fs.readFileSync('supabase/sql/migrations/20260920_theme_participation_v1.sql', 'utf8');
const rpc = fs.readFileSync('supabase/sql/nearify_between_intelligence.sql', 'utf8');
const confirm = fs.readFileSync('supabase/sql/functions/confirm_theme_participation.sql', 'utf8');
const stop = fs.readFileSync('supabase/sql/functions/stop_theme_participation.sql', 'utf8');
const discovery = fs.readFileSync('assets/js/theme-discovery.js', 'utf8');
const panel = fs.readFileSync('assets/js/node-panel.js', 'utf8');
const dashboardPane = fs.readFileSync('assets/js/dashboardPane.js', 'utf8');
const mobileNav = fs.readFileSync('assets/js/mobile-nav.js', 'utf8');
const index = fs.readFileSync('index.html', 'utf8');

for (const value of ['participation_confirmed_at', 'participation_expires_at', "'participating'", "interval '30 days'"]) {
  assert(migration.includes(value), `migration missing ${value}`);
}
assert(migration.includes("v_theme_expires_at < v_expires_at"), 'confirmation must cap at theme expiry');
assert(confirm.includes('auth.uid()') && confirm.includes('now()'), 'confirmation must use server auth/time');
assert(stop.includes("engagement_level = 'interested'") && stop.includes('participation_confirmed_at = NULL'), 'stop must restore interested and clear timestamps');
assert(rpc.includes("'participating_count'") && rpc.includes("'participating_nearify_user_ids'"), 'RPC must expose additive participation fields');
assert(/tp\.engagement_level\s*=\s*'participating'/.test(rpc) && rpc.includes('tp.participation_expires_at > now()'), 'RPC must require current explicit participation');
assert(discovery.includes("rpc('confirm_theme_participation'") && discovery.includes("rpc('stop_theme_participation'"), 'UI must use server RPCs');
assert(panel.includes("rpc('confirm_theme_participation'") && panel.includes("rpc('stop_theme_participation'"), 'theme panel must use server RPCs');
assert(dashboardPane.includes("selectContext?.('theme'") && dashboardPane.includes('isThemeLens: true'), 'theme search must preserve context and open canonical lens');
assert(dashboardPane.includes("from('theme_circles')"), 'theme search must load full lens data');
assert(index.includes('id="mob-tab-themes"'), 'mobile navigation must expose Themes');
assert(mobileNav.includes("themes:") && mobileNav.includes('openThemeDiscoveryModal'), 'mobile Themes tab must reuse discovery');
assert(discovery.includes('isThemeLens: true') && discovery.includes('openNodePanel'), 'discovery cards must open canonical theme lens');
assert(discovery.includes("I'm interested") && discovery.includes("I'm participating"), 'UI copy missing');
console.log('theme participation V1 static checks passed');
