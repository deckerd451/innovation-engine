import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { appHarness } from './helpers/app-harness.mjs';

const app = await appHarness();
const run = app.evaluate;
const require = createRequire(import.meta.url);
const panel = 'document.querySelector(".home-collaboration")';
const click = text => run(`Array.from(${panel}.querySelectorAll('button')).find(b=>b.textContent===${JSON.stringify(text)}).click();true`);
const waitText = text => app.wait(`${panel}.textContent.includes(${JSON.stringify(text)})`, text);
async function open() {
  await app.wait(`${panel} && !${panel}.hidden`, 'eligible collaboration control');
  await run(`${panel}.querySelector('summary').click();true`);
}
try {
  for (const width of [390, 1280]) {
    await app.load(width, 844);
    assert.equal(await run(`!!${panel}`), false, 'experimental pilot off on normal entry');
    await run(`(async () => {
      const client = window.supabase;
      const from = client.from.bind(client);
      const rpc = client.rpc.bind(client);
      const profiles = {
        a: {...window.currentUserProfile, user_id:'a', skills:['Project management']},
        b: {...window.currentUserProfile, user_id:'b', skills:['Gardening']}
      };
      const opted = new Set(['b']);
      let invite;
      window.__test = { actor:'a', messages:[], projects:0 };
      window.__test.switch = actor => {
        window.__test.actor = actor;
        window.currentUserProfile = profiles[actor];
        window.HomeView.show();
      };
      client.auth.getUser = async () => ({data:{user:{id:window.__test.actor}}});
      client.from = table => table === 'hpoe_opt_in' ? {
        select: () => ({eq: (_, id) => ({maybeSingle: async () => ({data:opted.has(id) ? {user_id:id} : null})})}),
        insert: async row => { opted.add(row.user_id); return {}; },
        delete: () => ({ eq: async (_, id) => { opted.delete(id); invite = undefined; return {}; } })
      } : from(table);
      client.rpc = async (name, args) => {
        if (!name.startsWith('hpoe_')) return rpc(name, args);
        if (args.p_actor !== window.__test.actor) return {error:Error('Wrong account')};
        if (name === 'hpoe_status') return {data:[{
          eligible:true,enrolled:opted.has(args.p_actor),
          pending:args.p_actor==='b' && invite?.phase==='invited'
        }]};
        if (name === 'hpoe_candidates') return {data:[{profile_id:'peer-b',name:'Synthetic B',skills:['Gardening']}]};
        if (name === 'hpoe_invite') {
          if (Object.keys(args).sort().join() !== 'p_actor,p_profile_id,p_recipe' || args.p_recipe !== 'garden') {
            return {error:Error('Unexpected invitation payload')};
          }
          invite = {id:'test-invite',recipe:'garden',phase:'invited',confirmed:new Set()};
          return {};
        }
        if (name === 'hpoe_my_collaborations') {
          const rows = window.__test.history ? Array.from({length:21}, (_, i) => ({
            id:'history-'+i, recipe:'workshop', phase:'declined'
          })) : [];
          if (invite) rows.push({
            id:invite.id, recipe:invite.recipe, phase:invite.phase,
            incoming:args.p_actor==='b', own_confirmed:invite.confirmed.has(args.p_actor),
            jointly_confirmed:invite.confirmed.size===2,
            peer_profile_id:invite.phase==='invited' ? null : 'peer'
          });
          return {data:rows.slice(args.p_offset, args.p_offset+21)};
        }
        if (name === 'hpoe_advance') {
          switch (args.p_action) {
            case 'accept': invite.phase='accepted'; break;
            case 'start': invite.phase='started'; break;
            case 'confirm': invite.confirmed.add(args.p_actor); break;
          }
          return {};
        }
        throw Error('Unknown collaboration API');
      };
      window.openMessageForUser = async id => { window.__test.messages.push(id); };
      const {showEnhancedProjectCreation} = await import('/assets/js/enhanced-project-creation.js?v=email-lock-20261029-hpoe');
      window.showEnhancedProjectCreation = async draft => {
        window.__test.projects++;
        window.__test.draft = draft;
        return showEnhancedProjectCreation(draft);
      };
      window.HPOECollaborationPilot = true;
      window.__test.switch('a');
      return true;
    })()`);
    await open();
    await waitText('Opt in to collaboration');
    assert.equal(await run(`${panel}.querySelector('a').href`), 'https://www.tuw.org/211');
    await click('Opt in to collaboration');
    await waitText('What would you like to explore?');
    await run(`${panel}.querySelector('input').value='Explore a community garden. Private fixture draft.';true`);
    await click('Explore idea');
    await waitText('Proposal: Explore a small community garden');
    await click('Invite Synthetic B to explore');
    await waitText('Invitation sent');

    await run("window.__test.switch('b');true");
    await open();
    await waitText('Accept invitation');
    assert.equal(await run(`${panel}.querySelector('summary').textContent`), 'Review collaboration invitation');
    assert.equal(await run(`${panel}.textContent.includes('Private fixture draft')`), false);
    assert.equal(await run(`${panel}.textContent.includes('Open your conversation')`), false);
    await click('Accept invitation');
    await waitText('Both members agreed');
    await click('Open your conversation');
    assert.equal(await run('window.__test.messages.length'), 1);
    await click('Record that we started');
    await waitText('Confirm we completed the first action');
    await click('Open project creation');
    assert.equal(await run('window.__test.projects'), 1);
    await app.wait("document.querySelector('#enhanced-project-description')?.value.includes('one-bed trial')", 'editable project draft');
    assert.match(await run('window.__test.draft.description'), /one-bed trial/);
    assert.ok(!(await run('JSON.stringify(window.__test.draft)')).includes('Private fixture draft'));
    await run('window.closeEnhancedProjectModal();true');
    await click('Confirm we completed the first action');
    await waitText('You confirmed the first action');

    await run("window.__test.switch('a');true");
    await open();
    await waitText('Confirm we completed the first action');
    await click('Confirm we completed the first action');
    await waitText('Both members confirmed the first action');
    await run(`window.__test.history=true;${panel}.open=false;true`);
    await app.sleep(100);
    await open();
    await waitText('More collaborations');
    assert.equal(await run(`${panel}.textContent.includes('Both members confirmed the first action')`), false);
    await click('More collaborations');
    await waitText('Both members confirmed the first action');
    await waitText('Previous collaborations');
    await run(fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8') + ';true');
    const violations = await run(`axe.run(${panel}, {runOnly:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}).then(r=>r.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})))`);
    assert.deepEqual(violations, []);
    assert.ok(await run('document.documentElement.scrollWidth <= innerWidth'));
    await click('Leave collaboration pilot and delete my records');
    await waitText('Opt in to collaboration');
    console.log(`HPOE collaboration, opt-out and accessibility passed at ${width}px`);
  }
} finally {
  await app.close();
}
