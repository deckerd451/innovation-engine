// ================================================================
// INTELLIGENT RECOMMENDATIONS ENGINE
// ================================================================
// AI-powered recommendations for connections, projects, and themes

console.log("%c🧠 Intelligent Recommendations Loading...", "color:#0ff; font-weight: bold; font-size: 16px");

let supabase = null;
let currentUserProfile = null;
let recommendationCache = new Map();
let userBehaviorData = {
  interactions: [],
  preferences: {},
  skillInterests: [],
  projectHistory: [],
  connectionPatterns: []
};

// Recommendation types
const RECOMMENDATION_TYPES = {
  PEOPLE: 'people',
  PROJECTS: 'projects',
  THEMES: 'themes',
  SKILLS: 'skills',
  COLLABORATIONS: 'collaborations'
};

// Scoring weights for different factors
const SCORING_WEIGHTS = {
  SKILL_MATCH: 0.3,
  INTEREST_OVERLAP: 0.25,
  ACTIVITY_LEVEL: 0.2,
  NETWORK_PROXIMITY: 0.15,
  RECENT_ACTIVITY: 0.1
};

// Initialize intelligent recommendations
export function initIntelligentRecommendations() {
  supabase = window.supabase;
  
  // Listen for profile loaded
  window.addEventListener('profile-loaded', (e) => {
    currentUserProfile = e.detail.profile;
    initializeUserBehaviorTracking();
  });

  // Expose functions globally
  window.getPersonalizedRecommendations = getPersonalizedRecommendations;
  window.trackUserInteraction = trackUserInteraction;
  window.updateUserPreferences = updateUserPreferences;
  window.getRecommendationExplanation = getRecommendationExplanation;

  console.log('✅ Intelligent recommendations initialized');
}

// Initialize user behavior tracking
function initializeUserBehaviorTracking() {
  if (!currentUserProfile) return;

  console.log('🧠 Initializing behavior tracking for:', currentUserProfile.name);

  // Track page interactions
  document.addEventListener('click', (e) => {
    const target = e.target.closest('[data-recommendation-target]');
    if (target) {
      trackUserInteraction({
        type: 'click',
        target: target.dataset.recommendationTarget,
        context: target.dataset.recommendationContext || 'unknown',
        timestamp: Date.now()
      });
    }
  });

  // Track time spent on different sections
  trackSectionEngagement();

  // Load existing behavior data
  loadUserBehaviorData();
}

// Track user interactions for recommendation learning
window.trackUserInteraction = function(interaction) {
  userBehaviorData.interactions.push({
    ...interaction,
    userId: currentUserProfile?.id,
    timestamp: interaction.timestamp || Date.now()
  });

  // Keep only recent interactions (last 1000)
  if (userBehaviorData.interactions.length > 1000) {
    userBehaviorData.interactions = userBehaviorData.interactions.slice(-1000);
  }

  // Update preferences based on interaction
  updatePreferencesFromInteraction(interaction);

  // Invalidate cache for affected recommendation types
  invalidateRecommendationCache(interaction.target);

  console.log('🧠 Tracked interaction:', interaction);
};

// Update user preferences based on interactions
function updatePreferencesFromInteraction(interaction) {
  const { type, target, context } = interaction;

  // Increase preference score for interacted items
  if (target === 'person') {
    userBehaviorData.preferences.peopleInteraction = (userBehaviorData.preferences.peopleInteraction || 0) + 1;
  } else if (target === 'project') {
    userBehaviorData.preferences.projectInteraction = (userBehaviorData.preferences.projectInteraction || 0) + 1;
  } else if (target === 'theme') {
    userBehaviorData.preferences.themeInteraction = (userBehaviorData.preferences.themeInteraction || 0) + 1;
  }

  // Track skill interests
  if (context && context.includes('skill:')) {
    const skill = context.replace('skill:', '');
    const existing = userBehaviorData.skillInterests.find(s => s.skill === skill);
    if (existing) {
      existing.score += 1;
    } else {
      userBehaviorData.skillInterests.push({ skill, score: 1 });
    }
  }
}

// Track section engagement for understanding user interests
function trackSectionEngagement() {
  const sections = document.querySelectorAll('[data-section]');
  const sectionTimes = new Map();

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      const sectionName = entry.target.dataset.section;
      if (entry.isIntersecting) {
        sectionTimes.set(sectionName, Date.now());
      } else if (sectionTimes.has(sectionName)) {
        const timeSpent = Date.now() - sectionTimes.get(sectionName);
        if (timeSpent > 2000) { // Only count if spent more than 2 seconds
          trackUserInteraction({
            type: 'section_engagement',
            target: sectionName,
            context: `time_spent:${timeSpent}`,
            timestamp: Date.now()
          });
        }
        sectionTimes.delete(sectionName);
      }
    });
  }, { threshold: 0.5 });

  sections.forEach(section => observer.observe(section));
}

// Get personalized recommendations
window.getPersonalizedRecommendations = async function(type = RECOMMENDATION_TYPES.PEOPLE, options = {}) {
  const { limit = 10, refresh = false } = options;
  
  console.log(`🧠 Generating ${type} recommendations for:`, currentUserProfile?.name);

  // Check cache first
  const cacheKey = `${type}_${limit}`;
  if (!refresh && recommendationCache.has(cacheKey)) {
    const cached = recommendationCache.get(cacheKey);
    if (Date.now() - cached.timestamp < 300000) { // 5 minutes cache
      console.log('🧠 Returning cached recommendations');
      return cached.recommendations;
    }
  }

  try {
    let recommendations = [];

    switch (type) {
      case RECOMMENDATION_TYPES.PEOPLE:
        recommendations = await generatePeopleRecommendations(limit);
        break;
      case RECOMMENDATION_TYPES.PROJECTS:
        recommendations = await generateProjectRecommendations(limit);
        break;
      case RECOMMENDATION_TYPES.THEMES:
        recommendations = await generateThemeRecommendations(limit);
        break;
      case RECOMMENDATION_TYPES.SKILLS:
        recommendations = await generateSkillRecommendations(limit);
        break;
      case RECOMMENDATION_TYPES.COLLABORATIONS:
        recommendations = await generateCollaborationRecommendations(limit);
        break;
      default:
        console.warn('🧠 Unknown recommendation type:', type);
        return [];
    }

    // Cache the results
    recommendationCache.set(cacheKey, {
      recommendations,
      timestamp: Date.now()
    });

    console.log(`🧠 Generated ${recommendations.length} ${type} recommendations`);
    return recommendations;

  } catch (error) {
    console.error('🧠 Error generating recommendations:', error);
    return [];
  }
};

// Generate people recommendations
async function generatePeopleRecommendations(limit) {
  if (!supabase || !currentUserProfile) {
    return generateFallbackPeopleRecommendations(limit);
  }

  try {
    // Get all community members except current user
    const { data: people, error } = await supabase
      .from('community')
      .select('*')
      .neq('id', currentUserProfile.id)
      .limit(50); // Get more for better scoring

    if (error || !people) {
      return generateFallbackPeopleRecommendations(limit);
    }

    // Score each person based on multiple factors
    const scoredPeople = people.map(person => ({
      ...person,
      score: calculatePersonScore(person),
      reasons: generatePersonRecommendationReasons(person)
    }));

    // Sort by score and return top recommendations
    return scoredPeople
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(person => ({
        id: person.id,
        name: person.name,
        skills: person.skills,
        bio: person.bio,
        image_url: person.image_url,
        score: person.score,
        reasons: person.reasons,
        type: 'person'
      }));

  } catch (error) {
    console.error('🧠 Error in people recommendations:', error);
    return generateFallbackPeopleRecommendations(limit);
  }
}

// Calculate recommendation score for a person
function calculatePersonScore(person) {
  let score = 0;
  const currentUserSkills = (currentUserProfile.skills || '').toLowerCase().split(',').map(s => s.trim());
  const personSkills = (person.skills || '').toLowerCase().split(',').map(s => s.trim());

  // Skill match scoring
  const skillMatches = currentUserSkills.filter(skill => 
    personSkills.some(pSkill => pSkill.includes(skill) || skill.includes(pSkill))
  );
  score += skillMatches.length * SCORING_WEIGHTS.SKILL_MATCH * 100;

  // Interest overlap (based on user behavior)
  const userInterests = userBehaviorData.skillInterests.map(si => si.skill.toLowerCase());
  const interestMatches = personSkills.filter(skill => 
    userInterests.some(interest => skill.includes(interest) || interest.includes(skill))
  );
  score += interestMatches.length * SCORING_WEIGHTS.INTEREST_OVERLAP * 100;

  // Activity level (assume recent profiles are more active)
  const profileAge = Date.now() - new Date(person.created_at || Date.now()).getTime();
  const activityScore = Math.max(0, 100 - (profileAge / (1000 * 60 * 60 * 24 * 30))); // Decay over 30 days
  score += activityScore * SCORING_WEIGHTS.ACTIVITY_LEVEL;

  // Random factor to ensure variety
  score += Math.random() * 10;

  return Math.round(score);
}

// Generate reasons for person recommendation
function generatePersonRecommendationReasons(person) {
  const reasons = [];
  const currentUserSkills = (currentUserProfile.skills || '').toLowerCase().split(',').map(s => s.trim());
  const personSkills = (person.skills || '').toLowerCase().split(',').map(s => s.trim());

  // Skill-based reasons
  const skillMatches = currentUserSkills.filter(skill => 
    personSkills.some(pSkill => pSkill.includes(skill) || skill.includes(pSkill))
  );

  if (skillMatches.length > 0) {
    reasons.push(`Shared skills: ${skillMatches.slice(0, 3).join(', ')}`);
  }

  // Role-based reasons
  if (person.user_role && currentUserProfile.user_role) {
    if (person.user_role === currentUserProfile.user_role) {
      reasons.push(`Same role: ${person.user_role}`);
    } else {
      reasons.push(`Complementary role: ${person.user_role}`);
    }
  }

  // Availability-based reasons
  if (person.availability === 'Available' || person.availability === 'Open to opportunities') {
    reasons.push('Currently available for collaboration');
  }

  // Default reason if no specific matches
  if (reasons.length === 0) {
    reasons.push('Active community member');
  }

  return reasons;
}

// Generate project recommendations
async function generateProjectRecommendations(limit) {
  if (!supabase || !currentUserProfile) {
    return generateFallbackProjectRecommendations(limit);
  }

  try {
    // Get projects user is not already part of
    const { data: projects, error } = await supabase
      .from('projects')
      .select(`
        *,
        creator:community!creator_id(name, image_url),
        theme:theme_circles(title, tags)
      `)
      .neq('creator_id', currentUserProfile.id)
      .limit(30);

    if (error || !projects) {
      return generateFallbackProjectRecommendations(limit);
    }

    // Score projects based on user interests and skills
    const scoredProjects = projects.map(project => ({
      ...project,
      score: calculateProjectScore(project),
      reasons: generateProjectRecommendationReasons(project)
    }));

    return scoredProjects
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(project => ({
        id: project.id,
        title: project.title,
        description: project.description,
        required_skills: project.required_skills,
        creator: project.creator,
        theme: project.theme,
        score: project.score,
        reasons: project.reasons,
        type: 'project'
      }));

  } catch (error) {
    console.error('🧠 Error in project recommendations:', error);
    return generateFallbackProjectRecommendations(limit);
  }
}

// Calculate project recommendation score
function calculateProjectScore(project) {
  let score = 0;
  const currentUserSkills = (currentUserProfile.skills || '').toLowerCase().split(',').map(s => s.trim());
  const projectSkills = (project.required_skills || []).map(s => s.toLowerCase());

  // Skill match scoring
  const skillMatches = currentUserSkills.filter(skill => 
    projectSkills.some(pSkill => pSkill.includes(skill) || skill.includes(pSkill))
  );
  score += skillMatches.length * SCORING_WEIGHTS.SKILL_MATCH * 100;

  // Theme interest scoring
  if (project.theme && project.theme.tags) {
    const userInterests = userBehaviorData.skillInterests.map(si => si.skill.toLowerCase());
    const themeMatches = project.theme.tags.filter(tag => 
      userInterests.some(interest => tag.toLowerCase().includes(interest) || interest.includes(tag.toLowerCase()))
    );
    score += themeMatches.length * SCORING_WEIGHTS.INTEREST_OVERLAP * 100;
  }

  // Project freshness
  const projectAge = Date.now() - new Date(project.created_at || Date.now()).getTime();
  const freshnessScore = Math.max(0, 100 - (projectAge / (1000 * 60 * 60 * 24 * 7))); // Decay over 7 days
  score += freshnessScore * SCORING_WEIGHTS.RECENT_ACTIVITY;

  // Random factor for variety
  score += Math.random() * 15;

  return Math.round(score);
}

// Generate project recommendation reasons
function generateProjectRecommendationReasons(project) {
  const reasons = [];
  const currentUserSkills = (currentUserProfile.skills || '').toLowerCase().split(',').map(s => s.trim());
  const projectSkills = (project.required_skills || []).map(s => s.toLowerCase());

  // Skill match reasons
  const skillMatches = currentUserSkills.filter(skill => 
    projectSkills.some(pSkill => pSkill.includes(skill) || skill.includes(pSkill))
  );

  if (skillMatches.length > 0) {
    reasons.push(`Your skills match: ${skillMatches.slice(0, 2).join(', ')}`);
  }

  // Theme reasons
  if (project.theme) {
    reasons.push(`Theme: ${project.theme.title}`);
  }

  // Freshness reasons
  const projectAge = Date.now() - new Date(project.created_at || Date.now()).getTime();
  if (projectAge < 1000 * 60 * 60 * 24 * 3) { // Less than 3 days old
    reasons.push('Recently created project');
  }

  // Default reason
  if (reasons.length === 0) {
    reasons.push('Interesting collaboration opportunity');
  }

  return reasons;
}

// Generate theme recommendations
async function generateThemeRecommendations(limit) {
  // Implementation for theme recommendations
  return generateFallbackThemeRecommendations(limit);
}

// Generate skill recommendations
async function generateSkillRecommendations(limit) {
  // Implementation for skill recommendations
  return generateFallbackSkillRecommendations(limit);
}

// Generate collaboration recommendations
async function generateCollaborationRecommendations(limit) {
  // Implementation for collaboration recommendations
  return generateFallbackCollaborationRecommendations(limit);
}

// Fallback recommendations for when database is not available
function generateFallbackPeopleRecommendations(limit) {
  const fallbackPeople = [
    {
      id: 'rec-person-1',
      name: 'Alex Chen',
      skills: 'React, Node.js, TypeScript',
      bio: 'Full-stack developer passionate about clean code',
      score: 85,
      reasons: ['Shared skills: React, TypeScript', 'Active community member'],
      type: 'person'
    },
    {
      id: 'rec-person-2',
      name: 'Sarah Johnson',
      skills: 'UI/UX Design, Figma, User Research',
      bio: 'Product designer focused on user-centered design',
      score: 78,
      reasons: ['Complementary skills for development', 'Available for collaboration'],
      type: 'person'
    },
    {
      id: 'rec-person-3',
      name: 'Mike Rodriguez',
      skills: 'Python, Machine Learning, Data Science',
      bio: 'Data scientist working on AI applications',
      score: 72,
      reasons: ['Growing field: Machine Learning', 'Active in community'],
      type: 'person'
    }
  ];

  return fallbackPeople.slice(0, limit);
}

function generateFallbackProjectRecommendations(limit) {
  const fallbackProjects = [
    {
      id: 'rec-project-1',
      title: 'Community Dashboard',
      description: 'Building a dashboard to visualize community engagement and growth',
      required_skills: ['React', 'D3.js', 'Node.js'],
      score: 88,
      reasons: ['Your skills match: React', 'Recently created project'],
      type: 'project'
    },
    {
      id: 'rec-project-2',
      title: 'AI Study Assistant',
      description: 'Creating an AI-powered study assistant for students',
      required_skills: ['Python', 'Machine Learning', 'NLP'],
      score: 75,
      reasons: ['Growing field: AI/ML', 'Interesting collaboration opportunity'],
      type: 'project'
    }
  ];

  return fallbackProjects.slice(0, limit);
}

function generateFallbackThemeRecommendations(limit) {
  return [
    {
      id: 'rec-theme-1',
      title: 'Sustainable Technology',
      description: 'Exploring technology solutions for environmental challenges',
      score: 80,
      reasons: ['Trending topic', 'High community interest'],
      type: 'theme'
    }
  ].slice(0, limit);
}

function generateFallbackSkillRecommendations(limit) {
  return [
    {
      id: 'rec-skill-1',
      skill: 'TypeScript',
      description: 'Strongly typed JavaScript for better development experience',
      score: 85,
      reasons: ['Popular in community', 'Complements your JavaScript skills'],
      type: 'skill'
    }
  ].slice(0, limit);
}

function generateFallbackCollaborationRecommendations(limit) {
  return [
    {
      id: 'rec-collab-1',
      title: 'Join a Hackathon Team',
      description: 'Form or join a team for the upcoming hackathon',
      score: 90,
      reasons: ['Great networking opportunity', 'Skill development'],
      type: 'collaboration'
    }
  ].slice(0, limit);
}

// Get explanation for a recommendation
window.getRecommendationExplanation = function(recommendationId, type) {
  // This would provide detailed explanation of why something was recommended
  return {
    factors: [
      { name: 'Skill Match', weight: 30, score: 85 },
      { name: 'Interest Overlap', weight: 25, score: 70 },
      { name: 'Activity Level', weight: 20, score: 90 },
      { name: 'Network Proximity', weight: 15, score: 60 },
      { name: 'Recent Activity', weight: 10, score: 80 }
    ],
    totalScore: 78,
    confidence: 'High'
  };
};

// Update user preferences
window.updateUserPreferences = function(preferences) {
  userBehaviorData.preferences = { ...userBehaviorData.preferences, ...preferences };
  
  // Invalidate all caches when preferences change
  recommendationCache.clear();
  
  console.log('🧠 Updated user preferences:', preferences);
};

// Load user behavior data from storage
async function loadUserBehaviorData() {
  try {
    const stored = localStorage.getItem(`userBehavior_${currentUserProfile.id}`);
    if (stored) {
      const data = JSON.parse(stored);
      userBehaviorData = { ...userBehaviorData, ...data };
      console.log('🧠 Loaded user behavior data');
    }
  } catch (error) {
    console.warn('🧠 Failed to load user behavior data:', error);
  }
}

// Save user behavior data to storage
function saveUserBehaviorData() {
  try {
    localStorage.setItem(`userBehavior_${currentUserProfile.id}`, JSON.stringify(userBehaviorData));
  } catch (error) {
    console.warn('🧠 Failed to save user behavior data:', error);
  }
}

// Invalidate recommendation cache
function invalidateRecommendationCache(targetType) {
  const keysToRemove = [];
  for (const key of recommendationCache.keys()) {
    if (key.includes(targetType)) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach(key => recommendationCache.delete(key));
}

// Periodic save of behavior data
setInterval(() => {
  if (currentUserProfile) {
    saveUserBehaviorData();
  }
}, 30000); // Save every 30 seconds

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  initIntelligentRecommendations();
});

console.log('✅ Intelligent recommendations engine ready');