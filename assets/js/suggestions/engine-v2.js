// ================================================================
// DAILY SUGGESTIONS ENGINE V2 - "Thinking" Intelligence Layer
// ================================================================
// Generates personalized suggestions with explicit reasoning
// Detects coordination moments and surfaces "why now"
// MANDATORY: Project suggestions for both join AND recruit
// ================================================================

import * as queries from './queries.js';
import { CoordinationDetectorV2 } from '../intelligence/coordination-detector-v2.js';

export class DailySuggestionsEngineV2 {
  constructor(store) {
    this.store = store;
    this.minSuggestions = 5;
    this.maxSuggestions = 10;
    this.cooldownDays = 7;
    this.coordinationDetector = new CoordinationDetectorV2();
  }

  /**
   * Ensure today's suggestions exist, generate if needed
   */
  async ensureTodaysSuggestions() {
    const today = this.getTodayKey();
    const profile = await queries.getCurrentUserProfile();
    
    // Check if we already have suggestions for today
    const existing = await this.store.getSuggestionsForDate(profile.id, today);
    
    if (existing && existing.length >= this.minSuggestions) {
      console.log(`✅ Found ${existing.length} suggestions for today`);
      return existing;
    }
    
    console.log('🔄 Generating new suggestions for today...');
    const suggestions = await this.generateSuggestions(profile);
    
    // Store suggestions
    await this.store.storeSuggestions(profile.id, today, suggestions);
    
    console.log(`✅ Generated ${suggestions.length} suggestions for today`);
    return suggestions;
  }

  /**
   * Generate suggestions with intelligence layer
   */
  async generateSuggestions(profile) {
    console.log('🧠 Intelligence layer running');
    console.log(`🎯 Generating suggestions for: ${profile.name}`);
    
    // Get user's current state
    const [
      connectedIds,
      pendingIds,
      projectIds,
      projectRequestIds,
      themeIds,
      orgIds,
      ownedProjects
    ] = await Promise.all([
      queries.getUserConnections(profile.id),
      queries.getPendingConnectionRequests(profile.id),
      queries.getUserProjectMemberships(profile.id),
      queries.getUserProjectRequests(profile.id),
      queries.getUserThemeParticipations(profile.id),
      queries.getUserOrganizationMemberships(profile.id),
      queries.getUserOwnedProjects(profile.id)
    ]);
    
    // Build context for coordination detection
    const context = {
      connectedIds,
      pendingIds,
      projectIds: [...projectIds, ...projectRequestIds],
      userThemes: themeIds,
      orgIds,
      ownedProjects
    };
    
    // Build signals for intelligence layer
    const signals = {
      projects: [...projectIds, ...projectRequestIds],
      connections: connectedIds,
      themes: themeIds,
      organizations: orgIds
    };
    
    console.log(`📊 Signals loaded: projects=${signals.projects.length}, connections=${signals.connections.length}, themes=${signals.themes.length}`);
    
    // Get cooldown list
    const cooldownList = await this.store.getRecentSuggestions(
      profile.id,
      this.cooldownDays
    );
    
    // 🧠 INTELLIGENCE LAYER: Detect coordination moments FIRST
    const coordinationMoments = await this.coordinationDetector.detectCoordinationMoments(
      profile,
      context,
      signals
    );
    
    // Generate traditional suggestions in parallel
    const [people, projectsJoin, projectsRecruit, themes, orgs] = await Promise.all([
      this.generatePeopleSuggestions(profile, connectedIds, pendingIds, cooldownList),
      this.generateProjectJoinSuggestions(profile, [...projectIds, ...projectRequestIds], cooldownList),
      this.generateProjectRecruitSuggestions(profile, ownedProjects, connectedIds, cooldownList),
      this.generateThemeSuggestions(profile, themeIds, cooldownList),
      this.generateOrganizationSuggestions(profile, orgIds, cooldownList)
    ]);
    
    // Log suggestion breakdown
    console.log(`📦 Suggestions by type: people=${people.length}, projects_join=${projectsJoin.length}, projects_recruit=${projectsRecruit.length}, themes=${themes.length}, orgs=${orgs.length}`);
    
    // Combine all suggestions
    const allSuggestions = [
      ...coordinationMoments,
      ...people,
      ...projectsJoin,
      ...projectsRecruit,
      ...themes,
      ...orgs
    ].sort((a, b) => b.score - a.score);
    
    // Take top suggestions
    let finalSuggestions = allSuggestions.slice(0, this.maxSuggestions);
    
    // Ensure minimum count with fallback
    if (finalSuggestions.length < this.minSuggestions) {
      const fallback = await this.generateFallbackSuggestions(
        profile,
        this.minSuggestions - finalSuggestions.length,
        cooldownList
      );
      finalSuggestions = [...finalSuggestions, ...fallback];
    }
    
    // Count coordination vs standard
    const coordinationCount = finalSuggestions.filter(s => s.source === 'coordination').length;
    const standardCount = finalSuggestions.length - coordinationCount;
    
    console.log(`🎯 Final mix: coordination=${coordinationCount} + standard=${standardCount}`);
    
    return finalSuggestions;
  }

  /**
   * Generate people suggestions
   */
  async generatePeopleSuggestions(profile, connectedIds, pendingIds, cooldownList) {
    const excludeIds = [...connectedIds, ...pendingIds, profile.id];
    const cooldownPeople = cooldownList
      .filter(s => s.suggestion_type === 'person')
      .map(s => s.target_id);
    
    const candidates = await queries.getCandidatePeople(profile.id, [...excludeIds, ...cooldownPeople]);
    
    const suggestions = [];
    const allConnections = await queries.getAllConnections();
    
    for (const person of candidates) {
      const reasons = [];
      let score = 0;
      
      // Shared interests
      const sharedInterests = this.findSharedKeywords(
        profile.interests || [],
        person.interests || []
      );
      if (sharedInterests.length > 0) {
        score += sharedInterests.length * 10;
        reasons.push(`Shared interest: ${sharedInterests[0]}`);
      }
      
      // Shared skills
      const sharedSkills = this.findSharedKeywords(
        this.parseSkills(profile.skills),
        this.parseSkills(person.skills)
      );
      if (sharedSkills.length > 0) {
        score += sharedSkills.length * 15;
        reasons.push(`Matches your skill: ${sharedSkills[0]}`);
      }
      
      // Mutual connections
      const mutualCount = await queries.getMutualConnections(
        profile.id,
        person.id,
        allConnections
      );
      if (mutualCount > 0) {
        score += mutualCount * 20;
        reasons.push(`${mutualCount} mutual connection${mutualCount > 1 ? 's' : ''}`);
      }
      
      // Recently active (timing)
      if (person.last_activity_date) {
        const daysSinceActive = this.daysSince(person.last_activity_date);
        if (daysSinceActive <= 7) {
          score += 10;
          reasons.push('Active this week');
        }
      }
      
      // High connection count
      if (person.connection_count > 10) {
        score += 5;
      }
      
      if (score > 0 && reasons.length > 0) {
        suggestions.push({
          suggestion_type: 'person',
          target_id: person.id,
          score,
          why: reasons.slice(0, 3),
          source: 'heuristic',
          data: {
            suggestionType: 'person',
            name: person.name,
            bio: person.bio
          }
        });
      }
    }
    
    return suggestions;
  }

  /**
   * Generate project JOIN suggestions (projects user is NOT a member of)
   */
  async generateProjectJoinSuggestions(profile, excludeIds, cooldownList) {
    const cooldownProjects = cooldownList
      .filter(s => s.suggestion_type === 'project_join')
      .map(s => s.target_id);
    
    const candidates = await queries.getCandidateProjects(
      profile.id,
      [...excludeIds, ...cooldownProjects]
    );
    
    const suggestions = [];
    const userSkills = this.parseSkills(profile.skills);
    const userInterests = profile.interests || [];
    
    for (const project of candidates) {
      const reasons = [];
      let score = 0;
      
      // Required skills match
      const requiredSkills = project.required_skills || [];
      const matchingSkills = this.findSharedKeywords(userSkills, requiredSkills);
      if (matchingSkills.length > 0) {
        score += matchingSkills.length * 20;
        reasons.push(`Needs your skill: ${matchingSkills[0]}`);
      }
      
      // Tags/interests overlap
      const projectTags = project.tags || [];
      const matchingTags = this.findSharedKeywords(userInterests, projectTags);
      if (matchingTags.length > 0) {
        score += matchingTags.length * 10;
        reasons.push(`Matches interest: ${matchingTags[0]}`);
      }
      
      // Recently updated (timing)
      if (project.updated_at) {
        const daysSinceUpdate = this.daysSince(project.updated_at);
        if (daysSinceUpdate <= 7) {
          score += 15;
          reasons.push('Updated this week');
        }
      }
      
      // Theme connection
      if (project.theme_id) {
        const userThemes = await queries.getUserThemeParticipations(profile.id);
        if (userThemes.includes(project.theme_id)) {
          score += 25;
          reasons.push('In your theme');
        }
      }
      
      if (score > 0 && reasons.length > 0) {
        suggestions.push({
          suggestion_type: 'project_join',
          target_id: project.id,
          score,
          why: reasons.slice(0, 3),
          source: 'heuristic',
          data: {
            suggestionType: 'project',
            title: project.title,
            description: project.description,
            action: 'Join Project'
          }
        });
      }
    }
    
    return suggestions;
  }

  /**
   * Generate project RECRUIT suggestions (for projects user owns/leads)
   * MANDATORY: Even heavy project creators must receive these
   */
  async generateProjectRecruitSuggestions(profile, ownedProjects, connectedIds, cooldownList) {
    const suggestions = [];
    
    if (!ownedProjects || ownedProjects.length === 0) {
      return suggestions; // No owned projects, skip
    }
    
    const cooldownRecruit = cooldownList
      .filter(s => s.suggestion_type === 'project_recruit')
      .map(s => s.target_id);
    
    // For each owned project, suggest recruitment actions
    for (const projectId of ownedProjects) {
      if (cooldownRecruit.includes(projectId)) continue;
      
      // Get project details
      const { data: project } = await window.supabase
        .from('projects')
        .select('id, title, description, required_skills, tags, status')
        .eq('id', projectId)
        .single();
      
      if (!project) continue;
      
      // Get current members
      const { data: members } = await window.supabase
        .from('project_members')
        .select('user_id')
        .eq('project_id', projectId)
        .is('left_at', null);
      
      const memberCount = members?.length || 0;
      const reasons = [];
      let score = 0;
      
      // Small team (needs more people)
      if (memberCount < 5) {
        score += 30;
        reasons.push(`Only ${memberCount} member${memberCount !== 1 ? 's' : ''} - needs collaborators`);
      }
      
      // Has required skills (can recruit for specific skills)
      const requiredSkills = project.required_skills || [];
      if (requiredSkills.length > 0) {
        score += 20;
        reasons.push(`Needs skills: ${requiredSkills.slice(0, 2).join(', ')}`);
      }
      
      // Active project (good time to recruit)
      if (project.status === 'in-progress') {
        score += 15;
        reasons.push('Active project - good time to recruit');
      }
      
      // User has connections (can invite)
      if (connectedIds.length > 0) {
        score += 10;
        reasons.push(`You have ${connectedIds.length} connections to invite`);
      }
      
      if (score > 0 && reasons.length > 0) {
        suggestions.push({
          suggestion_type: 'project_recruit',
          target_id: projectId,
          score,
          why: reasons.slice(0, 3),
          source: 'heuristic',
          data: {
            suggestionType: 'project',
            title: project.title,
            description: project.description,
            action: 'Recruit Collaborators',
            member_count: memberCount,
            required_skills: requiredSkills
          }
        });
      }
    }
    
    return suggestions;
  }

  /**
   * Generate theme suggestions
   */
  async generateThemeSuggestions(profile, excludeIds, cooldownList) {
    const cooldownThemes = cooldownList
      .filter(s => s.suggestion_type === 'theme')
      .map(s => s.target_id);
    
    const candidates = await queries.getCandidateThemes([...excludeIds, ...cooldownThemes]);
    
    const suggestions = [];
    const userInterests = profile.interests || [];
    const userBio = profile.bio || '';
    
    for (const theme of candidates) {
      const reasons = [];
      let score = 0;
      
      // Tags/interests overlap
      const themeTags = theme.tags || [];
      const matchingTags = this.findSharedKeywords(userInterests, themeTags);
      if (matchingTags.length > 0) {
        score += matchingTags.length * 15;
        reasons.push(`Matches interest: ${matchingTags[0]}`);
      }
      
      // Bio keyword match
      const bioKeywords = this.extractKeywords(userBio);
      const themeKeywords = this.extractKeywords(theme.description || '');
      const matchingKeywords = this.findSharedKeywords(bioKeywords, themeKeywords);
      if (matchingKeywords.length > 0) {
        score += matchingKeywords.length * 10;
        reasons.push('Related to your profile');
      }
      
      // High activity score
      if (theme.activity_score > 50) {
        score += 20;
        reasons.push('Highly active theme');
      }
      
      // Recently active (timing)
      if (theme.last_activity_at) {
        const daysSinceActive = this.daysSince(theme.last_activity_at);
        if (daysSinceActive <= 7) {
          score += 10;
          reasons.push('Active this week');
        }
      }
      
      // Connected users participating
      const participants = await queries.getThemeParticipants(theme.id);
      const userConnections = await queries.getUserConnections(profile.id);
      const connectedParticipants = participants.filter(p => userConnections.includes(p));
      if (connectedParticipants.length > 0) {
        score += connectedParticipants.length * 15;
        reasons.push(`${connectedParticipants.length} connection${connectedParticipants.length > 1 ? 's' : ''} participating`);
      }
      
      if (score > 0 && reasons.length > 0) {
        suggestions.push({
          suggestion_type: 'theme',
          target_id: theme.id,
          score,
          why: reasons.slice(0, 3),
          source: 'heuristic',
          data: {
            suggestionType: 'theme',
            title: theme.title,
            description: theme.description
          }
        });
      }
    }
    
    return suggestions;
  }

  /**
   * Generate organization suggestions
   */
  async generateOrganizationSuggestions(profile, excludeIds, cooldownList) {
    const cooldownOrgs = cooldownList
      .filter(s => s.suggestion_type === 'org')
      .map(s => s.target_id);
    
    const candidates = await queries.getCandidateOrganizations([...excludeIds, ...cooldownOrgs]);
    
    const suggestions = [];
    const userInterests = profile.interests || [];
    
    for (const org of candidates) {
      const reasons = [];
      let score = 0;
      
      // Industry match
      const orgIndustries = org.industry || [];
      const matchingIndustries = this.findSharedKeywords(userInterests, orgIndustries);
      if (matchingIndustries.length > 0) {
        score += matchingIndustries.length * 15;
        reasons.push(`Industry: ${matchingIndustries[0]}`);
      }
      
      // High follower count
      if (org.follower_count > 10) {
        score += 10;
        reasons.push('Popular organization');
      }
      
      // Has opportunities
      if (org.opportunity_count > 0) {
        score += 20;
        reasons.push(`${org.opportunity_count} open opportunit${org.opportunity_count > 1 ? 'ies' : 'y'}`);
      }
      
      // Recently updated (timing)
      if (org.updated_at) {
        const daysSinceUpdate = this.daysSince(org.updated_at);
        if (daysSinceUpdate <= 14) {
          score += 10;
          reasons.push('Recently active');
        }
      }
      
      if (score > 0 && reasons.length > 0) {
        suggestions.push({
          suggestion_type: 'org',
          target_id: org.id,
          score,
          why: reasons.slice(0, 3),
          source: 'heuristic',
          data: {
            suggestionType: 'org',
            name: org.name,
            description: org.description
          }
        });
      }
    }
    
    return suggestions;
  }

  /**
   * Generate fallback suggestions (never show 0)
   */
  async generateFallbackSuggestions(profile, count, cooldownList) {
    console.log(`🔄 Generating ${count} fallback suggestions...`);
    
    const suggestions = [];
    
    // Get recently active projects
    const { data: recentProjects } = await window.supabase
      .from('projects')
      .select('id, title, description, updated_at')
      .eq('status', 'in-progress')
      .order('updated_at', { ascending: false })
      .limit(count);
    
    recentProjects?.forEach(project => {
      suggestions.push({
        suggestion_type: 'project_join',
        target_id: project.id,
        score: 5,
        why: ['Recently updated project'],
        source: 'fallback',
        data: {
          suggestionType: 'project',
          title: project.title,
          description: project.description,
          action: 'Join Project'
        }
      });
    });
    
    // Get high-activity themes
    if (suggestions.length < count) {
      const { data: activeThemes } = await window.supabase
        .from('theme_circles')
        .select('id, title, description, activity_score')
        .eq('status', 'active')
        .order('activity_score', { ascending: false, nullsFirst: false })
        .limit(count - suggestions.length);
      
      activeThemes?.forEach(theme => {
        suggestions.push({
          suggestion_type: 'theme',
          target_id: theme.id,
          score: 5,
          why: ['High-activity theme'],
          source: 'fallback',
          data: {
            suggestionType: 'theme',
            title: theme.title,
            description: theme.description
          }
        });
      });
    }
    
    // Get recently active users
    if (suggestions.length < count) {
      const { data: activeUsers } = await window.supabase
        .from('community')
        .select('id, name, bio, last_activity_date')
        .neq('id', profile.id)
        .order('last_activity_date', { ascending: false, nullsFirst: false })
        .limit(count - suggestions.length);
      
      activeUsers?.forEach(user => {
        suggestions.push({
          suggestion_type: 'person',
          target_id: user.id,
          score: 5,
          why: ['Recently active user'],
          source: 'fallback',
          data: {
            suggestionType: 'person',
            name: user.name,
            bio: user.bio
          }
        });
      });
    }
    
    return suggestions.slice(0, count);
  }

  // ================================================================
  // UTILITY METHODS
  // ================================================================

  getTodayKey() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  parseSkills(skills) {
    if (!skills) return [];
    if (Array.isArray(skills)) return skills;
    if (typeof skills === 'string') {
      return skills.split(',').map(s => s.trim()).filter(Boolean);
    }
    return [];
  }

  extractKeywords(text) {
    if (!text) return [];
    return text
      .toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 3)
      .slice(0, 20);
  }

  findSharedKeywords(arr1, arr2) {
    const set1 = new Set(arr1.map(s => String(s).toLowerCase()));
    const set2 = new Set(arr2.map(s => String(s).toLowerCase()));
    return Array.from(set1).filter(item => set2.has(item));
  }

  daysSince(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }
}
