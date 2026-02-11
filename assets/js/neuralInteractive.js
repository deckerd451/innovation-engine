// neuralInteractive.js
import { supabaseClient as supabase } from './supabaseClient.js';
import { fetchConnections } from './loadConnections.js';

window.supabase = supabase; // handy for console

// ───── GLOBAL STATE ─────────────────────────────────────────────────────────
const DEFAULT_NEURONS = [
  { name: "You", skills: ["Explorer"], interests: ["AI","Networks"], availability: "online", endorsements: 3 }
];

let combined = [];
let rawConnections = [];
let useGrid = false;
let neurons = [];
let connections = [];
let selectedNeuron = null;

let canvas, ctx, tooltip, user, userId;
let animationId = null, lastFrame = 0;
const FRAME_INTERVAL = 1000/30;

let initialized = false;
let animationStarted = false;

function setAuthStatus(msg, isError=false) {
  const el = document.getElementById('auth-status');
  if (!el) return;
  el.textContent = msg;
  el.className   = isError ? 'error':'success';
}

// Show/hide UI chunks that belong to the page (auth panes remain in dex.html)
function showAuthUI(needsLogin) {
  const authPane   = document.getElementById('auth-pane');
  const topActions = document.getElementById('top-actions');
  const canvasEl   = document.getElementById('neural-canvas');

  if (authPane)   authPane.style.display   = needsLogin ? 'block':'none';
  if (topActions) topActions.style.display = needsLogin ? 'none' :'flex';
  if (canvasEl)   canvasEl.style.display   = needsLogin ? 'none' :'block';
}

// ───── AUTH & DATA LOADING ─────────────────────────────────────────────────
async function loadOrCreatePersonalNeurons() {
  const { data, error } = await supabase.from('community').select('*');
  if (error) {
    console.error(error);
    return setAuthStatus("Error loading neurons", true);
  }

  const mine   = data.filter(n => n.user_id === userId);
  const others = data.filter(n => n.user_id !== userId);

  if (!mine.length) {
    const toInsert = DEFAULT_NEURONS.map(n => ({ ...n, user_id:userId, x:0, y:0 }));
    const { error: insErr } = await supabase.from('community').insert(toInsert);
    if (insErr) {
      console.error(insErr);
      return setAuthStatus("Could not seed defaults", true);
    }
    return loadOrCreatePersonalNeurons();
  }

  combined = [
    ...mine .map(n => ({ ...n, owned:true  })),
    ...others.map(n => ({ ...n, owned:false }))
  ];

  neurons = useGrid
    ? arrangeNeuronsInGrid(combined)
    : clusteredLayout(combined, canvas.width, canvas.height);

  if (selectedNeuron) {
    const id = selectedNeuron.meta.id;
    selectedNeuron = neurons.find(n => n.meta.id === id) || null;
  }

  rawConnections = await fetchConnections();
  connections = rawConnections.map(({ from_id, to_id }) => ({
    from: neurons.find(n => n.meta.id === from_id),
    to:   neurons.find(n => n.meta.id === to_id)
  }));

  drawNetwork();
  if (!animationStarted) {
    animationId = requestAnimationFrame(animate);
    animationStarted = true;
  }
}

// ───── LAYOUT ───────────────────────────────────────────────────────────────
function arrangeNeuronsInGrid(users) {
  const total = users.length;
  const cols  = Math.ceil(Math.sqrt(total));
  const sx    = canvas.width  / (cols+1);
  const sy    = canvas.height / (Math.ceil(total/cols)+1);

  return users.map((u,i) => ({
    x:      sx*((i%cols)+1),
    y:      sy*(Math.floor(i/cols)+1),
    radius: 18, meta:u, owned:u.owned
  }));
}

function clusteredLayout(users,w,h) {
  const groupBy = u=>u.skills?.[0]||u.availability||'misc';
  const groups  = {};
  users.forEach(u=> (groups[groupBy(u)] ||= []).push(u));

  const keys = Object.keys(groups);
  const cx   = w/2, cy = h/2, R = Math.min(w,h)*0.35;
  const out  = [];

  keys.forEach((k,i)=>{
    const ang = 2*Math.PI*i/keys.length;
    const center = { x:cx+Math.cos(ang)*R, y:cy+Math.sin(ang)*R };
    groups[k].forEach((u,j)=>{
      const off   = 2*Math.PI*j/groups[k].length;
      const sp    = 40 + j*5;
      const baseX = u.x ?? center.x;
      const baseY = u.y ?? center.y;
      out.push({
        x:      baseX + Math.cos(off)*sp,
        y:      baseY + Math.sin(off)*sp,
        radius: 18, meta:u, owned:u.owned
      });
    });
  });

  return out;
}

// ───── RENDERING ───────────────────────────────────────────────────────────
function drawNeuron(n,t) {
  const pulse = 1 + Math.sin(t/400 + n.x + n.y)*0.3;
  const r     = n.radius*pulse;
  const glow  = ctx.createRadialGradient(n.x,n.y,0,n.x,n.y,r);
  const col   = n.owned?'#0ff':'rgba(255,255,255,0.3)';
  glow.addColorStop(0,col);
  glow.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(n.x,n.y,r,0,2*Math.PI); ctx.fill();

  ctx.fillStyle = col;
  ctx.beginPath(); ctx.arc(n.x,n.y,5,0,2*Math.PI); ctx.fill();

  ctx.font      = '15px sans-serif';
  ctx.fillStyle = col;
  ctx.textAlign = 'center';
  ctx.fillText(n.meta.name, n.x, n.y - r - 10);

  if (n === selectedNeuron) {
    ctx.strokeStyle = '#ff0';
    ctx.lineWidth   = 4;
    ctx.beginPath(); ctx.arc(n.x,n.y,r+6,0,2*Math.PI); ctx.stroke();
  }
}

function drawConnections() {
  ctx.lineWidth   = 1.5;
  ctx.strokeStyle = 'rgba(0,255,255,0.16)';
  connections.forEach(({from,to})=>{
    if (from && to) {
      ctx.beginPath();
      ctx.moveTo(from.x,from.y);
      ctx.lineTo(to.x,to.y);
      ctx.stroke();
    }
  });
}

function drawNetwork(time=0) {
  if (!neurons.length) return;
  ctx.clearRect(0,0,canvas.width,canvas.height);
  drawConnections();
  neurons.forEach(n=>drawNeuron(n,time));
}

function animate(time) {
  // ✅ PERFORMANCE: Stop animation when idle or hidden
  if (document.hidden || (window.AnimationLifecycle && !window.AnimationLifecycle.isActive())) {
    animationId = null;
    animationStarted = false;
    return;
  }

  if (time - lastFrame >= FRAME_INTERVAL) {
    drawNetwork(time);
    lastFrame = time;
  }
  animationId = requestAnimationFrame(animate);
}

// ───── BOOTSTRAP ───────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async()=>{
  canvas   = document.getElementById('neural-canvas');
  ctx      = canvas.getContext('2d');
  tooltip  = document.getElementById('tooltip');

  const toggleBtn = document.getElementById('toggle-layout');

  window.addEventListener('resize',()=>{
    canvas.width  = innerWidth;
    canvas.height = innerHeight;
  });
  canvas.width  = innerWidth;
  canvas.height = innerHeight;

  // Toggle between layouts
  toggleBtn?.addEventListener('click', ()=>{
    useGrid = !useGrid;
    toggleBtn.textContent = useGrid ? 'Use Cluster':'Use Grid';

    neurons = useGrid
      ? arrangeNeuronsInGrid(combined)
      : clusteredLayout(combined, canvas.width, canvas.height);

    if (selectedNeuron) {
      const selId = selectedNeuron.meta.id;
      selectedNeuron = neurons.find(n=>n.meta.id===selId) || null;
    }

    connections = rawConnections.map(({from_id,to_id})=>({
      from: neurons.find(n=>n.meta.id===from_id),
      to:   neurons.find(n=>n.meta.id===to_id)
    }));

    drawNetwork();
  });

  // Hover tooltip
  canvas.addEventListener('mousemove',e=>{
    const {left,top}=canvas.getBoundingClientRect();
    const x=e.clientX-left, y=e.clientY-top;
    const hit=neurons.find(n=>Math.hypot(n.x-x,n.y-y)<n.radius);
    if(hit){
      tooltip.style.display='block';
      tooltip.style.left=`${e.clientX+12}px`;
      tooltip.style.top =`${e.clientY+12}px`;
      tooltip.textContent=
        `${hit.meta.name}\nSkills: ${(hit.meta.skills||[]).join(', ')}\n`+
        `Endorsements: ${hit.meta.endorsements ?? 0}\nStatus: ${hit.meta.availability ?? ''}`;
    } else tooltip.style.display='none';
  });
  canvas.addEventListener('mouseleave', ()=>tooltip.style.display='none');

  // Drag owned nodes to save x/y
  let dragging=null, offs={x:0,y:0};
  const onMove=e=>{
    if(!dragging) return;
    const {left,top}=canvas.getBoundingClientRect();
    const x=e.clientX-left, y=e.clientY-top;
    dragging.x=x-offs.x; dragging.y=y-offs.y;
    drawNetwork();
  };
  const onUp=()=>{
    if(!dragging) return;
    canvas.style.cursor='';
    supabase.from('community')
      .update({x:dragging.x,y:dragging.y})
      .eq('id',dragging.meta.id);
    dragging.meta.x=dragging.x;
    dragging.meta.y=dragging.y;
    window.removeEventListener('mousemove',onMove);
    window.removeEventListener('mouseup',  onUp);
    dragging=null;
  };
  canvas.addEventListener('mousedown',e=>{
    const {left,top}=canvas.getBoundingClientRect();
    const x=e.clientX-left, y=e.clientY-top;
    const hit=neurons.find(n=>Math.hypot(n.x-x,n.y-y)<n.radius && n.owned);
    if(!hit) return;
    dragging=hit;
    offs.x=x-hit.x; offs.y=y-hit.y;
    canvas.style.cursor='grabbing';
    window.addEventListener('mousemove',onMove);
    window.addEventListener('mouseup',  onUp);
  });

  // Click-to-connect
  canvas.addEventListener('click',async e=>{
    const {left,top}=canvas.getBoundingClientRect();
    const x=e.clientX-left,y=e.clientY-top;
    const hit=neurons.find(n=>Math.hypot(n.x-x,n.y-y)<n.radius);
    if(!hit){ selectedNeuron=null; return; }
    if(!selectedNeuron){
      if(hit.owned) selectedNeuron=hit;
    } else if(hit!==selectedNeuron){
      await supabase.from('connections')
        .insert({from_id:selectedNeuron.meta.id,to_id:hit.meta.id});
      connections.push({from:selectedNeuron,to:hit});
      selectedNeuron=null;
      drawNetwork();
    }
  });

  // Tab changes from dex.html control canvas visibility and animation
  document.addEventListener('dex:tab-changed', (e) => {
    const isNetwork  = e.detail?.tab === 'network';
    const canvasEl   = document.getElementById('neural-canvas');
    const topActions = document.getElementById('top-actions');

    if (canvasEl) canvasEl.style.display = isNetwork ? 'block' : 'none';
    if (topActions) topActions.style.display = isNetwork ? 'flex' : 'none';

    if (!isNetwork && animationId) {
      cancelAnimationFrame(animationId); 
      animationId = null;
      animationStarted = false;
    } else if (isNetwork && !animationId && !animationStarted) {
      animationStarted = true;
      animationId = requestAnimationFrame(animate);
    }
  });

  // ✅ PERFORMANCE: Restart animation when page becomes active
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !animationId && neurons.length > 0) {
      const isNetwork = document.getElementById('neural-canvas')?.style.display !== 'none';
      if (isNetwork) {
        animationStarted = true;
        animationId = requestAnimationFrame(animate);
      }
    }
  });

  // Auth state: load data when logged in
  supabase.auth.onAuthStateChange(async(_,sess)=>{
    if(sess?.user && !initialized){
      initialized=true;
      user=sess.user; userId=user.id;
      showAuthUI(false);
      await loadOrCreatePersonalNeurons();
    } else if(!sess?.user){
      initialized=false;
      showAuthUI(true);
      if (animationId) { cancelAnimationFrame(animationId); animationId = null; }
    }
  });

  // First run: pick up existing session
  const { data:{session} } = await supabase.auth.getSession();
  if(session?.user){
    initialized=true;
    user=session.user; userId=user.id;
    showAuthUI(false);
    await loadOrCreatePersonalNeurons();
  } else {
    showAuthUI(true);
  }
});
