// Synthetic authenticated sessions against the real Home UI. PostgreSQL
// policies are exercised independently by hpe-private-consent-db.sql.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { appHarness } from './helpers/app-harness.mjs';

const app = await appHarness();
const require = createRequire(import.meta.url);
const run = app.evaluate;
const pilot = 'document.querySelector("[data-pilot-control]")';
const join = 'document.querySelector("[data-pilot-join]")';
const leave = 'document.querySelector("[data-pilot-leave]")';
const suggestion = 'document.querySelector("[data-home=join] a")';
try {
  for (const width of [390, 1280]) {
    await app.load(width, 844);
    await app.wait(`${pilot}?.hidden`, 'disabled by default');
    await run(`(() => {
      window.AppNav.go('home');
      window.StartDailyDigest.inboundAttention = () => [];
      window.StartDailyDigest.homeSuggestions = () => ({status:'ready', joinIn:[], community:{projects:[],opportunities:[],skills:[]}});
      window.dispatchEvent(new CustomEvent('total-unread-messages-updated',{detail:{count:0}}));
      window.__account = 'auth-me';
      window.__consents = new Map();
      window.__accountProfile = {...window.currentUserProfile, user_id:window.__account};
      window.currentUserProfile = window.__accountProfile;
      const client = window.supabase;
      const from = client.from.bind(client);
      client.auth.getUser = async () => ({data:{user:{id:window.__account}}});
      client.from = table => {
        if (table === 'hpe_participation_consent') return {
          select: () => ({eq: (_, id) => ({maybeSingle: async () => {
            const result = {data:window.__consents.get(id) || null};
            if (window.__hold) await new Promise(resolve => { window.__release = resolve; });
            return result;
          }})}),
          upsert: async (row, options) => {
            if (row.user_id !== window.__account || options.ignoreDuplicates !== true) throw Error('Invalid consent write');
            window.__consents.set(row.user_id, row);
            return {};
          },
          delete: () => ({eq: async (_, id) => {
            if (id !== window.__account) throw Error('Invalid withdrawal');
            window.__consents.delete(id);
            return {};
          }})
        };
        return from(table);
      };
      const fetch = window.fetch.bind(window);
      window.fetch = (url, options) => {
        if (url !== '/data/hpe-published-opportunities.json') return fetch(url, options);
        if (options.credentials !== 'omit') throw Error('Inventory request sent credentials');
        return Promise.resolve({ok:true,json:async()=>({schemaVersion:1,opportunities:
          ['one', 'two'].map(pathwayId => ({
            pathwayId,status:'published',title:'Fixture '+pathwayId,organization:'Fixture provider',
            reviewedAt:new Date().toISOString(),deadline:new Date(Date.now()+3600000).toISOString(),
            sourceUrl:'https://example.org/volunteer',eligibility:'adult_public',
            geographicRelevance:'charleston-sc',participationType:'contribution'
          }))})});
      };
      window.HPEParticipationPilot = true;
      window.HPEPersistentConsent = true;
      window.HomeView.show();
      return true;
    })()`);
    await app.wait(`${join}?.disabled`, 'explicit consent required');
    assert.equal(await run(`!!${suggestion}`), false);
    await run(`${pilot}.querySelector('summary').click();${pilot}.querySelector('input').click();${join}.focus();${join}.click();true`);
    await app.wait(`${leave} && ${suggestion}`, 'consent and suggestion');
    assert.equal(await run(`document.activeElement === ${leave}`), true);
    assert.equal(await run(`${suggestion}.rel === 'noopener noreferrer' && ${suggestion}.target === '_blank'`), true);
    await run(`document.querySelector('[data-external-skip]').click();true`);
    await app.wait(`document.querySelector('[data-home=join] strong')?.textContent==='Fixture two'`, 'independent pathway dismissal');
    assert.equal(await run('document.documentElement.scrollWidth <= innerWidth'), true);
    await run(readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8') + ';true');
    assert.deepEqual(await run(`axe.run(${pilot}, {runOnly:['wcag2a','wcag2aa','wcag21aa']}).then(result => result.violations.map(v=>v.id))`), []);
    await run(`${leave}.click();true`);
    await app.wait(`${join} && !${suggestion}`, 'withdrawal restores ordinary Home');
    assert.equal(await run('window.__consents.size'), 0);

    // A delayed read for A resolves after B has loaded, with the same profile ID.
    await run(`window.__consents.set('auth-me',{adult_confirmed:true,scope:'charleston-sc',consent_version:1});window.__hold=true;window.HomeView.clear();window.HomeView.show();true`);
    await app.wait('window.__release', 'in-flight account A consent read');
    await run(`window.__hold=false;window.__account='auth-other';window.currentUserProfile={...window.__accountProfile,user_id:window.__account};window.HomeView.show();true`);
    await app.wait(`${join}`, 'account B sees its own consent prompt');
    await run('window.__release();true');
    await app.sleep(150);
    assert.equal(await run(`!!${leave} || !!${suggestion}`), false);
    await run('window.HomeView.clear();true');
    assert.equal(await run(`!!${pilot}`), false);
    console.log(`HPE consent, withdrawal, isolation and accessibility passed at ${width}px`);
  }
} finally {
  await app.close();
}
