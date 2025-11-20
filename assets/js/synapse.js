// ============================================================================
// CharlestonHacks – Synapse View 3.1 (2025)
// ---------------------------------------------------------------------------
// ✓ Works with Option B (email → backfill → user_id)
// ✓ Safe for old community rows that lacked user_id until login
// ✓ Only loads nodes with a valid row (id, name, skills, image_url)
// ✓ Robust null handling to prevent graph crashes
// ✓ Fullscreen operation, ESC exit supported
// ✓ D3 Force Simulation with auto-resize
// ============================================================================

import { supabase } from "./supabaseClient.js";

// DOM
const container = document.getElementById("synapse-container");
const svg = d3.select("#synapse-svg");

// Graph state
let simulation = null;
let nodes = [];
let links = [];

/* ============================================================================
   INIT SYNAPSE VIEW
============================================================================ */
export async function initSynapseView() {
  console.log("🧠 Initializing Synapse View…");

  // Prevent re-initializing multiple times
  if (svg.selectAll("*").size() > 0) {
    console.log("Synapse already initialized. Skipping reload.");
    return;
  }

  const data = await loadCommunityData();
  if (!data || data.length === 0) {
    console.warn("No community data available for Synapse view.");
    return;
  }

  buildGraph(data);
}

/* ============================================================================
   LOAD COMMUNITY DATA – Hardened for Option B
============================================================================ */
async function loadCommunityData() {
  try {
    const { data: auth } = await supabase.auth.getSession();
