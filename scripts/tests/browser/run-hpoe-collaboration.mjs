import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { appHarness } from './helpers/app-harness.mjs';

const app = await appHarness();
const run = app.evaluate;
const require = createRequire(import.meta.url);
const panel = 'document.querySelector(".home-collaboration")';
const click = text => run(`Array.from(${panel}.querySelectorAll('button')).find(b=>b.textContent===${JSON.stringify(text)}).click();true`);
const clickIdea = text => run(`Array.from(document.querySelectorAll('.home-possibility button')).find(b=>b.textContent===${JSON.stringify(text)}).click();true`);
const waitText = text => app.wait(`${panel}.textContent.includes(${JSON.stringify(text)})`, text);
async function open() {
  await app.wait(`${panel} && !${panel}.hidden`, 'eligible collaboration control');
  await run(`${panel}.querySelector('summary').click();true`);
}
try {
  for (const width of [390, 1280]) {
    await app.load(width, 844);
    await app.send('Emulation.setFocusEmulationEnabled', { enabled: true });
    await run(fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8') + ';true');
    assert.equal(await run('window.HPOECollaborationPilot === true && window.HPOECompositionalPilot !== true && window.HPEResearchPilot !== true'), true);
    await app.wait(`${panel}?.hidden`, 'collaboration hidden without audience authorization');
    await run(`(async () => {
      const client = window.supabase;
      const from = client.from.bind(client);
      const rpc = client.rpc.bind(client);
      const profiles = {
        a: {...window.currentUserProfile, user_id:'a', skills:['Project management']},
        b: {...window.currentUserProfile, user_id:'b', skills:['Gardening']},
        c: {...window.currentUserProfile, user_id:'c', skills:['Gardening']}
      };
      const opted = new Set(['b']);
      let invite;
      window.__test = { actor:'a', messages:[], projects:0 };
      client.__db.community.push({id:'garden-person',user_id:'auth-garden',name:'Synthetic Gardener',skills:['Horticulture'],interests:[]});
      client.__db.organizations = [{id:'garden-org',name:'Community Garden Network',description:'Local garden growing space'}];
      client.__db.opportunities = [{id:'garden-opp',title:'Garden volunteer shift',description:'Help with gardening',status:'open',is_public:true}];
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
          eligible:args.p_actor!=='c',enrolled:opted.has(args.p_actor),
          pending:args.p_actor==='b' && invite?.phase==='invited'
        }]};
        if (name === 'hpoe_candidates') {
          window.__test.lookups = (window.__test.lookups || 0)+1;
          return {data:window.__test.noMatch ? [] : [{profile_id:'peer-b',name:'Synthetic B',skills:['Gardening']}]};
        }
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
      window.__test.switch('c');
      return true;
    })()`);
    assert.equal(await run(`${panel}.hidden`), true, 'account outside audience cannot see invitation controls');
    await run("window.__test.switch('a');true");
    await open();
    await waitText('Opt in to collaboration');
    assert.equal(await run(`${panel}.querySelector('a').href`), 'https://www.tuw.org/211');
    await click('Opt in to collaboration');
    await waitText('Use the prompt above');
    assert.equal(await run("document.querySelectorAll('.home-idea input:not([type=checkbox])').length"), 1);
    await run("window.__test.noMatch=true;document.querySelector('[data-idea-example]').click();true");
    assert.equal(await run("document.activeElement.id"), 'home-idea-input');
    await app.send('Input.dispatchKeyEvent', {
      type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r', unmodifiedText: '\r'
    });
    await app.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await app.wait("document.querySelector('.home-possibility')?.textContent.includes('Starter plan')", 'starter plan without a match');
    assert.equal(await run("document.querySelector('.home-possibility').textContent.includes('Spend 10 minutes')"), true);
    assert.equal(await run("Array.from(document.querySelectorAll('.home-possibility button')).some(b=>b.textContent==='Find people with gardening skills')"), true);
    await clickIdea('Find people with gardening skills');
    await app.wait("['Matches for','No matches for','couldn’t be done'].some(text=>document.querySelector('.home-idea-results')?.textContent.includes(text))", 'targeted people search result');
    const gardenerFound = await run("Boolean(document.querySelector('.home-idea-results [data-idea-person=\"garden-person\"]'))");
    if (!gardenerFound) console.error('Targeted gardener discovery diagnostics:', await run(`JSON.stringify({results:document.querySelector('.home-idea-results')?.textContent,profile:{id:window.currentUserProfile?.id,user_id:window.currentUserProfile?.user_id},fixture:window.supabase.__db.community.filter(row=>row.id==='garden-person'),errors:window.__hpoeErrors})`), app.errors);
    assert.equal(gardenerFound, true, 'targeted gardener discovery returns the seeded profile');
    assert.equal(await run("document.querySelector('.home-idea-results [data-idea-person=\"garden-person\"]').dataset.name"),
      'Synthetic G.', 'targeted discovery retains the existing nonconnection name privacy rule');
    assert.equal(await run("document.querySelector('.home-idea-results').textContent.includes('Organizations')"), false,
      'people discovery filters out organizations and opportunities');
    await run("document.querySelector('#home-idea-input').value='Explore a community garden';document.querySelector('.home-idea-form').requestSubmit();true");
    await app.wait("document.querySelector('.home-possibility')?.textContent.includes('Starter plan')", 'garden starter plan restored');
    assert.equal(await run("document.querySelector('.home-possibility').textContent.includes('Gather & Garden')"), true,
      'recently reviewed, topic-matched external provider is discoverable');
    await run("document.querySelector('.home-possibility .home-action').click();true");
    await app.wait("document.querySelector('#enhanced-project-description')?.value.includes('Roles to confirm')", 'editable fallback draft');
    assert.deepEqual(await run(`axe.run(document.querySelector('#enhanced-project-modal'), {runOnly:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}).then(r=>r.violations.map(v=>v.id))`), [],
      'prefilled project dialog meets the automated accessibility checks');
    assert.equal(await run("!document.querySelector('#enhanced-project-modal .template-grid') && !document.querySelector('#enhanced-project-modal button[onclick=\\\"goBackToTemplates()\\\"]')"), true,
      'a direct draft does not expose unrelated templates or a route back to them');
    assert.equal(await run("Array.from(document.querySelectorAll('#selected-skills .skill-tag')).map(el=>el.dataset.skill).join(',')"),
      'Gardening,Project coordination', 'only capabilities relevant to this idea are prefilled');
    await run(`window.__test.testSkill='<img src=x onerror=window.__test.xss=1>';document.querySelector('#skill-input').value=window.__test.testSkill;window.addCustomSkill();true`);
    assert.equal(await run("document.querySelectorAll('#selected-skills img').length===0 && document.querySelector('#selected-skills').textContent.includes(window.__test.testSkill) && !window.__test.xss"), true,
      'member-entered capability text is rendered as text, not markup');
    await run('window.removeSkillFromProject(window.__test.testSkill);true');
    await run("window.closeEnhancedProjectModal();document.querySelector('.home-possibility details').open=true;true");
    assert.equal(await run("document.querySelector('.home-possibility details').textContent.includes('Gardening: still needed')"), true);
    await run("Array.from(document.querySelectorAll('.home-possibility button')).find(el=>el.textContent==='Save idea for later').click();true");
    await app.wait(`${panel}.querySelector('summary').textContent.includes('Saved idea')`, 'saved idea visible in settings');
    await click('Revisit: Explore a small community garden');
    await app.wait("document.querySelector('.home-possibility')?.textContent.includes('Starter plan')", 'saved idea reruns planning');
    await run("document.querySelector('.home-possibility details').open=true;true");
    await clickIdea('Find relevant organizations and opportunities');
    await app.wait("document.querySelector('.home-idea-results')?.textContent.includes('Community Garden Network')", 'targeted organization discovery');
    assert.equal(await run("document.querySelector('.home-idea-results').textContent.includes('Synthetic Gardener')"), false,
      'organization and opportunity discovery filters out people');
    assert.equal(await run("document.querySelector('.home-idea-results').textContent.includes('Garden volunteer shift')"), true,
      'organization/resource search includes matched public opportunities');
    await run("document.querySelector('#home-idea-input').value='Explore a community garden';document.querySelector('.home-idea-form').requestSubmit();true");
    await app.wait("document.querySelector('.home-possibility')?.textContent.includes('Starter plan')", 'saved starter plan restored after organization search');
    await run("window.__test.noMatch=false;window.__test.lookupsBeforeExplicit=window.__test.lookups;document.querySelector('#home-idea-input').value='Find a community garden';document.querySelector('.home-idea-form').requestSubmit();true");
    await app.wait("document.querySelector('.home-idea-results')?.textContent.includes('Matches for') || document.querySelector('.home-idea-results')?.textContent.includes('No matches for')", 'explicit search results');
    assert.equal(await run('window.__test.lookups'), await run('window.__test.lookupsBeforeExplicit'), 'explicit search bypasses collaboration lookup');
    await run(`document.querySelector('#home-idea-input').value='Explore a community garden. Private fixture draft.';document.querySelector('.home-idea-form').requestSubmit();true`);
    await app.wait("document.querySelector('.home-possibility h3')?.textContent==='Explore a small community garden'", 'routed collaboration proposal');
    assert.deepEqual(await run(`axe.run(document.querySelector('.home-possibility'), {runOnly:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}).then(r=>r.violations.map(v=>v.id))`), []);
    await run("document.querySelector('.home-possibility .home-action').click();true");
    await app.wait("document.querySelector('.home-possibility')?.textContent.includes('Invitation sent')", 'invitation sent confirmation');

    await run("window.__test.switch('b');true");
    await open();
    await waitText('Accept invitation');
    assert.equal(await run(`${panel}.textContent.includes('Revisit:')`), false, 'saved idea stays with its account');
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
    assert.equal(await run('window.__test.projects'), 2);
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
    await click('Open project creation');
    await app.wait("document.querySelector('#enhanced-project-name')?.value==='Explore a small community garden'", 'project draft from completed community action');
    await run(`window.dispatchEvent(new CustomEvent('profile-loaded',{detail:{profile:window.currentUserProfile}}));document.querySelector('#enhanced-project-form').requestSubmit();true`);
    await app.wait("document.querySelector('.home-mine-list')?.textContent.includes('Explore a small community garden')", 'created project returns to Home continuity');
    assert.equal(await run("window.supabase.__db.projects.some(p=>p.title==='Explore a small community garden' && p.required_skills.includes('Gardening'))"), true,
      'project and its capability requirements persist in the test database');
    await run(`window.__test.history=true;${panel}.open=false;true`);
    await app.sleep(100);
    await open();
    await waitText('More collaborations');
    assert.equal(await run(`${panel}.textContent.includes('Both members confirmed the first action')`), false);
    await click('More collaborations');
    await waitText('Both members confirmed the first action');
    await waitText('Previous collaborations');
    const violations = await run(`axe.run(${panel}, {runOnly:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}).then(r=>r.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})))`);
    assert.deepEqual(violations, []);
    assert.ok(await run('document.documentElement.scrollWidth <= innerWidth'));
    await click('Leave collaboration pilot and delete my records');
    await waitText('Opt in to collaboration');
    assert.equal(await run("localStorage.getItem('hpoe-starter:a')"), null, 'withdrawal clears the saved topic');
    console.log(`HPOE collaboration, opt-out and accessibility passed at ${width}px`);
  }
} finally {
  await app.close();
}
