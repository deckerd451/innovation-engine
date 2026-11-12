// Disposable local app + synthetic member. Never contacts a production service.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {waitForChromeEndpoint} from './chrome-startup.mjs';
export async function appHarness() {
  const here = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
  const root = process.env.A11Y_TEST_ROOT || here;
  // Reuse the established discovery fixture rather than inventing another data model.
  const source = fs.readFileSync(path.join(here,'scripts/tests/browser/run-explore-people.mjs'),'utf8');
  const fixtures = fs.readFileSync(path.join(here,'scripts/tests/fixtures/assistance-fixtures.js'),'utf8');
  const fake = fs.readFileSync(path.join(here,'scripts/tests/fixtures/fake-supabase.js'),'utf8');
  function expression(start, end) {
    const a=source.indexOf(start), b=source.indexOf(end,a);
    if(a<0 || b<0) throw Error('Accessibility fixture markers changed');
    return source.slice(a+start.length,b);
  }
  const boot = new Function('fixtures','fake','return '+expression('const boot = ','\nconst VIEWPORTS ='))(fixtures,fake);
  const stub = new Function('return '+expression('const stubClient = ','\n\nconst types ='))();
  const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.json':'application/json'};
  const server=http.createServer((req,res)=>{
    const url=new URL(req.url,'http://localhost');
    if(url.pathname.endsWith('/supabaseClient.js')){res.setHeader('content-type','text/javascript');res.end(stub);return;}
    const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
    if(url.pathname==='/sw.js'||!file.startsWith(root+path.sep)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);res.end();return;}
    res.setHeader('content-type',types[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'ie-a11y-chrome-'));
  const chrome=spawn(process.env.CHROME_PATH||(process.platform==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':'google-chrome'),['--headless=new','--remote-debugging-port=0',`--user-data-dir=${profile}`,'--no-first-run','--no-default-browser-check','--disable-gpu','--disable-dev-shm-usage','--no-sandbox','about:blank'],{stdio:['ignore','ignore','pipe']});
  let socket;
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  async function close(){socket?.close();chrome.kill();server.closeAllConnections();server.close();await sleep(200);fs.rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
  try {
    const endpoint=await waitForChromeEndpoint(chrome,'accessibility Chrome');
    const targets=await (await fetch(endpoint.replace('ws://','http://').replace(/\/devtools\/browser\/.*/,'/json/list'))).json();
    socket=new WebSocket(targets.find(target=>target.type==='page').webSocketDebuggerUrl);
    await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
    let sequence=0; const pending=new Map(); const dialogs=[]; const errors=[];
    function send(method,params={}){return new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});}
    socket.addEventListener('message',event=>{
      const message=JSON.parse(event.data);
      if(message.id&&pending.has(message.id)){const task=pending.get(message.id);pending.delete(message.id);message.error?task.reject(Error(message.error.message)):task.resolve(message.result);}
      if(message.method==='Fetch.requestPaused'){const local=message.params.request.url.startsWith(base);send(local?'Fetch.continueRequest':'Fetch.failRequest',local?{requestId:message.params.requestId}:{requestId:message.params.requestId,errorReason:'BlockedByClient'}).catch(()=>{});}
      if(message.method==='Page.javascriptDialogOpening'){dialogs.push(message.params);send('Page.handleJavaScriptDialog',{accept:false}).catch(()=>{});}
      if(message.method==='Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description||message.params.exceptionDetails.text);
    });
    async function evaluate(expression){const result=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value;}
    async function wait(expression,label,timeout=20000){const start=Date.now();while(Date.now()-start<timeout){if(await evaluate(`Boolean(${expression})`).catch(()=>false))return;await sleep(100);}throw Error('Timed out: '+label);}
    async function key(key,shift=false){const codes={Tab:9,Escape:27,Enter:13,ArrowLeft:37,ArrowRight:39,ArrowUp:38,ArrowDown:40,Home:36,End:35};for(const type of ['keyDown','keyUp'])await send('Input.dispatchKeyEvent',{type,key,code:key,windowsVirtualKeyCode:codes[key],modifiers:shift?8:0});}
    async function load(width=1280,height=800){await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<1024});await send('Page.navigate',{url:base+'/index.html?scenario=established'});await wait("document.readyState==='complete'",'document');await sleep(1500);if(!await evaluate('Boolean(window.currentUserProfile?.id)'))await evaluate(`window.currentUserProfile=window.__fixtureProfile;document.querySelectorAll('#login-section,.login-overlay,#auth-container').forEach(el=>el.style.display='none');window.dispatchEvent(new CustomEvent('profile-loaded',{detail:{user:{id:'auth-me'},profile:window.__fixtureProfile}}));true`);await wait('window.AppNav&&window.HomeView&&document.querySelector(".home-view")','member Home');await sleep(600);}
    await send('Page.enable');await send('Runtime.enable');await send('Fetch.enable',{patterns:[{urlPattern:'*'}]});await send('Page.addScriptToEvaluateOnNewDocument',{source:boot});
    return {evaluate,send,wait,key,load,sleep,close,dialogs,errors};
  } catch(error){await close();throw error;}
}
