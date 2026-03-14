// loadConnections.js
import { supabaseClient } from './supabaseClient.js';
import { generateUserCardHTML } from './cardRenderer.js';
import { DOMElements } from './globals.js';

// 🔍 Search by required skills
export async function searchBySkills(requiredSkills) {
  try {
    const { data, error } = await supabaseClient
      .from('community')
      .select('*')
      .contains('skills', requiredSkills);

    if (error) throw error;

    // Clear container
    DOMElements.cardContainer.innerHTML = '';

    // Render cards
    for (const user of data) {
      const cardHTML = await generateUserCardHTML(user);
      DOMElements.cardContainer.insertAdjacentHTML('beforeend', cardHTML);
    }

  } catch (err) {
    console.error('[SearchBySkills]', err);
    DOMElements.cardContainer.innerHTML = '<p>Error loading users.</p>';
  }
}

// 🔍 Search by name (first or last)
export async function searchByName(name) {
  try {
    const { data, error } = await supabaseClient
      .from('community')
      .select('*')
      .or(`first_name.ilike.%${name}%,last_name.ilike.%${name}%`);

    if (error) throw error;

    DOMElements.cardContainer.innerHTML = '';

    for (const user of data) {
      const cardHTML = await generateUserCardHTML(user);
      DOMElements.cardContainer.insertAdjacentHTML('beforeend', cardHTML);
    }

  } catch (err) {
    console.error('[SearchByName]', err);
    DOMElements.cardContainer.innerHTML = '<p>Error loading users.</p>';
  }
}

// 👥 Build a "best team" based on skills + team size
export async function buildBestTeam(requiredSkills, teamSize) {
  try {
    const { data, error } = await supabaseClient
      .from('community')
      .select('*')
      .contains('skills', requiredSkills);

    if (error) throw error;

    // Simple slice → first N users
    const team = data.slice(0, teamSize);

    DOMElements.bestTeamContainer.innerHTML = '';
    for (const user of team) {
      const cardHTML = await generateUserCardHTML(user);
      DOMElements.bestTeamContainer.insertAdjacentHTML('beforeend', cardHTML);
    }

  } catch (err) {
    console.error('[BuildBestTeam]', err);
    DOMElements.bestTeamContainer.innerHTML = '<p>Error building team.</p>';
  }
}

// Fetch all connections for the neural network graph.
// Returns an array of { from_id, to_id } objects as expected by neuralInteractive.js.
export async function fetchConnections() {
  try {
    const { data, error } = await supabaseClient
      .from('connections')
      .select('from_id, to_id');

    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('[fetchConnections]', err);
    return [];
  }
}
