import { supabaseClient as supabase } from './supabaseClient.js';
import { showNotification } from './utils.js';
import { loadLeaderboard } from './leaderboard.js';
import { initSynapseView } from './synapse.js';
import { initProfileForm } from './profile.js';

/* =========================================================
0) Helpers + Globals
========================================================= */
let SKILL_SUGGESTIONS = [];
let SKILL_COLORS = {}; // { skill: hexColor }

/**
 * Load color codes for skills from the DB
 */
async function loadSkillColors() {
  try {
    const { data, error } = await supabase.from('skill_colors').select('skill, color');
    if (error) throw error;
    SKILL_COLORS = {};
    data?.forEach(row => {
      if (row.skill && row.color) {
        SKILL_COLORS[row.skill.toLowerCase()] = row.color;
      }
    });
  } catch (err) {
    console.warn('[Skill Colors] Load error:', err);
  }
}

/**
 * Safe normalize any skill/interest field into array of strings
 */
function normalizeField(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map(s => String(s).trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value.split(/[,;|]/).map(s => s.trim()).filter(Boolean);
  }
  if (typeof value === 'object') {
    return Object.values(value).map(s => String(s).trim()).filter(Boolean);
  }
  return [];
}

/**
 * Debounce util
 */
function debounce(fn, ms = 150) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

function normaliseArray(a) {
  if (!a) return [];
  const arr = Array.isArray(a) ? a : a.toString().split(',');
  return arr.map(s => s && s.toString().trim().toLowerCase()).filter(Boolean);
}

function parseRequiredSkills(raw) {
  return (raw || '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
}

function filterAllOfRequired(candidates, requiredSkills) {
  return (candidates || []).filter(p => {
    const have = new Set([...normaliseArray(p.skills), ...normaliseArray(p.interests)]);
    return requiredSkills.every(req => have.has(req));
  });
}

async function loadSkillSuggestions() {
  try {
    const { data, error } = await supabase.from("community").select("skills, interests");
    if (error) return console.warn("[Suggest] load error:", error.message);

    const bag = new Set();
    (data || []).forEach(r => {
      const allVals = [].concat(r.skills || []).concat(r.interests || []);
      allVals.forEach(val => {
        if (!val) return;
        normalizeField(val).forEach(skill => bag.add(skill.toLowerCase()));
      });
    });
    SKILL_SUGGESTIONS = Array.from(bag).sort();
  } catch (e) {
    console.warn("[Suggest] unexpected:", e);
  }
}

function attachAutocomplete(rootId, inputId, boxSelector) {
  const root = document.getElementById(rootId);
  if (!root) return;
  const input = root.querySelector(`#${inputId}`);
  const box = root.querySelector(boxSelector);
  if (!input || !box) return;

  const wrapper = input.parentElement;
  if (getComputedStyle(wrapper).position === 'static') wrapper.style.position = 'relative';

  const closeBox = () => { box.innerHTML = ''; box.style.display = 'none'; };
  const openBox  = () => { box.style.display = 'block'; };

  const render = debounce(() => {
    const parts = (input.value || '').split(',');
    const lastRaw = parts[parts.length - 1].trim().toLowerCase();
    if (!lastRaw) return closeBox();

    const matches = SKILL_SUGGESTIONS.filter(s => s.startsWith(lastRaw)).slice(0, 8);
    if (!matches.length) return closeBox();

    box.innerHTML = matches.map(s => `<div class="autocomplete-item" data-skill="${s}">${s}</div>`).join('');
    openBox();
    box.querySelectorAll('.autocomplete-item').forEach(el => {
      el.addEventListener('click', () => {
        parts[parts.length - 1] = ' ' + el.dataset.skill;
        input.value = parts.map(p => p.trim()).filter(Boolean).join(', ') + ', ';
        input.focus();
        closeBox();
      });
    });
  }, 120);

  input.addEventListener('input', render);
  input.addEventListener('focus', render);
  input.addEventListener('blur', () => setTimeout(closeBox, 120));
}

/* =========================================================
1) Auth
========================================================= */
async function initAuth() {
  const loginForm = document.getElementById('login-form');
  const loginSection = document.getElementById('login-section');
  const profileSection = document.getElementById('profile-section');
  const logoutBtn = document.getElementById('logout-btn');
  const userBadge = document.getElementById('user-badge');

  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('login-email').value.trim();
      if (!email) return showNotification('Enter a valid email.', 'error');

      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.href },
      });
      if (error) showNotification('Failed to send magic link.', 'error');
      else showNotification('Magic link sent! Check your inbox.', 'success');
    });
  }

  function setLoggedInUI(user) {
    loginSection?.classList.add('hidden');
    profileSection?.classList.remove('hidden');
    logoutBtn?.classList.remove('hidden');
    if (userBadge) {
      userBadge.textContent = `Signed in as ${user.email}`;
      userBadge.classList.remove('hidden');
    }
  }

  function setLoggedOutUI() {
    loginSection?.classList.remove('hidden');
    profileSection?.classList.add('hidden');
    logoutBtn?.classList.add('hidden');
    userBadge?.classList.add('hidden');
  }

  const { data: { user }, error } = await supabase.auth.getUser();
  if (user) setLoggedInUI(user);
  else if (error) setLoggedOutUI();

  supabase.auth.onAuthStateChange((_event, session) => {
    if (session?.user) setLoggedInUI(session.user);
    else setLoggedOutUI();
  });

  logoutBtn?.addEventListener('click', async () => {
    await supabase.auth.signOut();
    showNotification('Signed out.', 'success');
    setLoggedOutUI();
    document.getElementById('skills-form')?.reset();
  });
}
/* =========================================================
2) Connections (Mutual Requests)
========================================================= */
async function getMyProfileId() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;

  const { data: profile, error: profileError } = await supabase
    .from('community')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (profileError || !profile) return null;
  return profile.id;
}

async function connectToUser(targetId) {
  const me = await getMyProfileId();
  if (!me) return showNotification('Login required.', 'error');
  if (me === targetId) return showNotification('Cannot connect to yourself.', 'error');

  const { error } = await supabase.from('connections').insert({
    from_user_id: me,
    to_user_id: targetId,
    status: 'pending',
    type: 'manual'
  });

  if (error) {
    console.error('[Connect] Insert error:', error);
    showNotification('Request already exists or failed.', 'warning');
  } else {
    showNotification('Connection request sent!', 'success');
  }
}

/* =========================================================
3) Notifications Dropdown 🔔
========================================================= */
async function initNotifications() {
  const btn = document.getElementById('notifications-btn');
  const badge = document.getElementById('notifications-badge');
  const dropdown = document.getElementById('notifications-dropdown');
  const list = document.getElementById('notifications-list');
  if (!btn || !badge || !dropdown || !list) return;

  btn.addEventListener('click', () => dropdown.classList.toggle('hidden'));

  async function loadNotifications() {
    const me = await getMyProfileId();
    if (!me) { 
      badge.classList.add('hidden'); 
      list.textContent = 'Login required'; 
      return; 
    }

    const { data, error } = await supabase
      .from('connections')
      .select('id, from_user_id')
      .eq('to_user_id', me)
      .eq('status', 'pending');

    if (error || !data?.length) {
      badge.classList.add('hidden');
      list.textContent = 'No new requests';
      return;
    }

    badge.textContent = data.length;
    badge.classList.remove('hidden');

    const ids = data.map(r => r.from_user_id);
    const { data: users } = await supabase
      .from('community')
      .select('id, name, email')
      .in('id', ids);

    const names = {};
    users?.forEach(u => { names[u.id] = u.name || u.email; });

    list.innerHTML = '';
    data.forEach(req => {
      const el = document.createElement('div');
      el.className = 'notif-item';
      el.innerHTML = `
        <span>${names[req.from_user_id] || req.from_user_id}</span>
        <button class="accept-btn" data-id="${req.id}">Accept</button>
        <button class="decline-btn" data-id="${req.id}">Decline</button>
      `;
      list.appendChild(el);
    });

    list.querySelectorAll('.accept-btn').forEach(btn => {
      btn.onclick = async () => {
        await supabase.from('connections')
          .update({ status: 'accepted' })
          .eq('id', btn.dataset.id);
        showNotification('Connection accepted!', 'success');
        loadNotifications();
        loadLeaderboard('connectors');
      };
    });

    list.querySelectorAll('.decline-btn').forEach(btn => {
      btn.onclick = async () => {
        await supabase.from('connections')
          .delete()
          .eq('id', btn.dataset.id);
        showNotification('Request declined.', 'info');
        loadNotifications();
      };
    });
  }

  loadNotifications();
  setInterval(loadNotifications, 30000);
}

function initNotificationsRealtime() {
  supabase.channel('connections-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'connections' }, () => {
      initNotifications();
    })
    .subscribe();
}

/* =========================================================
Helper: Build User Card with Skills + Connect Button
========================================================= */
function generateUserCard(person) {
  const card = document.createElement('div');
  card.className = 'user-card';

  const avatar = person.image_url || 'https://via.placeholder.com/80';
  const name = person.name || 'Anonymous User';
  const email = person.email || '';
  const availability = person.availability || 'Unknown';

  // Normalize both skills & interests
  const skills = normalizeField(person.skills);
  const interests = normalizeField(person.interests);

  const skillChips = [...skills, ...interests].map(skill => {
    const lower = skill.toLowerCase();
    const color = SKILL_COLORS[lower] || '#555'; // default grey
    return `
      <div class="skill-chip" style="background-color:${color}">
        <span>${skill}</span>
        <button class="endorse-btn" data-user-id="${person.id}" data-skill="${skill}">+</button>
      </div>
    `;
  }).join('');

  card.innerHTML = `
    <img src="${avatar}" alt="${name}" class="user-avatar">
    <h3>${name}</h3>
    ${email ? `<p class="email">${email}</p>` : ''}
    <p class="availability">Availability: ${availability}</p>
    <div class="skills-list">${skillChips}</div>
    <button class="connect-btn" data-user-id="${person.id}">🤝 Connect</button>
  `;

  // Endorse buttons
  card.querySelectorAll('.endorse-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const targetId = btn.getAttribute('data-user-id');
      const skill = btn.getAttribute('data-skill');
      await endorseSkill(targetId, skill);
    });
  });

  // Connect button
  card.querySelector('.connect-btn').addEventListener('click', async (e) => {
    e.stopPropagation();
    const targetId = e.target.getAttribute('data-user-id');
    await connectToUser(targetId);
  });

  return card;
}
/* =========================================================
4) Tabs + Search
========================================================= */
function initTabs() {
  const buttons = document.querySelectorAll('.tab-button');
  const panes = document.querySelectorAll('.tab-content-pane');
  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      buttons.forEach((b) => b.classList.remove('active'));
      panes.forEach((p) => p.classList.remove('active-tab-pane'));
      btn.classList.add('active');
      const target = btn.dataset.tab;
      document.getElementById(target)?.classList.add('active-tab-pane');
    });
  });
}

function initSearch() {
  const root = document.getElementById('search');
  if (!root) return;

  const findTeamBtn = root.querySelector('#find-team-btn');
  const searchNameBtn = root.querySelector('#search-name-btn');
  const skillsInput = root.querySelector('#teamSkillsInput');

  // --- Search by Required Skills ---
  if (findTeamBtn && skillsInput) {
    findTeamBtn.addEventListener('click', async () => {
      const required = parseRequiredSkills(skillsInput.value);
      if (!required.length) return;

      try {
        // Proper use of .cs. for ARRAY columns
        const { data, error } = await supabase
          .from('community')
          .select('*')
          .or(`skills.cs.{${required.join(',')}},interests.cs.{${required.join(',')}}`);

        if (error) {
          console.error('[Search] Supabase error:', error);
          showNotification('Search failed: ' + error.message, 'error');
          return;
        }

        // Filter users that have *all* required skills
        const strictMatches = filterAllOfRequired(data, required);
        await renderResults(strictMatches);

      } catch (err) {
        console.error('[Search] Unexpected error:', err);
        showNotification('Unexpected search error', 'error');
      }
    });
  }

  // --- Search by Name ---
  if (searchNameBtn) {
    searchNameBtn.addEventListener('click', async () => {
      const name = root.querySelector('#nameInput')?.value.trim();
      if (!name) return;

      try {
        const { data, error } = await supabase
          .from('community')
          .select('*')
          .ilike('name', `%${name}%`);

        if (error) {
          console.error('[Search] Name error:', error);
          showNotification('Name search failed: ' + error.message, 'error');
          return;
        }

        await renderResults(data);

      } catch (err) {
        console.error('[Search] Unexpected error:', err);
        showNotification('Unexpected name search error', 'error');
      }
    });
  }

  // --- Autocomplete setup ---
  attachAutocomplete('search', 'teamSkillsInput', '#autocomplete-team-skills');
}


/* =========================================================
5) Endorsements
========================================================= */
async function endorseSkill(userId, skill) {
  const me = await getMyProfileId();
  if (!me) return showNotification('Login required.', 'error');
  if (!skill) return showNotification('Invalid skill.', 'error');

 const { error } = await supabase.from('endorsements').insert({
  endorsed_user_id: userId,
  endorsed_by: me,
  skill,
  created_at: new Date().toISOString()
});

  if (error) {
    console.error('[Endorse] Error:', error);
    showNotification('Could not endorse.', 'error');
  } else {
    showNotification(`You endorsed ${skill}`, 'success');
  }
}

/* =========================================================
6) Render Results
========================================================= */
async function renderResults(data) {
  const cardContainer = document.getElementById('cardContainer');
  const noResults = document.getElementById('noResults');
  const matchNotification = document.getElementById('matchNotification');

  if (!cardContainer || !noResults || !matchNotification) return;

  cardContainer.innerHTML = '';
  noResults.classList.add('hidden');
  matchNotification.classList.add('hidden');

  if (!data || data.length === 0) {
    noResults.textContent = 'No matching users found.';
    noResults.classList.remove('hidden');
    return;
  }

  matchNotification.textContent = `Found ${data.length} result(s).`;
  matchNotification.classList.remove('hidden');

  data.forEach(person => {
    const card = generateUserCard(person);
    cardContainer.appendChild(card);
  });
}

/* =========================================================
7) Bootstrap
========================================================= */
document.addEventListener('DOMContentLoaded', async () => {
  console.log('[Main] App Initialized');

  await initAuth();
  initTabs();
  initSynapseView();
  initProfileForm();

  loadLeaderboard();
  await loadSkillSuggestions();
  initSearch();

  initNotifications();
  initNotificationsRealtime();
});
