// ================================================================
// SMART CONNECTION SUGGESTIONS SYSTEM
// ================================================================
// AI-powered connection recommendations based on skills, interests, and compatibility


let supabase = null;
let currentUserProfile = null;

// Suggestion algorithms and weights
const SUGGESTION_ALGORITHMS = {
  SKILL_SIMILARITY: { weight: 0.35, name: 'Skill Compatibility' },
  MUTUAL_CONNECTIONS: { weight: 0.25, name: 'Mutual Connections' },
  PROJECT_COMPATIBILITY: { weight: 0.20, name: 'Project Synergy' },
  ACTIVITY_PATTERNS: { weight: 0.10, name: 'Activity Alignment' },
  PROFILE_COMPLETENESS: { weight: 0.10, name: 'Profile Quality' }
};

// Skill categories for better matching
const SKILL_CATEGORIES = {
  'Frontend': ['React', 'Vue.js', 'Angular', 'JavaScript', 'TypeScript', 'HTML', 'CSS', 'Sass', 'Tailwind CSS'],
  'Backend': ['Node.js', 'Python', 'Java', 'C#', 'Go', 'Rust', 'PHP', 'Ruby'],
  'Mobile': ['React Native', 'Flutter', 'Swift', 'Kotlin', 'iOS Development', 'Android Development'],
  'Data Science': ['Python', 'R', 'Machine Learning', 'Data Analysis', 'Statistics', 'TensorFlow', 'PyTorch'],
  'Design': ['UI/UX Design', 'Figma', 'Adobe Creative Suite', 'Sketch', 'Prototyping'],
  'DevOps': ['Docker', 'Kubernetes', 'AWS', 'Google Cloud', 'Azure', 'CI/CD', 'DevOps'],
  'Database': ['PostgreSQL', 'MongoDB', 'MySQL', 'Redis', 'Firebase', 'Supabase'],
  'Blockchain': ['Solidity', 'Web3.js', 'Ethereum', 'Smart Contracts', 'DeFi']
};

// Initialize smart suggestions system
export function initSmartConnectionSuggestions() {
  supabase = window.supabase;
  
  // Listen for profile loaded
  window.addEventListener('profile-loaded', (e) => {
    currentUserProfile = e.detail.profile;
  });

  // Expose functions globally
  window.getSmartConnectionSuggestions = getSmartConnectionSuggestions;
  window.explainConnectionSuggestion = explainConnectionSuggestion;
  window.refreshSmartSuggestions = refreshSmartSuggestions;

}

// Get smart connection suggestions with scoring
export async function getSmartConnectionSuggestions(limit = 8) {

  if (!currentUserProfile) {
    console.warn('⚠️ No current user profile available');
    return [];
  }

  try {
    // Get all potential connections
    const candidates = await getPotentialConnections();
    
    if (candidates.length === 0) {
      return [];
    }


    // Score each candidate
    const scoredCandidates = await Promise.all(
      candidates.map(async (candidate) => {
        const score = await calculateConnectionScore(candidate);
        return {
          ...candidate,
          score: score.total,
          scoreBreakdown: score.breakdown,
          reasons: score.reasons
        };
      })
    );

    // Sort by score and return top suggestions
    const suggestions = scoredCandidates
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    console.log('🏆 Top suggestion:', suggestions[0]?.name, 'Score:', suggestions[0]?.score);

    return suggestions;

  } catch (error) {
    console.error('❌ Error generating smart suggestions:', error);
    return [];
  }
}

// Get potential connections (users not already connected)
async function getPotentialConnections() {
  try {
    // Get all users except current user
    const { data: allUsers, error: usersError } = await supabase
      .from('community')
      .select('*')
      .neq('id', currentUserProfile.id);

    if (usersError) throw usersError;

    // Get existing connections and pending requests
    const { data: connections, error: connectionsError } = await supabase
      .from('connections')
      .select('from_user_id, to_user_id, status')
      .or(`from_user_id.eq.${currentUserProfile.id},to_user_id.eq.${currentUserProfile.id}`);

    if (connectionsError) throw connectionsError;

    // Create set of connected/pending user IDs
    const excludedIds = new Set([currentUserProfile.id]);
    connections?.forEach(conn => {
      excludedIds.add(conn.from_user_id);
      excludedIds.add(conn.to_user_id);
    });

    // Filter out already connected users
    const candidates = allUsers?.filter(user => !excludedIds.has(user.id)) || [];

    return candidates;

  } catch (error) {
    console.error('Error getting potential connections:', error);
    return [];
  }
}

// Calculate comprehensive connection score
async function calculateConnectionScore(candidate) {
  const breakdown = {};
  const reasons = [];
  let total = 0;

  // 1. Skill Similarity Score
  const skillScore = calculateSkillSimilarity(candidate);
  breakdown.skillSimilarity = skillScore.score;
  total += skillScore.score * SUGGESTION_ALGORITHMS.SKILL_SIMILARITY.weight;
  reasons.push(...skillScore.reasons);

  // 2. Mutual Connections Score
  const mutualScore = await calculateMutualConnectionsScore(candidate);
  breakdown.mutualConnections = mutualScore.score;
  total += mutualScore.score * SUGGESTION_ALGORITHMS.MUTUAL_CONNECTIONS.weight;
  reasons.push(...mutualScore.reasons);

  // 3. Project Compatibility Score
  const projectScore = await calculateProjectCompatibilityScore(candidate);
  breakdown.projectCompatibility = projectScore.score;
  total += projectScore.score * SUGGESTION_ALGORITHMS.PROJECT_COMPATIBILITY.weight;
  reasons.push(...projectScore.reasons);

  // 4. Activity Patterns Score
  const activityScore = calculateActivityPatternsScore(candidate);
  breakdown.activityPatterns = activityScore.score;
  total += activityScore.score * SUGGESTION_ALGORITHMS.ACTIVITY_PATTERNS.weight;
  reasons.push(...activityScore.reasons);

  // 5. Profile Completeness Score
  const profileScore = calculateProfileCompletenessScore(candidate);
  breakdown.profileCompleteness = profileScore.score;
  total += profileScore.score * SUGGESTION_ALGORITHMS.PROFILE_COMPLETENESS.weight;
  reasons.push(...profileScore.reasons);

  return {
    total: Math.round(total * 100) / 100,
    breakdown,
    reasons: reasons.filter(Boolean)
  };
}

// Calculate skill similarity between users
function calculateSkillSimilarity(candidate) {
  const userSkills = parseSkills(currentUserProfile.skills || '');
  const candidateSkills = parseSkills(candidate.skills || '');
  
  if (userSkills.length === 0 || candidateSkills.length === 0) {
    return { score: 0, reasons: [] };
  }

  // Direct skill matches
  const commonSkills = userSkills.filter(skill => 
    candidateSkills.some(cSkill => 
      cSkill.toLowerCase().includes(skill.toLowerCase()) || 
      skill.toLowerCase().includes(cSkill.toLowerCase())
    )
  );

  // Category-based matches (complementary skills)
  const userCategories = getSkillCategories(userSkills);
  const candidateCategories = getSkillCategories(candidateSkills);
  const commonCategories = userCategories.filter(cat => candidateCategories.includes(cat));

  // Calculate score
  const directMatchScore = Math.min(commonSkills.length / Math.max(userSkills.length, candidateSkills.length), 1);
  const categoryMatchScore = Math.min(commonCategories.length / Object.keys(SKILL_CATEGORIES).length, 1);
  
  const score = (directMatchScore * 0.7) + (categoryMatchScore * 0.3);

  const reasons = [];
  if (commonSkills.length > 0) {
    reasons.push(`${commonSkills.length} shared skill${commonSkills.length > 1 ? 's' : ''}: ${commonSkills.slice(0, 3).join(', ')}`);
  }
  if (commonCategories.length > 0) {
    reasons.push(`Works in ${commonCategories.slice(0, 2).join(' & ')}`);
  }

  return { score, reasons };
}

// Calculate mutual connections score
async function calculateMutualConnectionsScore(candidate) {
  try {
    // Get user's connections
    const { data: userConnections } = await supabase
      .from('connections')
      .select('from_user_id, to_user_id')
      .or(`from_user_id.eq.${currentUserProfile.id},to_user_id.eq.${currentUserProfile.id}`)
      .eq('status', 'accepted');

    // Get candidate's connections
    const { data: candidateConnections } = await supabase
      .from('connections')
      .select('from_user_id, to_user_id')
      .or(`from_user_id.eq.${candidate.id},to_user_id.eq.${candidate.id}`)
      .eq('status', 'accepted');

    if (!userConnections || !candidateConnections) {
      return { score: 0, reasons: [] };
    }

    // Extract connection IDs
    const userConnectionIds = new Set();
    userConnections.forEach(conn => {
      const otherId = conn.from_user_id === currentUserProfile.id ? conn.to_user_id : conn.from_user_id;
      userConnectionIds.add(otherId);
    });

    const candidateConnectionIds = new Set();
    candidateConnections.forEach(conn => {
      const otherId = conn.from_user_id === candidate.id ? conn.to_user_id : conn.from_user_id;
      candidateConnectionIds.add(otherId);
    });

    // Find mutual connections
    const mutualConnections = [...userConnectionIds].filter(id => candidateConnectionIds.has(id));
    
    const score = Math.min(mutualConnections.length / 10, 1); // Max score at 10 mutual connections

    const reasons = [];
    if (mutualConnections.length > 0) {
      reasons.push(`${mutualConnections.length} mutual connection${mutualConnections.length > 1 ? 's' : ''}`);
    }

    return { score, reasons };

  } catch (error) {
    console.warn('Error calculating mutual connections:', error);
    return { score: 0, reasons: [] };
  }
}

// Calculate project compatibility score
async function calculateProjectCompatibilityScore(candidate) {
  try {
    // Get user's projects
    const { data: userProjects } = await supabase
      .from('projects')
      .select('required_skills, theme_id, status')
      .eq('creator_id', currentUserProfile.id)
      .eq('status', 'active');

    // Get candidate's projects
    const { data: candidateProjects } = await supabase
      .from('projects')
      .select('required_skills, theme_id, status')
      .eq('creator_id', candidate.id)
      .eq('status', 'active');

    if (!userProjects || !candidateProjects) {
      return { score: 0, reasons: [] };
    }

    let score = 0;
    const reasons = [];

    // Check for shared themes
    const userThemes = new Set(userProjects.map(p => p.theme_id).filter(Boolean));
    const candidateThemes = new Set(candidateProjects.map(p => p.theme_id).filter(Boolean));
    const sharedThemes = [...userThemes].filter(theme => candidateThemes.has(theme));

    if (sharedThemes.length > 0) {
      score += 0.4;
      reasons.push(`Working on similar themes`);
    }

    // Check for complementary skills in projects
    const userProjectSkills = new Set();
    userProjects.forEach(project => {
      if (project.required_skills) {
        project.required_skills.forEach(skill => userProjectSkills.add(skill.toLowerCase()));
      }
    });

    const candidateSkills = parseSkills(candidate.skills || '').map(s => s.toLowerCase());
    const skillMatches = candidateSkills.filter(skill => userProjectSkills.has(skill));

    if (skillMatches.length > 0) {
      score += Math.min(skillMatches.length / 5, 0.6);
      reasons.push(`Has skills needed for your projects`);
    }

    return { score: Math.min(score, 1), reasons };

  } catch (error) {
    console.warn('Error calculating project compatibility:', error);
    return { score: 0, reasons: [] };
  }
}

// Calculate activity patterns score
function calculateActivityPatternsScore(candidate) {
  const reasons = [];
  let score = 0;

  // Check recent activity (profile updates, project creation)
  const userLastSeen = new Date(currentUserProfile.updated_at || currentUserProfile.created_at);
  const candidateLastSeen = new Date(candidate.updated_at || candidate.created_at);
  const now = new Date();

  const userDaysAgo = Math.floor((now - userLastSeen) / (1000 * 60 * 60 * 24));
  const candidateDaysAgo = Math.floor((now - candidateLastSeen) / (1000 * 60 * 60 * 24));

  // Both active recently
  if (userDaysAgo <= 7 && candidateDaysAgo <= 7) {
    score += 0.6;
    reasons.push('Both recently active');
  } else if (candidateDaysAgo <= 30) {
    score += 0.3;
    reasons.push('Recently active');
  }

  // Similar profile completion timing (joined around same time)
  const userJoined = new Date(currentUserProfile.created_at);
  const candidateJoined = new Date(candidate.created_at);
  const joinTimeDiff = Math.abs(userJoined - candidateJoined) / (1000 * 60 * 60 * 24);

  if (joinTimeDiff <= 30) {
    score += 0.4;
    reasons.push('Joined around the same time');
  }

  return { score: Math.min(score, 1), reasons };
}

// Calculate profile completeness score
function calculateProfileCompletenessScore(candidate) {
  const reasons = [];
  let score = 0;

  // Check profile completeness factors
  const hasImage = !!candidate.image_url;
  const hasBio = !!(candidate.bio && candidate.bio.length > 20);
  const hasSkills = !!(candidate.skills && candidate.skills.length > 0);
  const hasRole = !!candidate.user_role;
  const hasAvailability = !!candidate.availability;

  const completenessFactors = [hasImage, hasBio, hasSkills, hasRole, hasAvailability];
  const completenessScore = completenessFactors.filter(Boolean).length / completenessFactors.length;

  score = completenessScore;

  if (completenessScore >= 0.8) {
    reasons.push('Complete profile');
  } else if (completenessScore >= 0.6) {
    reasons.push('Well-maintained profile');
  }

  return { score, reasons };
}

// Helper functions
function parseSkills(skillsString) {
  if (!skillsString) return [];
  return skillsString.split(',').map(s => s.trim()).filter(Boolean);
}

function getSkillCategories(skills) {
  const categories = [];
  for (const [category, categorySkills] of Object.entries(SKILL_CATEGORIES)) {
    const hasSkillInCategory = skills.some(skill => 
      categorySkills.some(catSkill => 
        catSkill.toLowerCase().includes(skill.toLowerCase()) || 
        skill.toLowerCase().includes(catSkill.toLowerCase())
      )
    );
    if (hasSkillInCategory) {
      categories.push(category);
    }
  }
  return categories;
}

// Explain why a connection was suggested
export function explainConnectionSuggestion(suggestion) {
  if (!suggestion.scoreBreakdown || !suggestion.reasons) {
    return 'Suggested based on profile compatibility';
  }

  const topReasons = suggestion.reasons.slice(0, 3);
  const scoreText = `Match Score: ${Math.round(suggestion.score * 100)}%`;
  
  return `${scoreText}\n\n${topReasons.join('\n')}`;
}

// Refresh suggestions (clear cache, recalculate)
export async function refreshSmartSuggestions() {
  
  // Clear any cached data
  if (window.cachedSuggestions) {
    delete window.cachedSuggestions;
  }
  
  // Regenerate suggestions
  const suggestions = await getSmartConnectionSuggestions();
  
  // Dispatch event for UI to update
  const event = new CustomEvent('smart-suggestions-updated', {
    detail: { suggestions }
  });
  document.dispatchEvent(event);
  
  return suggestions;
}

// Enhanced suggestion rendering
export function renderSmartSuggestionCard(suggestion) {
  const initials = suggestion.name.split(' ').map(n => n[0]).join('').toUpperCase();
  const skills = parseSkills(suggestion.skills || '');
  const topReasons = suggestion.reasons?.slice(0, 2) || [];
  
  return `
    <div class="smart-suggestion-card" data-user-id="${suggestion.id}">
      <div class="suggestion-header">
        <div class="suggestion-avatar">
          ${suggestion.image_url 
            ? `<img src="${suggestion.image_url}" alt="${suggestion.name}">` 
            : `<div class="avatar-placeholder">${initials}</div>`
          }
        </div>
        <div class="suggestion-info">
          <div class="suggestion-name">${suggestion.name}</div>
          <div class="suggestion-role">${suggestion.user_role || 'Member'}</div>
          <div class="match-score">
            <i class="fas fa-star"></i> ${Math.round(suggestion.score * 100)}% match
          </div>
        </div>
      </div>
      
      ${topReasons.length > 0 ? `
        <div class="suggestion-reasons">
          ${topReasons.map(reason => `
            <div class="reason-item">
              <i class="fas fa-check-circle"></i> ${reason}
            </div>
          `).join('')}
        </div>
      ` : ''}
      
      ${skills.length > 0 ? `
        <div class="suggestion-skills">
          ${skills.slice(0, 3).map(skill => `
            <span class="skill-tag">${skill}</span>
          `).join('')}
          ${skills.length > 3 ? `<span class="skill-more">+${skills.length - 3} more</span>` : ''}
        </div>
      ` : ''}
      
      <div class="suggestion-actions">
        <button class="btn-connect-smart" onclick="sendSmartConnectionRequest('${suggestion.id}', '${suggestion.name}')">
          <i class="fas fa-user-plus"></i> Connect
        </button>
        <button class="btn-explain" onclick="showConnectionExplanation('${suggestion.id}')" title="Why suggested?">
          <i class="fas fa-info-circle"></i>
        </button>
      </div>
    </div>
  `;
}

// Smart connection request with context
window.sendSmartConnectionRequest = async function(userId, userName) {
  try {
    // Import connection function
    const { sendConnectionRequest } = await import('./connections.js');
    
    const result = await sendConnectionRequest(userId, userName, 'collaborator');
    
    if (result.success) {
      // Track that this was a smart suggestion connection
      if (window.DailyEngagement) {
        await window.DailyEngagement.awardXP(
          window.DailyEngagement.XP_REWARDS.SEND_CONNECTION + 10, // Bonus for smart suggestion
          `Smart connection to ${userName}`
        );
      }
      
      // Refresh suggestions
      await refreshSmartSuggestions();
    }
    
  } catch (error) {
    console.error('Error sending smart connection request:', error);
  }
};

// Show connection explanation
window.showConnectionExplanation = function(userId) {
  // Find the suggestion in current data
  const suggestions = window.cachedSuggestions || [];
  const suggestion = suggestions.find(s => s.id === userId);
  
  if (suggestion) {
    const explanation = explainConnectionSuggestion(suggestion);
    alert(explanation); // Could be replaced with a nice modal
  }
};

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  initSmartConnectionSuggestions();
});

