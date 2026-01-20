// ================================================================
// START Flow - Complete Redesign & Audit Implementation
// ================================================================
// The central hub for user engagement - potentially the only thing users need
// Features:
// - Daily personalized recommendations across ALL entities
// - Organizations integration
// - Real activity tracking
// - Persistent learning system
// - Comprehensive ecosystem view
// ================================================================

console.log("%c🚀 START Flow Redesigned - Loading", "color:#0f8; font-weight:bold; font-size:14px;");

// ================================================================
// CORE STATE MANAGEMENT
// ================================================================

const StartFlowState = {
  // User context
  currentUser: null,
  supabase: null,
  
  // Daily state
  todaysDate: new Date().toISOString().split('T')[0],
  dailyRecommendations: null,
  lastCalculated: null,
  
  // Session state
  sessionFocus: null,
  sessionActions: [],
  sessionStartTime: null,
  
  // Learning system
  userPreferences: {},
  activityHistory: [],
  
  // Cache
  cachedData: {
    themes: null,
    projects: null,
    people: null,
    organizations: null,
    opportunities: null,
    lastUpdated: null
  }
};

// ================================================================
// INITIALIZATION & SETUP
// ================================================================

/**
 * Initialize the redesigned START flow system
 */
async function initializeStartFlow() {
  console.log('🎯 Initializing redesigned START flow...');
  
  try {
    // Wait for dependencies
    await waitForDependencies();
    
    // Load user context
    await loadUserContext();
    
    // Load user preferences and history
    await loadUserLearningData();
    
    // Calculate daily recommendations
    await calculateDailyRecommendations();
    
    // Setup event listeners
    setupEventListeners();
    
    // Setup daily refresh
    setupDailyRefresh();
    
    console.log('✅ START flow redesigned system ready');
    
  } catch (error) {
    console.error('❌ Failed to initialize START flow:', error);
    // Fallback to basic mode
    initializeFallbackMode();
  }
}

/**
 * Load user learning data and preferences
 */
async function loadUserLearningData() {
  console.log('📚 Loading user learning data...');
  
  try {
    // Load user preferences from localStorage
    const storedPreferences = localStorage.getItem('start_user_preferences');
    if (storedPreferences) {
      StartFlowState.userPreferences = JSON.parse(storedPreferences);
    }
    
    // Load activity history from localStorage
    const storedHistory = localStorage.getItem('start_activity_history');
    if (storedHistory) {
      StartFlowState.activityHistory = JSON.parse(storedHistory);
    }
    
    console.log('✅ User learning data loaded');
  } catch (error) {
    console.warn('⚠️ Failed to load user learning data:', error);
    // Continue with empty data
    StartFlowState.userPreferences = {};
    StartFlowState.activityHistory = [];
  }
}

/**
 * Initialize fallback mode when main system fails
 */
function initializeFallbackMode() {
  console.log('🔄 Initializing START flow fallback mode...');
  
  // Set fallback state
  StartFlowState.fallbackMode = true;
  
  // Provide basic functionality
  window.StartFlowRedesigned = {
    initialize: () => Promise.resolve(),
    calculateDailyRecommendations: () => Promise.resolve(null),
    loadEcosystemData: () => Promise.resolve({}),
    state: StartFlowState
  };
  
  console.log('✅ Fallback mode initialized');
}

/**
 * Wait for required dependencies to be available
 */
async function waitForDependencies() {
  const maxAttempts = 20;
  let attempts = 0;
  
  while (attempts < maxAttempts) {
    if (window.supabase && window.currentUserProfile) {
      StartFlowState.supabase = window.supabase;
      StartFlowState.currentUser = window.currentUserProfile;
      return;
    }
    
    await new Promise(resolve => setTimeout(resolve, 500));
    attempts++;
  }
  
  throw new Error('Required dependencies not available');
}

/**
 * Load user context and profile data
 */
async function loadUserContext() {
  if (!StartFlowState.currentUser || !StartFlowState.supabase) {
    throw new Error('User context not available');
  }
  
  console.log('👤 Loading user context for:', StartFlowState.currentUser.name);
  
  // Load additional user data if needed
  const { data: extendedProfile } = await StartFlowState.supabase
    .from('community')
    .select('*')
    .eq('id', StartFlowState.currentUser.id)
    .single();
    
  if (extendedProfile) {
    StartFlowState.currentUser = { ...StartFlowState.currentUser, ...extendedProfile };
  }
}

/**
 * Setup event listeners for the START flow system
 */
function setupEventListeners() {
  console.log('🎧 Setting up START flow event listeners...');
  
  // Listen for profile updates
  window.addEventListener('profile-updated', () => {
    console.log('👤 Profile updated, refreshing recommendations...');
    calculateDailyRecommendations();
  });
  
  // Listen for theme participation changes
  window.addEventListener('theme-participation-changed', () => {
    console.log('🎯 Theme participation changed, refreshing recommendations...');
    calculateDailyRecommendations();
  });
  
  // Listen for project membership changes
  window.addEventListener('project-membership-changed', () => {
    console.log('💡 Project membership changed, refreshing recommendations...');
    calculateDailyRecommendations();
  });
  
  console.log('✅ Event listeners setup complete');
}

/**
 * Setup daily refresh system for recommendations
 */
function setupDailyRefresh() {
  console.log('📅 Setting up daily refresh system...');
  
  // Check for new day every hour
  setInterval(() => {
    const today = new Date().toISOString().split('T')[0];
    
    if (StartFlowState.lastCalculated && StartFlowState.todaysDate !== today) {
      console.log('🌅 New day detected, clearing cached recommendations');
      StartFlowState.todaysDate = today;
      StartFlowState.dailyRecommendations = null;
      StartFlowState.lastCalculated = null;
      
      // Clear localStorage cache
      localStorage.removeItem('start_daily_recommendations');
      
      // Pre-calculate new recommendations
      calculateDailyRecommendations()
        .then(() => console.log('✅ New daily recommendations calculated'))
        .catch(err => console.warn('⚠️ Failed to calculate new recommendations:', err));
    }
  }, 60 * 60 * 1000); // Every hour
  
  console.log('✅ Daily refresh system active');
}

// ================================================================
// COMPREHENSIVE DATA LOADING
// ================================================================

/**
 * Load all ecosystem data for recommendations
 */
async function loadEcosystemData() {
  console.log('🌐 Loading comprehensive ecosystem data...');
  
  const now = Date.now();
  const cacheExpiry = 5 * 60 * 1000; // 5 minutes
  
  // Check cache validity
  if (StartFlowState.cachedData.lastUpdated && 
      (now - StartFlowState.cachedData.lastUpdated) < cacheExpiry) {
    console.log('📋 Using cached ecosystem data');
    return StartFlowState.cachedData;
  }
  
  try {
    // Load all data in parallel for performance
    const [
      themesData,
      projectsData, 
      peopleData,
      organizationsData,
      opportunitiesData,
      userActivityData
    ] = await Promise.all([
      loadThemesData(),
      loadProjectsData(),
      loadPeopleData(),
      loadOrganizationsData(),
      loadOpportunitiesData(),
      loadUserActivityData()
    ]);
    
    // Cache the results
    StartFlowState.cachedData = {
      themes: themesData,
      projects: projectsData,
      people: peopleData,
      organizations: organizationsData,
      opportunities: opportunitiesData,
      userActivity: userActivityData,
      lastUpdated: now
    };
    
    console.log('✅ Ecosystem data loaded:', {
      themes: themesData.available.length,
      projects: projectsData.available.length,
      people: peopleData.available.length,
      organizations: organizationsData.available.length,
      opportunities: opportunitiesData.available.length
    });
    
    return StartFlowState.cachedData;
    
  } catch (error) {
    console.error('❌ Failed to load ecosystem data:', error);
    throw error;
  }
}

/**
 * Load themes with user participation data
 */
async function loadThemesData() {
  const { data: themes } = await StartFlowState.supabase
    .from('theme_circles')
    .select(`
      *,
      participant_count:theme_participants(count),
      project_count:projects(count)
    `)
    .eq('status', 'active')
    .gt('expires_at', new Date().toISOString())
    .order('activity_score', { ascending: false });
    
  const { data: userThemes } = await StartFlowState.supabase
    .from('theme_participants')
    .select('theme_id, engagement_level')
    .eq('community_id', StartFlowState.currentUser.id);
    
  const userThemeIds = new Set((userThemes || []).map(t => t.theme_id));
  
  return {
    all: themes || [],
    available: (themes || []).filter(t => !userThemeIds.has(t.id)),
    userParticipating: userThemes || []
  };
}

/**
 * Load projects with user membership data
 */
async function loadProjectsData() {
  const { data: projects } = await StartFlowState.supabase
    .from('projects')
    .select(`
      *,
      member_count:project_members(count),
      theme:theme_circles(title, id)
    `)
    .in('status', ['open', 'active', 'in-progress'])
    .order('created_at', { ascending: false });
    
  const { data: userProjects } = await StartFlowState.supabase
    .from('project_members')
    .select('project_id, role')
    .eq('user_id', StartFlowState.currentUser.id);
    
  const userProjectIds = new Set((userProjects || []).map(p => p.project_id));
  
  return {
    all: projects || [],
    available: (projects || []).filter(p => !userProjectIds.has(p.id)),
    userMember: userProjects || []
  };
}

/**
 * Load people with connection data
 */
async function loadPeopleData() {
  const { data: people } = await StartFlowState.supabase
    .from('community')
    .select('id, name, email, image_url, skills, interests, bio, location')
    .neq('id', StartFlowState.currentUser.id)
    .limit(50);
    
  const { data: connections } = await StartFlowState.supabase
    .from('connections')
    .select('from_user_id, to_user_id, status')
    .or(`from_user_id.eq.${StartFlowState.currentUser.id},to_user_id.eq.${StartFlowState.currentUser.id}`);
    
  const connectedIds = new Set();
  (connections || []).forEach(conn => {
    if (conn.from_user_id === StartFlowState.currentUser.id) {
      connectedIds.add(conn.to_user_id);
    }
    if (conn.to_user_id === StartFlowState.currentUser.id) {
      connectedIds.add(conn.from_user_id);
    }
  });
  
  return {
    all: people || [],
    available: (people || []).filter(p => !connectedIds.has(p.id)),
    connections: connections || []
  };
}

/**
 * Load organizations data (NEW)
 */
async function loadOrganizationsData() {
  try {
    // Try the view first, fallback to direct table query
    let organizationsQuery;
    try {
      organizationsQuery = await StartFlowState.supabase
        .from('active_organizations_summary')
        .select('*')
        .order('follower_count', { ascending: false })
        .limit(20);
    } catch (viewError) {
      console.warn('⚠️ active_organizations_summary view not available, using direct query');
      organizationsQuery = await StartFlowState.supabase
        .from('organizations')
        .select(`
          id, name, slug, description, logo_url, banner_url, industry, size, location,
          website, follower_count, opportunity_count, verified, created_at
        `)
        .eq('status', 'active')
        .order('follower_count', { ascending: false })
        .limit(20);
    }
    
    const { data: organizations } = organizationsQuery;
      
    const { data: userFollowing } = await StartFlowState.supabase
      .from('organization_followers')
      .select('organization_id')
      .eq('community_id', StartFlowState.currentUser.id);
      
    const followingIds = new Set((userFollowing || []).map(f => f.organization_id));
    
    return {
      all: organizations || [],
      available: (organizations || []).filter(o => !followingIds.has(o.id)),
      userFollowing: userFollowing || []
    };
  } catch (error) {
    console.warn('⚠️ Organizations data not available (table may not exist):', error);
    return { all: [], available: [], userFollowing: [] };
  }
}

/**
 * Load opportunities data (NEW)
 */
async function loadOpportunitiesData() {
  try {
    // Try the view first, fallback to direct table query
    let opportunitiesQuery;
    try {
      opportunitiesQuery = await StartFlowState.supabase
        .from('opportunities_with_org')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(30);
    } catch (viewError) {
      console.warn('⚠️ opportunities_with_org view not available, using direct query');
      opportunitiesQuery = await StartFlowState.supabase
        .from('opportunities')
        .select(`
          *,
          organization:organizations(name, slug, logo_url, verified)
        `)
        .eq('status', 'open')
        .order('created_at', { ascending: false })
        .limit(30);
    }
    
    const { data: opportunities } = opportunitiesQuery;
      
    return {
      all: opportunities || [],
      available: opportunities || [] // TODO: Filter by user applications
    };
  } catch (error) {
    console.warn('⚠️ Opportunities data not available (table may not exist):', error);
    return { all: [], available: [] };
  }
}

/**
 * Load user activity data for better recommendations
 */
async function loadUserActivityData() {
  // TODO: Implement comprehensive activity tracking
  // For now, return basic data from existing sources
  
  const recentDays = 7;
  const since = new Date(Date.now() - recentDays * 24 * 60 * 60 * 1000).toISOString();
  
  try {
    // Get recent project activity
    const { data: recentProjects } = await StartFlowState.supabase
      .from('project_members')
      .select('project_id, created_at')
      .eq('user_id', StartFlowState.currentUser.id)
      .gte('created_at', since);
      
    // Get recent theme activity  
    const { data: recentThemes } = await StartFlowState.supabase
      .from('theme_participants')
      .select('theme_id, created_at')
      .eq('community_id', StartFlowState.currentUser.id)
      .gte('created_at', since);
      
    // Get recent connections
    const { data: recentConnections } = await StartFlowState.supabase
      .from('connections')
      .select('*')
      .or(`from_user_id.eq.${StartFlowState.currentUser.id},to_user_id.eq.${StartFlowState.currentUser.id}`)
      .gte('created_at', since);
      
    return {
      recentProjects: recentProjects || [],
      recentThemes: recentThemes || [],
      recentConnections: recentConnections || [],
      timeframe: recentDays
    };
    
  } catch (error) {
    console.warn('⚠️ Could not load activity data:', error);
    return {
      recentProjects: [],
      recentThemes: [],
      recentConnections: [],
      timeframe: recentDays
    };
  }
}

// ================================================================
// ADVANCED RECOMMENDATION ENGINE
// ================================================================

/**
 * Calculate comprehensive daily recommendations
 */
async function calculateDailyRecommendations() {
  console.log('🧠 Calculating daily recommendations...');
  
  // Check if we already calculated today
  const stored = localStorage.getItem('start_daily_recommendations');
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (parsed.date === StartFlowState.todaysDate) {
        console.log('📋 Using cached daily recommendations');
        StartFlowState.dailyRecommendations = parsed.recommendations;
        StartFlowState.lastCalculated = parsed.timestamp;
        return parsed.recommendations;
      }
    } catch (e) {
      console.warn('Failed to parse cached recommendations');
    }
  }
  
  // Load fresh data
  const ecosystemData = await loadEcosystemData();
  
  // Calculate scores for each category
  const recommendations = await Promise.all([
    calculateThemeRecommendations(ecosystemData),
    calculateProjectRecommendations(ecosystemData),
    calculatePeopleRecommendations(ecosystemData),
    calculateOrganizationRecommendations(ecosystemData),
    calculateOpportunityRecommendations(ecosystemData)
  ]);
  
  // Flatten and sort by score
  const allRecommendations = recommendations.flat().sort((a, b) => b.score - a.score);
  
  // Take top recommendations from each category
  const finalRecommendations = {
    primary: allRecommendations[0], // Highest scoring overall
    themes: recommendations[0].slice(0, 3),
    projects: recommendations[1].slice(0, 3),
    people: recommendations[2].slice(0, 5),
    organizations: recommendations[3].slice(0, 3),
    opportunities: recommendations[4].slice(0, 3),
    timestamp: Date.now(),
    date: StartFlowState.todaysDate
  };
  
  // Cache for today
  localStorage.setItem('start_daily_recommendations', JSON.stringify({
    date: StartFlowState.todaysDate,
    recommendations: finalRecommendations,
    timestamp: Date.now()
  }));
  
  StartFlowState.dailyRecommendations = finalRecommendations;
  StartFlowState.lastCalculated = Date.now();
  
  console.log('✅ Daily recommendations calculated:', {
    primary: finalRecommendations.primary?.type,
    totalOptions: allRecommendations.length
  });
  
  return finalRecommendations;
}

/**
 * Calculate theme recommendations with advanced scoring
 */
async function calculateThemeRecommendations(ecosystemData) {
  const { themes, userActivity } = ecosystemData;
  const recommendations = [];
  
  for (const theme of themes.available) {
    let score = 50; // Base score
    const reasons = [];
    
    // Activity momentum
    if (theme.activity_score > 15) {
      score += 20;
      reasons.push(`High momentum (${theme.activity_score} activity)`);
    }
    
    // Participant count (sweet spot: not too empty, not too crowded)
    const participants = theme.participant_count?.[0]?.count || 0;
    if (participants >= 3 && participants <= 15) {
      score += 15;
      reasons.push(`Active community (${participants} participants)`);
    }
    
    // Project availability
    const projects = theme.project_count?.[0]?.count || 0;
    if (projects > 0) {
      score += 10;
      reasons.push(`${projects} active project${projects > 1 ? 's' : ''}`);
    }
    
    // User skill alignment (if we have skills data)
    if (StartFlowState.currentUser.skills && theme.required_skills) {
      const skillMatch = calculateSkillMatch(StartFlowState.currentUser.skills, theme.required_skills);
      if (skillMatch > 0.3) {
        score += Math.floor(skillMatch * 25);
        reasons.push(`${Math.floor(skillMatch * 100)}% skill match`);
      }
    }
    
    // Time sensitivity (expires soon = higher priority)
    const daysUntilExpiry = Math.ceil((new Date(theme.expires_at) - new Date()) / (1000 * 60 * 60 * 24));
    if (daysUntilExpiry <= 7) {
      score += 10;
      reasons.push(`Expires in ${daysUntilExpiry} days`);
    }
    
    // Recent theme activity by user
    const recentThemeActivity = userActivity.recentThemes.length;
    if (recentThemeActivity > 0) {
      score += 15;
      reasons.push('You\'ve been active in themes recently');
    }
    
    recommendations.push({
      type: 'theme',
      id: theme.id,
      title: theme.title,
      description: theme.description,
      score,
      reasons,
      data: theme,
      action: 'Join Theme Circle',
      actionIcon: 'bullseye'
    });
  }
  
  return recommendations.sort((a, b) => b.score - a.score);
}

/**
 * Calculate project recommendations
 */
async function calculateProjectRecommendations(ecosystemData) {
  const { projects, userActivity } = ecosystemData;
  const recommendations = [];
  
  for (const project of projects.available) {
    let score = 40; // Base score
    const reasons = [];
    
    // Project status priority
    if (project.status === 'open') {
      score += 20;
      reasons.push('Actively seeking contributors');
    }
    
    // Team size (not too big, not solo)
    const teamSize = project.member_count?.[0]?.count || 1;
    if (teamSize >= 2 && teamSize <= 8) {
      score += 15;
      reasons.push(`Good team size (${teamSize} members)`);
    }
    
    // Recent activity
    const daysSinceCreated = Math.ceil((new Date() - new Date(project.created_at)) / (1000 * 60 * 60 * 24));
    if (daysSinceCreated <= 30) {
      score += 10;
      reasons.push('Recently started');
    }
    
    // Theme alignment
    if (project.theme && ecosystemData.themes.userParticipating.some(ut => ut.theme_id === project.theme.id)) {
      score += 25;
      reasons.push(`In your theme: ${project.theme.title}`);
    }
    
    // Skill match
    if (StartFlowState.currentUser.skills && project.required_skills) {
      const skillMatch = calculateSkillMatch(StartFlowState.currentUser.skills, project.required_skills);
      if (skillMatch > 0.2) {
        score += Math.floor(skillMatch * 30);
        reasons.push(`${Math.floor(skillMatch * 100)}% skill match`);
      }
    }
    
    // User project activity
    if (userActivity.recentProjects.length > 0) {
      score += 10;
      reasons.push('You\'ve been active in projects');
    }
    
    recommendations.push({
      type: 'project',
      id: project.id,
      title: project.title,
      description: project.description,
      score,
      reasons,
      data: project,
      action: 'Join Project',
      actionIcon: 'lightbulb'
    });
  }
  
  return recommendations.sort((a, b) => b.score - a.score);
}

/**
 * Calculate people recommendations
 */
async function calculatePeopleRecommendations(ecosystemData) {
  const { people, userActivity } = ecosystemData;
  const recommendations = [];
  
  for (const person of people.available) {
    let score = 30; // Base score
    const reasons = [];
    
    // Shared interests
    if (StartFlowState.currentUser.interests && person.interests) {
      const interestMatch = calculateArrayMatch(StartFlowState.currentUser.interests, person.interests);
      if (interestMatch > 0.1) {
        score += Math.floor(interestMatch * 40);
        reasons.push(`${Math.floor(interestMatch * 100)}% shared interests`);
      }
    }
    
    // Shared skills (complementary)
    if (StartFlowState.currentUser.skills && person.skills) {
      const skillMatch = calculateArrayMatch(StartFlowState.currentUser.skills, person.skills);
      if (skillMatch > 0.1) {
        score += Math.floor(skillMatch * 25);
        reasons.push(`${Math.floor(skillMatch * 100)}% skill overlap`);
      }
    }
    
    // Location proximity
    if (StartFlowState.currentUser.location && person.location) {
      if (StartFlowState.currentUser.location.toLowerCase().includes(person.location.toLowerCase()) ||
          person.location.toLowerCase().includes(StartFlowState.currentUser.location.toLowerCase())) {
        score += 20;
        reasons.push(`Both in ${person.location}`);
      }
    }
    
    // Profile completeness (indicates active user)
    let completeness = 0;
    if (person.bio) completeness += 1;
    if (person.skills?.length > 0) completeness += 1;
    if (person.interests?.length > 0) completeness += 1;
    if (person.image_url) completeness += 1;
    
    if (completeness >= 3) {
      score += 15;
      reasons.push('Complete profile');
    }
    
    // Recent connection activity
    if (userActivity.recentConnections.length > 0) {
      score += 10;
      reasons.push('You\'ve been networking recently');
    }
    
    recommendations.push({
      type: 'person',
      id: person.id,
      title: person.name,
      description: person.bio || 'Community member',
      score,
      reasons,
      data: person,
      action: 'Connect',
      actionIcon: 'user-plus'
    });
  }
  
  return recommendations.sort((a, b) => b.score - a.score);
}

/**
 * Calculate organization recommendations (NEW)
 */
async function calculateOrganizationRecommendations(ecosystemData) {
  const { organizations } = ecosystemData;
  const recommendations = [];
  
  for (const org of organizations.available) {
    let score = 35; // Base score
    const reasons = [];
    
    // Organization activity
    if (org.open_opportunities > 0) {
      score += 25;
      reasons.push(`${org.open_opportunities} open opportunities`);
    }
    
    // Follower count (indicates credibility)
    if (org.follower_count > 5) {
      score += 15;
      reasons.push(`${org.follower_count} followers`);
    }
    
    // Verification status
    if (org.verified) {
      score += 20;
      reasons.push('Verified organization');
    }
    
    // Industry alignment (if we have user industry preferences)
    if (StartFlowState.currentUser.interests && org.industry) {
      const industryMatch = calculateArrayMatch(StartFlowState.currentUser.interests, org.industry);
      if (industryMatch > 0.1) {
        score += Math.floor(industryMatch * 30);
        reasons.push(`${Math.floor(industryMatch * 100)}% industry match`);
      }
    }
    
    // Sponsored themes (shows engagement)
    if (org.active_sponsorships > 0) {
      score += 10;
      reasons.push(`Sponsors ${org.active_sponsorships} themes`);
    }
    
    recommendations.push({
      type: 'organization',
      id: org.id,
      title: org.name,
      description: org.description,
      score,
      reasons,
      data: org,
      action: 'Follow Organization',
      actionIcon: 'building'
    });
  }
  
  return recommendations.sort((a, b) => b.score - a.score);
}

/**
 * Calculate opportunity recommendations (NEW)
 */
async function calculateOpportunityRecommendations(ecosystemData) {
  const { opportunities } = ecosystemData;
  const recommendations = [];
  
  for (const opp of opportunities.available) {
    let score = 25; // Base score
    const reasons = [];
    
    // Opportunity type preferences
    const preferredTypes = ['internship', 'job', 'volunteer', 'mentorship'];
    if (preferredTypes.includes(opp.type)) {
      score += 15;
      reasons.push(`${opp.type.charAt(0).toUpperCase() + opp.type.slice(1)} opportunity`);
    }
    
    // Skill match
    if (StartFlowState.currentUser.skills && opp.required_skills) {
      const skillMatch = calculateSkillMatch(StartFlowState.currentUser.skills, opp.required_skills);
      if (skillMatch > 0.3) {
        score += Math.floor(skillMatch * 35);
        reasons.push(`${Math.floor(skillMatch * 100)}% skill match`);
      }
    }
    
    // Remote work preference
    if (opp.remote_ok) {
      score += 10;
      reasons.push('Remote friendly');
    }
    
    // Organization credibility
    if (opp.organization_verified) {
      score += 15;
      reasons.push('From verified organization');
    }
    
    // Recent posting (fresh opportunities)
    const daysSincePosted = Math.ceil((new Date() - new Date(opp.created_at)) / (1000 * 60 * 60 * 24));
    if (daysSincePosted <= 7) {
      score += 10;
      reasons.push('Recently posted');
    }
    
    recommendations.push({
      type: 'opportunity',
      id: opp.id,
      title: opp.title,
      description: `${opp.type} at ${opp.organization_name}`,
      score,
      reasons,
      data: opp,
      action: 'View Opportunity',
      actionIcon: 'briefcase'
    });
  }
  
  return recommendations.sort((a, b) => b.score - a.score);
}

// ================================================================
// UTILITY FUNCTIONS
// ================================================================

/**
 * Calculate skill match percentage between two skill arrays
 */
function calculateSkillMatch(userSkills, requiredSkills) {
  if (!userSkills || !requiredSkills || userSkills.length === 0 || requiredSkills.length === 0) {
    return 0;
  }
  
  const userSkillsLower = userSkills.map(s => s.toLowerCase());
  const requiredSkillsLower = requiredSkills.map(s => s.toLowerCase());
  
  let matches = 0;
  for (const skill of requiredSkillsLower) {
    if (userSkillsLower.some(us => us.includes(skill) || skill.includes(us))) {
      matches++;
    }
  }
  
  return matches / requiredSkillsLower.length;
}

/**
 * Calculate match percentage between two arrays
 */
function calculateArrayMatch(array1, array2) {
  if (!array1 || !array2 || array1.length === 0 || array2.length === 0) {
    return 0;
  }
  
  const set1 = new Set(array1.map(item => item.toLowerCase()));
  const set2 = new Set(array2.map(item => item.toLowerCase()));
  
  let matches = 0;
  for (const item of set1) {
    if (set2.has(item)) {
      matches++;
    }
  }
  
  return matches / Math.max(set1.size, set2.size);
}

// ================================================================
// EXPORT AND INITIALIZATION
// ================================================================

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  // Wait a bit for other systems to load
  setTimeout(initializeStartFlow, 1000);
});

// Export functions for global access
window.StartFlowRedesigned = {
  initialize: initializeStartFlow,
  calculateDailyRecommendations,
  loadEcosystemData,
  state: StartFlowState
};

console.log('✅ START Flow Redesigned ready for initialization');