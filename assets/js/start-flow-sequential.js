// ================================================================
// START Flow - Sequential Guided Wizard
// ================================================================
// Implements a step-by-step onboarding flow:
// 1. Focus (Themes) → 2. Organizations → 3. Projects → 4. People → 5. Summary
// ================================================================

console.log("%c🚀 START Flow Sequential Loading", "color:#0f8; font-weight:bold;");

// ================================================================
// STATE MANAGEMENT
// ================================================================

const wizardState = {
  currentStep: 0,
  steps: ['focus', 'organizations', 'projects', 'people', 'summary'],
  selections: {
    focus: null,
    organizations: [],
    projects: [],
    people: []
  },
  userData: null,
  supabase: null
};

// ================================================================
// AUTO-OPEN ON FIRST LOAD
// ================================================================

function shouldAutoOpenStart() {
  const hasSeenStart = localStorage.getItem('start_flow_completed');
  const lastStartDate = localStorage.getItem('start_flow_last_date');
  const today = new Date().toDateString();

  // Auto-open if never completed OR if it's a new day
  return !hasSeenStart || lastStartDate !== today;
}

// ================================================================
// STEP RENDERING
// ================================================================

function renderCurrentStep() {
  const container = document.getElementById('start-options-container');
  if (!container) return;

  const step = wizardState.steps[wizardState.currentStep];

  console.log(`📍 Rendering step ${wizardState.currentStep + 1}/${wizardState.steps.length}: ${step}`);

  if (step === 'summary') {
    renderSummaryStep(container);
    resetSynapseView();
  } else {
    renderSelectionStep(container, step);
    // Update synapse view to highlight relevant nodes
    updateSynapseForStep(step);
    showSynapseProgress();
  }
}

async function renderSelectionStep(container, stepType) {
  // Show loading state
  container.innerHTML = `
    <div style="text-align: center; padding: 2rem; color: rgba(255,255,255,0.5);">
      <i class="fas fa-spinner fa-spin" style="font-size: 2rem; margin-bottom: 1rem;"></i>
      <p>Loading recommendations...</p>
    </div>
  `;

  try {
    const supabase = wizardState.supabase || window.supabase;
    const currentUser = wizardState.userData;

    if (!currentUser || !supabase) {
      throw new Error('User data not available');
    }

    // Load data for this step
    let items = [];
    let config = {};

    switch (stepType) {
      case 'focus':
        items = await loadThemes(supabase, currentUser);
        config = {
          title: 'Start with this focus',
          subtitle: 'Select a theme that matches your interests',
          icon: 'compass',
          color: '#00e0ff',
          multiSelect: false
        };
        break;

      case 'organizations':
        items = await loadOrganizations(supabase, currentUser);
        config = {
          title: 'Discover Organizations',
          subtitle: 'Find organizations in your field',
          icon: 'building',
          color: '#a855f7',
          multiSelect: true
        };
        break;

      case 'projects':
        items = await loadProjects(supabase, currentUser);
        config = {
          title: 'See active projects',
          subtitle: 'Join projects that need your skills',
          icon: 'rocket',
          color: '#ff6b6b',
          multiSelect: true
        };
        break;

      case 'people':
        items = await loadPeople(supabase, currentUser);
        config = {
          title: 'Meet people nearby',
          subtitle: 'Connect with people who share your interests',
          icon: 'users',
          color: '#ffd700',
          multiSelect: true
        };
        break;
    }

    // Render step UI
    container.innerHTML = generateStepHTML(stepType, items, config);

    // Wire up event handlers
    wireStepHandlers(stepType, config.multiSelect);

  } catch (error) {
    console.error('Error rendering step:', error);
    container.innerHTML = `
      <div style="text-align: center; padding: 2rem; color: rgba(255,107,107,0.7);">
        <i class="fas fa-exclamation-triangle" style="font-size: 2rem; margin-bottom: 1rem;"></i>
        <p>Unable to load recommendations. Click Continue to skip this step.</p>
        <button onclick="window.startFlowSequential.nextStep()" style="margin-top: 1rem; padding: 0.75rem 2rem; background: #00e0ff; border: none; border-radius: 8px; color: #000; font-weight: 600; cursor: pointer;">
          Continue
        </button>
      </div>
    `;
  }
}

function generateStepHTML(stepType, items, config) {
  const stepNumber = wizardState.currentStep + 1;
  const totalSteps = wizardState.steps.length - 1; // Exclude summary from count

  const itemsHTML = items.slice(0, 5).map(item => {
    const isSelected = wizardState.selections[stepType]?.includes?.(item.id) ||
                      wizardState.selections[stepType]?.id === item.id;

    return `
      <div class="start-item" data-id="${item.id}" style="
        background: ${isSelected ? 'rgba(0,224,255,0.15)' : 'rgba(0,0,0,0.3)'};
        border: 2px solid ${isSelected ? config.color : 'rgba(255,255,255,0.2)'};
        border-radius: 12px;
        padding: 1.25rem;
        margin-bottom: 1rem;
        cursor: pointer;
        transition: all 0.2s ease;
      ">
        <div style="display: flex; align-items: center; gap: 1rem;">
          ${item.image_url || item.logo_url ? `
            <img src="${item.image_url || item.logo_url}" style="width: 48px; height: 48px; border-radius: 50%; object-fit: cover;" />
          ` : `
            <div style="width: 48px; height: 48px; border-radius: 50%; background: ${config.color}40; display: flex; align-items: center; justify-content: center; color: ${config.color}; font-weight: bold; font-size: 1.2rem;">
              ${(item.name || item.title || '?').charAt(0).toUpperCase()}
            </div>
          `}
          <div style="flex: 1;">
            <div style="color: white; font-weight: 600; font-size: 1rem; margin-bottom: 0.25rem;">
              ${item.name || item.title}
            </div>
            <div style="color: rgba(255,255,255,0.6); font-size: 0.85rem;">
              ${item.description || item.bio || ''}
            </div>
          </div>
          ${isSelected ? `
            <div style="color: ${config.color}; font-size: 1.5rem;">
              <i class="fas fa-check-circle"></i>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');

  return `
    <div style="padding: 0 0.5rem;">
      <!-- Progress indicator -->
      <div style="margin-bottom: 2rem;">
        <div style="color: rgba(255,255,255,0.5); font-size: 0.85rem; margin-bottom: 0.5rem;">
          Step ${stepNumber} of ${totalSteps}
        </div>
        <div style="background: rgba(255,255,255,0.1); height: 4px; border-radius: 2px; overflow: hidden;">
          <div style="background: ${config.color}; height: 100%; width: ${(stepNumber / totalSteps) * 100}%; transition: width 0.3s ease;"></div>
        </div>
      </div>

      <!-- Step header -->
      <div style="text-align: center; margin-bottom: 2rem;">
        <div style="font-size: 3rem; color: ${config.color}; margin-bottom: 0.5rem;">
          <i class="fas fa-${config.icon}"></i>
        </div>
        <h2 style="color: white; font-size: 1.75rem; margin: 0 0 0.5rem 0; font-weight: 700;">
          ${config.title}
        </h2>
        <p style="color: rgba(255,255,255,0.7); font-size: 1rem; margin: 0;">
          ${config.subtitle}
        </p>
      </div>

      <!-- Items list -->
      <div id="start-items-list" style="max-height: 400px; overflow-y: auto; margin-bottom: 2rem;">
        ${itemsHTML.length > 0 ? itemsHTML : `
          <div style="text-align: center; padding: 2rem; color: rgba(255,255,255,0.5);">
            <p>No recommendations available at this time.</p>
          </div>
        `}
      </div>

      <!-- Action buttons -->
      <div style="display: flex; gap: 1rem; margin-top: 2rem;">
        <button id="skip-step-btn" style="
          flex: 1;
          padding: 1rem;
          background: rgba(255,255,255,0.1);
          border: 1px solid rgba(255,255,255,0.3);
          border-radius: 10px;
          color: white;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        ">
          Skip
        </button>
        <button id="continue-step-btn" style="
          flex: 2;
          padding: 1rem;
          background: linear-gradient(135deg, ${config.color}, ${config.color}cc);
          border: none;
          border-radius: 10px;
          color: ${stepType === 'people' || stepType === 'focus' ? '#000' : '#000'};
          font-weight: 700;
          cursor: pointer;
          font-size: 1.1rem;
          transition: all 0.2s;
          box-shadow: 0 4px 15px ${config.color}40;
        ">
          Continue
        </button>
      </div>
    </div>
  `;
}

function renderSummaryStep(container) {
  const summary = generateSummary();

  container.innerHTML = `
    <div style="padding: 0 0.5rem;">
      <!-- Completion header -->
      <div style="text-align: center; margin-bottom: 2rem;">
        <div style="font-size: 4rem; color: #00ff88; margin-bottom: 1rem;">
          <i class="fas fa-check-circle"></i>
        </div>
        <h2 style="color: white; font-size: 2rem; margin: 0 0 0.5rem 0; font-weight: 700;">
          Great Start!
        </h2>
        <p style="color: rgba(255,255,255,0.7); font-size: 1rem; margin: 0;">
          Here's what you've discovered
        </p>
      </div>

      <!-- Summary content -->
      <div style="background: rgba(0,0,0,0.3); border-radius: 12px; padding: 1.5rem; margin-bottom: 2rem;">
        ${summary.html}
      </div>

      <!-- Action buttons -->
      <div style="display: flex; flex-direction: column; gap: 1rem;">
        <button id="save-summary-btn" style="
          width: 100%;
          padding: 1rem;
          background: linear-gradient(135deg, #00ff88, #00e0ff);
          border: none;
          border-radius: 10px;
          color: #000;
          font-weight: 700;
          cursor: pointer;
          font-size: 1.1rem;
          transition: all 0.2s;
          box-shadow: 0 4px 15px rgba(0,255,136,0.3);
        ">
          <i class="fas fa-download"></i> Save Summary
        </button>
        <button id="close-summary-btn" style="
          width: 100%;
          padding: 1rem;
          background: rgba(255,255,255,0.1);
          border: 1px solid rgba(255,255,255,0.3);
          border-radius: 10px;
          color: white;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        ">
          Close
        </button>
      </div>
    </div>
  `;

  // Wire up summary buttons
  document.getElementById('save-summary-btn')?.addEventListener('click', () => {
    saveSummaryToFile(summary.text);
  });

  document.getElementById('close-summary-btn')?.addEventListener('click', () => {
    completeStartFlow();
  });
}

// ================================================================
// DATA LOADERS
// ================================================================

async function loadThemes(supabase, currentUser) {
  const { data } = await supabase
    .from('theme_circles')
    .select('id, title, description, participant_count')
    .eq('status', 'active')
    .gt('expires_at', new Date().toISOString())
    .order('activity_score', { ascending: false })
    .limit(5);

  return (data || []).map(t => ({ ...t, name: t.title }));
}

async function loadOrganizations(supabase, currentUser) {
  const { data } = await supabase
    .from('organizations')
    .select('id, name, description, logo_url')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(5);

  return data || [];
}

async function loadProjects(supabase, currentUser) {
  const { data } = await supabase
    .from('projects')
    .select('id, title, description, image_url')
    .in('status', ['open', 'active'])
    .order('created_at', { ascending: false })
    .limit(5);

  return (data || []).map(p => ({ ...p, name: p.title }));
}

async function loadPeople(supabase, currentUser) {
  const { data } = await supabase
    .from('community')
    .select('id, name, bio, image_url')
    .neq('id', currentUser.id)
    .limit(5);

  return data || [];
}

// ================================================================
// EVENT HANDLERS
// ================================================================

function wireStepHandlers(stepType, multiSelect) {
  // Item selection
  document.querySelectorAll('.start-item').forEach(item => {
    item.addEventListener('click', () => {
      const id = item.dataset.id;
      handleItemSelection(stepType, id, multiSelect);

      // Update visual state in modal
      if (multiSelect) {
        const isNowSelected = wizardState.selections[stepType].includes(id);
        item.style.background = isNowSelected ? 'rgba(0,224,255,0.15)' : 'rgba(0,0,0,0.3)';
        item.style.borderColor = isNowSelected ? getStepColor(stepType) : 'rgba(255,255,255,0.2)';
      } else {
        // Deselect all others
        document.querySelectorAll('.start-item').forEach(i => {
          i.style.background = 'rgba(0,0,0,0.3)';
          i.style.borderColor = 'rgba(255,255,255,0.2)';
        });
        item.style.background = 'rgba(0,224,255,0.15)';
        item.style.borderColor = getStepColor(stepType);
      }

      // Update synapse visualization
      updateSynapseForSelection(stepType, id);
    });
  });

  // Continue button
  document.getElementById('continue-step-btn')?.addEventListener('click', () => {
    nextStep();
  });

  // Skip button
  document.getElementById('skip-step-btn')?.addEventListener('click', () => {
    nextStep();
  });
}

function handleItemSelection(stepType, itemId, multiSelect) {
  if (multiSelect) {
    const selections = wizardState.selections[stepType];
    const index = selections.indexOf(itemId);
    if (index > -1) {
      selections.splice(index, 1);
    } else {
      selections.push(itemId);
    }
  } else {
    wizardState.selections[stepType] = { id: itemId };
  }

  console.log('Selection updated:', wizardState.selections);
}

function getStepColor(stepType) {
  const colors = {
    focus: '#00e0ff',
    organizations: '#a855f7',
    projects: '#ff6b6b',
    people: '#ffd700'
  };
  return colors[stepType] || '#00e0ff';
}

// ================================================================
// SYNAPSE VISUALIZATION INTEGRATION
// ================================================================

function updateSynapseForStep(stepType) {
  console.log('🎨 Updating synapse view for step:', stepType);

  // Get all nodes in the synapse
  const svg = window.d3?.select('#synapse-svg') || window.d3?.select('#synapse-network-svg');
  if (!svg || svg.empty()) {
    console.warn('⚠️ Synapse SVG not found');
    return;
  }

  // Reset all nodes to default state first
  svg.selectAll('.synapse-node, .theme-card, .start-item')
    .transition()
    .duration(400)
    .style('opacity', 0.3)
    .style('filter', 'none');

  // Highlight nodes based on current step
  const color = getStepColor(stepType);

  switch (stepType) {
    case 'focus':
      // Highlight theme circles
      svg.selectAll('.theme-container, [data-type="theme"]')
        .transition()
        .duration(600)
        .style('opacity', 1)
        .style('filter', `drop-shadow(0 0 10px ${color})`);
      break;

    case 'organizations':
      // Highlight organization nodes
      svg.selectAll('[data-type="organization"], .org-node')
        .transition()
        .duration(600)
        .style('opacity', 1)
        .style('filter', `drop-shadow(0 0 10px ${color})`);
      break;

    case 'projects':
      // Highlight project nodes
      svg.selectAll('[data-type="project"], .project-node')
        .transition()
        .duration(600)
        .style('opacity', 1)
        .style('filter', `drop-shadow(0 0 10px ${color})`);
      break;

    case 'people':
      // Highlight person nodes
      svg.selectAll('[data-type="person"], .person-node')
        .transition()
        .duration(600)
        .style('opacity', 1)
        .style('filter', `drop-shadow(0 0 10px ${color})`);
      break;
  }
}

function updateSynapseForSelection(stepType, itemId) {
  console.log('✨ Highlighting selection in synapse:', stepType, itemId);

  const svg = window.d3?.select('#synapse-svg') || window.d3?.select('#synapse-network-svg');
  if (!svg || svg.empty()) return;

  const color = getStepColor(stepType);
  const isSelected = wizardState.selections[stepType]?.includes?.(itemId) ||
                     wizardState.selections[stepType]?.id === itemId;

  // Find and highlight/unhighlight the specific node
  const selector = `[data-id="${itemId}"], [data-node-id="${itemId}"], [data-theme-id="${itemId}"]`;
  const node = svg.select(selector);

  if (!node.empty()) {
    if (isSelected) {
      // Highlight selected node
      node
        .transition()
        .duration(300)
        .style('opacity', 1)
        .style('filter', `drop-shadow(0 0 15px ${color})`)
        .style('transform', 'scale(1.1)');
    } else {
      // Unhighlight deselected node
      node
        .transition()
        .duration(300)
        .style('opacity', 0.3)
        .style('filter', 'none')
        .style('transform', 'scale(1)');
    }
  }
}

function showSynapseProgress() {
  // Show overlay message indicating current step
  const step = wizardState.steps[wizardState.currentStep];
  const messages = {
    focus: 'Select a theme that matches your interests',
    organizations: 'Discover organizations in your field',
    projects: 'Find projects that need your skills',
    people: 'Connect with people nearby'
  };

  const message = messages[step];
  if (!message) return;

  // Create or update overlay
  let overlay = document.getElementById('synapse-step-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'synapse-step-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 120px;
      left: 50%;
      transform: translateX(-50%);
      background: linear-gradient(135deg, rgba(10,14,39,0.95), rgba(26,26,46,0.95));
      border: 2px solid ${getStepColor(step)};
      border-radius: 12px;
      padding: 1rem 2rem;
      color: ${getStepColor(step)};
      font-size: 1rem;
      font-weight: 600;
      z-index: 9999;
      pointer-events: none;
      box-shadow: 0 10px 30px rgba(0,0,0,0.5);
      opacity: 0;
      transition: all 0.3s ease;
    `;
    document.body.appendChild(overlay);
  }

  overlay.textContent = message;
  overlay.style.borderColor = getStepColor(step);
  overlay.style.color = getStepColor(step);

  // Fade in
  setTimeout(() => {
    overlay.style.opacity = '1';
  }, 100);

  // Auto-hide after 3 seconds
  setTimeout(() => {
    overlay.style.opacity = '0';
  }, 3000);
}

function resetSynapseView() {
  console.log('🔄 Resetting synapse view');

  const svg = window.d3?.select('#synapse-svg') || window.d3?.select('#synapse-network-svg');
  if (!svg || svg.empty()) return;

  // Reset all nodes to full opacity
  svg.selectAll('.synapse-node, .theme-container, .theme-card')
    .transition()
    .duration(600)
    .style('opacity', 1)
    .style('filter', 'none')
    .style('transform', 'scale(1)');

  // Remove overlay
  const overlay = document.getElementById('synapse-step-overlay');
  if (overlay) overlay.remove();
}

// ================================================================
// NAVIGATION
// ================================================================

function nextStep() {
  wizardState.currentStep++;

  if (wizardState.currentStep >= wizardState.steps.length) {
    completeStartFlow();
    return;
  }

  renderCurrentStep();
}

function completeStartFlow() {
  localStorage.setItem('start_flow_completed', 'true');
  localStorage.setItem('start_flow_last_date', new Date().toDateString());

  // Reset synapse view to normal
  resetSynapseView();

  // Close modal
  if (typeof window.closeStartModal === 'function') {
    window.closeStartModal();
  } else {
    const modal = document.getElementById('start-modal');
    const backdrop = document.getElementById('start-modal-backdrop');
    if (modal) modal.style.display = 'none';
    if (backdrop) backdrop.style.display = 'none';
  }

  console.log('✅ START flow completed');
}

// ================================================================
// SUMMARY GENERATION
// ================================================================

function generateSummary() {
  const parts = [];
  let htmlParts = [];

  // Focus/Theme
  if (wizardState.selections.focus?.id) {
    parts.push(`FOCUS: Selected theme`);
    htmlParts.push(`
      <div style="margin-bottom: 1rem;">
        <div style="color: #00e0ff; font-weight: 600; margin-bottom: 0.5rem;">
          <i class="fas fa-compass"></i> Your Focus
        </div>
        <div style="color: rgba(255,255,255,0.8);">Theme selected</div>
      </div>
    `);
  }

  // Organizations
  if (wizardState.selections.organizations.length > 0) {
    parts.push(`ORGANIZATIONS: ${wizardState.selections.organizations.length} selected`);
    htmlParts.push(`
      <div style="margin-bottom: 1rem;">
        <div style="color: #a855f7; font-weight: 600; margin-bottom: 0.5rem;">
          <i class="fas fa-building"></i> Organizations
        </div>
        <div style="color: rgba(255,255,255,0.8);">${wizardState.selections.organizations.length} organizations to explore</div>
      </div>
    `);
  }

  // Projects
  if (wizardState.selections.projects.length > 0) {
    parts.push(`PROJECTS: ${wizardState.selections.projects.length} selected`);
    htmlParts.push(`
      <div style="margin-bottom: 1rem;">
        <div style="color: #ff6b6b; font-weight: 600; margin-bottom: 0.5rem;">
          <i class="fas fa-rocket"></i> Projects
        </div>
        <div style="color: rgba(255,255,255,0.8);">${wizardState.selections.projects.length} projects to join</div>
      </div>
    `);
  }

  // People
  if (wizardState.selections.people.length > 0) {
    parts.push(`PEOPLE: ${wizardState.selections.people.length} selected`);
    htmlParts.push(`
      <div style="margin-bottom: 1rem;">
        <div style="color: #ffd700; font-weight: 600; margin-bottom: 0.5rem;">
          <i class="fas fa-users"></i> People
        </div>
        <div style="color: rgba(255,255,255,0.8);">${wizardState.selections.people.length} people to connect with</div>
      </div>
    `);
  }

  if (parts.length === 0) {
    parts.push('You explored the network!');
    htmlParts.push(`
      <div style="color: rgba(255,255,255,0.7); text-align: center;">
        You took a tour of the network. Great start!
      </div>
    `);
  }

  return {
    text: `Charleston Hacks - Your Start Summary\n\n${parts.join('\n')}\n\nDate: ${new Date().toLocaleDateString()}`,
    html: htmlParts.join('')
  };
}

function saveSummaryToFile(content) {
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `charleston-hacks-summary-${new Date().toISOString().split('T')[0]}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  console.log('✅ Summary saved to file');
}

// ================================================================
// INITIALIZATION
// ================================================================

function initSequentialFlow(userData, supabase) {
  wizardState.userData = userData;
  wizardState.supabase = supabase;
  wizardState.currentStep = 0;

  // Reset selections
  wizardState.selections = {
    focus: null,
    organizations: [],
    projects: [],
    people: []
  };

  // Prepare synapse view for guided flow
  console.log('🎨 Preparing synapse view for START flow');

  renderCurrentStep();
}

// ================================================================
// PUBLIC API
// ================================================================

window.startFlowSequential = {
  init: initSequentialFlow,
  shouldAutoOpen: shouldAutoOpenStart,
  nextStep: nextStep,
  complete: completeStartFlow
};

console.log('✅ START Flow Sequential ready');
