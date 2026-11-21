// Full local campaign workflow with synthetic provider receipts; no real emails.
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import { appHarness } from "./helpers/app-harness.mjs";
const require = createRequire(import.meta.url),
  axe = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const app = await appHarness(),
  run = app.evaluate,
  wait = app.wait;
let checks = 0;
const check = (ok, label) => {
  assert.ok(ok, label);
  checks++;
  console.log("PASS", label);
};
try {
  for (const width of [1280, 390]) {
    await app.load(width, 844);
    await run(
      `window.currentAuthUser={id:'auth-me',email:'dmhamilton1@live.com'};window.currentUserProfile.user_role='Admin';window.__campaignId='00000000-0000-4000-8000-000000000001';window.__mailCalls=[];window.__campaignState={campaign:{id:window.__campaignId,subject:'Fixture campaign',message:'Message <script>literal</script>',destination:'projects'},can_send:true,total:8,report_total:8,counts:{ready:8},test_accepted:false,test_attempted:false,pilot_started:false,recipients:[{person_id:'20000000-0000-4000-8000-000000000001',name:'Name <img src=x onerror=window.__campaignXss=true>',email:'synthetic@example.test',status:'ready',code:null,is_test:false}]};window.__oldRpc=window.supabase.rpc.bind(window.supabase);window.supabase.rpc=async(name,args)=>{if(name!=='admin_email_campaign')return window.__oldRpc(name,args);window.__mailCalls.push(args);if(window.__campaignError)throw Error('Fixture unavailable');if(args.p_action==='list')return {data:window.__created?[{id:window.__campaignId,subject:'Fixture campaign',audience:'unclaimed'}]:[]};if(args.p_action==='preview')return {data:{eligible:8-(args.p_payload.excluded_ids?.length||0),total:1,offset:0,excluded:{admin:1},recipients:[{person_id:'20000000-0000-4000-8000-000000000001',name:'Name <img src=x onerror=window.__campaignXss=true>',email:'synthetic@example.test',reason:'eligible',needs_claim:true}]}};if(args.p_action==='create'){window.__created=true;return {data:{id:window.__campaignId}};}if(args.p_action==='cancel'){window.__campaignState.can_send=false;window.__campaignState.campaign.cancelled=true;window.__campaignState.counts={skipped:8};}return {data:structuredClone(window.__campaignState)};};window.supabase.functions={invoke:async(name,{body})=>{window.__sendRequest={name,body};if(body.mode==='test'){window.__campaignState.test_attempted=true;window.__campaignState.test_accepted=true;}if(body.mode==='pilot'){window.__campaignState.pilot_started=true;window.__campaignState.counts={accepted:5,ready:3};}if(body.mode==='batch'){window.__campaignState.counts={accepted:8,ready:0};}return {data:{results:[{status:'accepted',recorded:true}]}};}};window.openAdminPanel();document.querySelector('#admin-panel [data-tab=manage]').click();true`,
    );
    await wait(
      `document.querySelector('.admin-people-heading button')?.textContent==='Email campaigns'`,
      "campaign entry",
    );
    await run(
      `document.querySelector('.admin-people-heading button').click();true`,
    );
    await wait(
      `document.querySelector('#campaign-preview')&&!document.querySelector('#campaign-preview').disabled`,
      "campaign screen",
    );
    check(
      await run(
        `document.querySelector('#campaign-create').disabled&&!window.__sendRequest`,
      ),
      "No emails sent by opening campaigns",
    );
    await run(`document.querySelector('#campaign-preview').click();true`);
    await wait(
      `document.querySelector('#campaign-preview-result').textContent.includes('8 eligible')`,
      "audience",
    );
    check(
      await run(
        `!window.__campaignXss&&!document.querySelector('#campaign-preview-result img')&&document.querySelector('#campaign-preview-result').textContent.includes('<img')`,
      ),
      "Preview names are text, not HTML",
    );
    await run(
      `document.querySelector('#campaign-preview-result input').click();true`,
    );
    await wait(
      `document.querySelector('#campaign-preview-result').textContent.includes('7 eligible')`,
      "exclude",
    );
    check(
      await run(`window.__mailCalls.at(-1).p_payload.excluded_ids.length===1`),
      "Manual exclusions go to the server preview",
    );
    await run(`document.querySelector('#campaign-create').click();true`);
    await wait(
      `!document.querySelector('#campaign-report-section').hidden&&!document.querySelector('#campaign-preview').disabled`,
      "saved draft",
    );
    check(await run(`!document.querySelector('.campaign-draft-notice')&&!document.querySelector('#campaign-test').disabled&&document.querySelector('#campaign-pilot').disabled&&document.querySelector('#campaign-batch').disabled&&!window.__sendRequest`), 'Production enables only the test before test acceptance; creating a draft sends nothing');
    check(await run(`document.querySelectorAll('.campaign-steps>li').length===3&&document.querySelector('#campaign-reviewed').closest('label').hidden&&!document.querySelector('.campaign-compose').open&&document.querySelector('.campaign-identity').textContent.includes('Draft 00000001')&&document.querySelector('#campaign-history button').getAttribute('aria-pressed')==='true'`),'Selected draft is identified, composer is collapsed and approval is hidden before pilot');
    await run(`window.__campaignState.can_send=false;document.querySelector('#campaign-report-refresh').click();true`);
    await wait(`document.querySelector('.campaign-access').textContent.includes('different login')`,'draft ownership explanation');
    check(await run(`document.querySelector('#campaign-test').disabled&&document.querySelector('#campaign-cancel').disabled&&!window.__sendRequest`),'Read-only draft explains disabled sending without bypassing ownership');
    await run(`window.__campaignState.can_send=true;document.querySelector('#campaign-report-refresh').click();true`);
    await wait(`!document.querySelector('#campaign-test').disabled`,'owned draft restored');
    const guidedShot=await app.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync('/tmp/campaign-guided-'+width+'.png',Buffer.from(guidedShot.data,'base64'));
    // Keep the reusable draft-only mode covered, using synthetic data only.
    await run(`(async()=>{const m=await import('./assets/js/admin-campaigns.js?v=delivery-20261121');await m.renderCampaigns(document.querySelector('#admin-tab-content'),{draftsOnly:true});return true;})()`);
    await wait(`document.querySelector('#campaign-history button')&&!document.querySelector('#campaign-history button').disabled`,'draft-only history');
    await run(`document.querySelector('#campaign-history button').click();true`);
    await wait(`!document.querySelector('#campaign-report-section').hidden&&!document.querySelector('#campaign-report-refresh').disabled`,'draft-only report');
    check(await run(`document.querySelector('.campaign-draft-notice')&&document.querySelector('#campaign-test').disabled&&document.querySelector('#campaign-pilot').disabled&&document.querySelector('#campaign-batch').disabled&&!window.__sendRequest`), 'Explicit draft-only mode retains disabled send actions');
    await run(`(async()=>{const m=await import('./assets/js/admin-campaigns.js?v=delivery-20261121');await m.renderCampaigns(document.querySelector('#admin-tab-content'),{draftsOnly:false});return true;})()`);
    await wait(`document.querySelector('#campaign-history button')&&!document.querySelector('#campaign-history button').disabled`,'saved campaign history');
    await run(`document.querySelector('#campaign-history button').click();true`);
    await wait(`!document.querySelector('#campaign-test').disabled`,'synthetic send mode');
    check(
      await run(
        `document.querySelector('#campaign-pilot').disabled&&document.querySelector('#campaign-batch').disabled`,
      ),
      "Pilot and remaining recipients blocked before test",
    );
    await run(`document.querySelector('#campaign-test').click();true`);
    await wait(
      `!document.querySelector('#campaign-pilot').disabled`,
      "test result",
    );
    check(
      await run(
        `window.__sendRequest.body.mode==='test'&&Object.keys(window.__sendRequest.body).sort().join()==='campaign_id,mode,reviewed'`,
      ),
      "Test uses server-owned recipient selection",
    );
    await run(`document.querySelector('#campaign-pilot').click();true`);
    await wait(
      `document.querySelector('.campaign-summary').textContent.includes('5 accepted')`,
      "pilot",
    );
    check(
      await run(`document.querySelector('#campaign-batch').disabled`),
      "Continuing requires explicit pilot review",
    );
    await run(
      `document.querySelector('#campaign-reviewed').click();document.querySelector('#campaign-batch').click();true`,
    );
    await wait(
      `document.querySelector('.campaign-summary').textContent.includes('8 accepted')`,
      "batch",
    );
    check(
      await run(
        `window.__sendRequest.body.reviewed===true&&document.querySelector('#campaign-batch').disabled`,
      ),
      "Remaining batch is explicit and completed queue disables sending",
    );
    const shot = await app.send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(
      "/tmp/email-campaigns-" + width + ".png",
      Buffer.from(shot.data, "base64"),
    );
    check(
      await run(
        `document.querySelector('#admin-tab-content').scrollWidth<=document.querySelector('#admin-tab-content').clientWidth+1`,
      ),
      "Campaign controls fit " + width,
    );
    await run(axe + ";true");
    const violations = await run(
      `axe.run(document.querySelector('#admin-panel'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}}).then(r=>r.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})))`,
    );
    check(
      !violations.length,
      "Campaign accessibility: " + JSON.stringify(violations),
    );
    await run(
      `window.__campaignState.counts={accepted:2,ready:6};document.querySelector('#campaign-report-refresh').click();true`,
    );
    await wait(
      `document.querySelector('.campaign-summary').textContent.includes('6 ready')`,
      "remaining queue",
    );
    await run(
      `window.__batchCalls=0;window.supabase.functions.invoke=async()=>{window.__batchCalls++;await new Promise(resolve=>window.__batchResolve=resolve);window.__campaignState.counts={accepted:7,ready:1};return {data:{results:[{status:'accepted',recorded:true}]}};};document.querySelector('#campaign-batch').click();true`,
    );
    await wait("window.__batchResolve", "in-flight batch");
    await run(
      `document.querySelector('#campaign-pause').click();window.__batchResolve();true`,
    );
    await wait(
      `document.querySelector('.campaign-status').textContent.includes('Queue paused')`,
      "pause",
    );
    check(
      await run(
        `window.__batchCalls===1&&!document.querySelector('#campaign-batch').disabled`,
      ),
      "Pause stops after the in-flight batch and permits resuming",
    );
    await run(`document.querySelector('#campaign-cancel').click();true`);
    await wait(
      `document.querySelector('.campaign-summary').textContent.includes('Cancelled')`,
      "cancel",
    );
    check(
      await run(
        `document.querySelector('#campaign-batch').disabled&&window.__mailCalls.some(c=>c.p_action==='cancel')`,
      ),
      "Cancel prevents further queue sending",
    );
    await run(
      `window.__campaignError=true;document.querySelector('#campaign-report-refresh').click();true`,
    );
    await wait(
      `document.querySelector('.campaign-status').textContent.includes('unavailable')`,
      "error",
    );
    check(
      await run(`!document.querySelector('#campaign-report-refresh').disabled`),
      "Failed report remains retryable",
    );
  }
  const origin = await run("location.origin");
  const {identifier:pulseFixture} = await app.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `window.__pulseData={generated_at:'2026-11-14T12:00:00Z',member_band:80,connection_band:10,active_projects:4,open_opportunities:3,new_profiles_band:null,new_connections_band:5,popular_skills:[{skill:'Web <img onerror=window.__pulseXss=true>',members_band:10}],monthly:[{month:'2026-11',profiles_band:null}]};window.__pulseCalls=[];window.supabase.rpc=async(name)=>{window.__pulseCalls.push(name);return window.__pulseDenied?{error:{code:'42501'}}:{data:window.__pulseData};};`,
  });
  await app.send("Page.navigate", { url: origin + "/pulse.html" });
  await wait(
    `document.querySelector('#community-pulse [role=status]')?.textContent.includes('Updated')`,
    "member summary",
  );
  await run(
    `window.__pulseRoot=document.querySelector('#community-pulse');true`,
  );
  const pulseShot = await app.send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(
    "/tmp/community-pulse.png",
    Buffer.from(pulseShot.data, "base64"),
  );
  check(
    await run(
      `window.__pulseCalls.every(n=>n==='get_community_pulse')&&window.__pulseRoot.textContent.includes('80+')&&window.__pulseRoot.textContent.includes('Fewer than 5')`,
    ),
    "Member summary calls only the dedicated privacy-safe report",
  );
  check(await run(`document.querySelectorAll('.pulse-metrics article').length===2&&!document.querySelector('.pulse-more').open&&document.querySelector('.pulse-actions').compareDocumentPosition(document.querySelector('.pulse-metrics'))&Node.DOCUMENT_POSITION_FOLLOWING`),'Participation links and two main metrics lead; detailed stats are collapsed');
  check(await run(`document.querySelectorAll('.pulse-months li').length===0&&document.querySelector('.pulse-growth').textContent.includes('grouped for privacy')`),'Small monthly counts collapse into one privacy note');
  await run(`document.querySelector('.pulse-more').open=true;window.__pulseData.monthly=[{month:'2026-10',profiles_band:10},{month:'2026-11',profiles_band:null}];document.querySelector('#pulse-refresh').click();true`);
  await wait(`document.querySelector('.pulse-months')?.textContent.includes('10+')`,'reported growth');
  check(await run(`document.querySelectorAll('.pulse-months li').length===1&&document.querySelector('.pulse-more').open`),'Reported growth remains available and refresh preserves the disclosure');
  await run(`document.querySelector('.pulse-more').open=false;true`);
  for(const width of [320,390,1280]) {
    await app.send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:width<1024});await app.sleep(100);
    check(await run(`document.documentElement.scrollWidth<=innerWidth`),'Simplified Pulse fits '+width);
    const shot=await app.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync('/tmp/community-pulse-simple-'+width+'.png',Buffer.from(shot.data,'base64'));
  }

  await app.sleep(200);
  await run(axe + ";true");
  const pulseViolations = await run(
    `axe.run(window.__pulseRoot,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}}).then(r=>r.violations.map(v=>v.id))`,
  );
  check(
    !pulseViolations.length,
    "Member summary accessibility: " + JSON.stringify(pulseViolations),
  );
  check(
    await run(`!window.__pulseXss&&!window.__pulseRoot.querySelector('img')`),
    "Skill text cannot inject markup",
  );
  await run(
    `window.__pulseDenied=true;document.querySelector('#pulse-refresh').click();true`,
  );
  await wait(
    `document.querySelector('[role=status]').textContent.includes('Sign in')`,
    "member denial",
  );
  check(
    await run(`!document.querySelector('.pulse-metrics').children.length`),
    "Access denial clears the prior member summary",
  );
  await app.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:pulseFixture});
  await app.send('Page.navigate',{url:origin+'/index.html?campaign_resource=projects'});
  await wait(`document.body.dataset.destination==='explore'&&document.querySelector('.udc-resource-tab[data-resource=projects]')?.getAttribute('aria-selected')==='true'`,'email app destination');
  check(await run(`!location.search.includes('campaign_resource')`),'Email project links reach Explore and remove the routing parameter');
  await app.send('Page.navigate',{url:origin+'/index.html?campaign_resource=people'});
  await wait(`document.body.dataset.destination==='explore'&&document.querySelector('.udc-resource-tab[data-resource=people]')?.getAttribute('aria-selected')==='true'`,'people destination');
  check(await run(`!location.search.includes('campaign_resource')`),'Meet people opens the directory directly');
  // Real unsubscribe page: URL fragment is removed before the RPC and no GET mutates preferences.
  await app.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `window.__unsubCalls=[];window.supabase.rpc=async(name,args)=>{window.__unsubCalls.push({name,args});return {error:null};};`,
  });
  await app.send("Page.navigate", {
    url: origin + "/unsubscribe.html#" + "a".repeat(64),
  });
  await wait(
    `document.querySelector('#unsubscribe-confirm')&&!location.hash`,
    "unsubscribe page",
  );
  check(
    await run(`window.__unsubCalls.length===0`),
    "Opening unsubscribe page does not change preferences",
  );
  await run(`document.querySelector('#unsubscribe-confirm').click();true`);
  await wait(
    `document.querySelector('#unsubscribe-status').textContent.includes('complete')`,
    "unsubscribe confirmation",
  );
  check(
    await run(`window.__unsubCalls[0].name==='unsubscribe_campaign_email'`),
    "Explicit unsubscribe calls only preference RPC",
  );
  check(app.dialogs.length === 0, "No native dialogs or real email delivery");
  console.log(
    `${checks}/${checks} campaign and Community Pulse browser checks passed`,
  );
} finally {
  await app.close();
}
