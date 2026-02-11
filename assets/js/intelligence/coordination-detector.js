// ================================================================
// COORDINATION DETECTOR - Intelligence Layer
// ================================================================
// Detects moments where multiple actors are converging around
// opportunities, themes, or projects. Surfaces who should act next.
// ================================================================

export class CoordinationDetector {
  constructor() {
    this.momentumWindow = 21; // 3 weeks
    this.recentActivityWindow = 14; // 2 weeks
  }

  /**
   * Detect coordination moments for a user
   * Returns insights about emerging opportunities and convergence
   */
  async detectCoordinationMoments(profile, context) {
    console.log('🧠 Detecting coordination moments for:', profile.name);
    
    const moments = [];
    
    // 1. Detect theme convergence (multiple people + activity)
    const themeConvergence = await this.detectThemeConvergence(profile, context);
    moments.push(...themeConvergence);
    
    // 2. Detect role complementarity (funder + builder + organizer)
    const roleOpportunities = await this.detectRoleComplementarity(profile, context);
    moments.push(...roleOpportunities);
    
    // 3. Detect bridge opportunities (you connect two groups)
    const bridgeOpportunities = await this.detectBridgeOpportunities(profile, context);
    moments.push(...bridgeOpportunities);
    
    // 4. Detect momentum shifts (sudden activity increase)
    const momentumShifts = await this.detectMomentumShifts(profile, context);
    moments.push(...momentumShifts);
    
    // 5. Detect conversation → action opportunities
    const actionOpportunities = await this.detectConversationToAction(profile, context);
    moments.push(...actionOpportunities);
    
    return moments;
  }

  /**
   * Detect theme convergence: multiple people active around same theme
   */
  async detectThemeConvergence(profile, context) {
    const moments = [];
    const cutoffDate = new Date(Date.now() - this.momentumWindow * 24 * 60 * 60 * 1000);
    
    // Get themes user is interested in or participating in
    const userThemes = context.userThemes || [];
    
    for (const themeId of userThemes) {
      // Get recent participants
      const { data: recentParticipants } = await window.supabase
        .from('theme_participants')
        .select(`
          community_id,
          joined_at,
          last_seen_at,
          community:community(id, name, role, user_role)
        `)
        .eq('theme_id', themeId)
        .gte('last_seen_at', cutoffDate.toISOString());
      
      if (!recentParticipants || recentParticipants.length < 3) continue;
      
      // Get theme details
      const { data: theme } = await window.supabase
        .from('theme_circles')
        .select('id, title, description')
        .eq('id', themeId)
        .single();
      
      if (!theme) continue;
      
      // Check for role diversity (funder, organizer, builder, etc.)
      const roles = new Set();
      const userRoles = new Set();
      recentParticipants.forEach(p => {
        if (p.community?.role) roles.add(p.community.role);
        if (p.community?.user_role) userRoles.add(p.community.user_role);
      });
      
      // Check if user is connected to these participants
      const connectedParticipants = recentParticipants.filter(p => 
        context.connectedIds.includes(p.community_id)
      );
      
      // Detect convergence moment
      if (recentParticipants.length >= 3 && (roles.size >= 2 || userRoles.size >= 2)) {
        const reasons = [];
        reasons.push(`${recentParticipants.length} people active in last 3 weeks`);
        
        if (roles.size >= 2) {
          reasons.push(`Multiple roles: ${Array.from(roles).slice(0, 2).join(', ')}`);
        }
        
        if (connectedParticipants.length > 0) {
          reasons.push(`${connectedParticipants.length} of your connections involved`);
        }
        
        moments.push({
          type: 'coordination',
          subtype: 'theme_convergence',
          target_id: themeId,
          score: 60 + (recentParticipants.length * 5) + (roles.size * 10),
          why: reasons,
          action: 'Coordinate',
          message: `Momentum building around "${theme.title}"`,
          detail: `Multiple actors converging - opportunity to coordinate`,
          data: {
            theme_title: theme.title,
            participant_count: recentParticipants.length,
            role_diversity: roles.size,
            connected_count: connectedParticipants.length
          }
        });
      }
    }
    
    return moments;
  }

  /**
   * Detect role complementarity: right mix of people for an outcome
   */
  async detectRoleComplementarity(profile, context) {
    const moments = [];
    
    // Get user's connections with their roles
    const { data: connections } = await window.supabase
      .from('community')
      .select('id, name, role, user_role, interests')
      .in('id', context.connectedIds);
    
    if (!connections || connections.length < 2) return moments;
    
    // Group by shared interests/themes
    const interestGroups = new Map();
    
    connections.forEach(conn => {
      const interests = conn.interests || [];
      interests.forEach(interest => {
        if (!interestGroups.has(interest)) {
          interestGroups.set(interest, []);
        }
        interestGroups.get(interest).push(conn);
      });
    });
    
    // Look for groups with complementary roles
    const keyRoles = ['funder', 'organizer', 'builder', 'designer', 'researcher'];
    
    for (const [interest, people] of interestGroups.entries()) {
      if (people.length < 2) continue;
      
      const roles = new Set();
      people.forEach(p => {
        if (p.role) roles.add(p.role.toLowerCase());
        if (p.user_role) roles.add(p.user_role.toLowerCase());
      });
      
      // Check if we have complementary roles
      const hasComplementaryRoles = Array.from(roles).some(r => 
        keyRoles.some(kr => r.includes(kr))
      );
      
      if (hasComplementaryRoles && roles.size >= 2) {
        const reasons = [];
        reasons.push(`${people.length} connections share interest: ${interest}`);
        reasons.push(`Complementary roles: ${Array.from(roles).slice(0, 2).join(', ')}`);
        reasons.push('You are the connector');
        
        moments.push({
          type: 'coordination',
          subtype: 'role_complementarity',
          target_id: null,
          score: 70 + (roles.size * 10),
          why: reasons,
          action: 'Introduce',
          message: `Team forming around "${interest}"`,
          detail: `You connect people with complementary roles`,
          data: {
            interest,
            people_count: people.length,
            roles: Array.from(roles)
          }
        });
      }
    }
    
    return moments;
  }

  /**
   * Detect bridge opportunities: user connects two otherwise disconnected groups
   */
  async detectBridgeOpportunities(profile, context) {
    const moments = [];
    
    // Get all connections
    const { data: allConnections } = await window.supabase
      .from('connections')
      .select('from_user_id, to_user_id')
      .eq('status', 'accepted');
    
    if (!allConnections) return moments;
    
    // Build adjacency map
    const adjacency = new Map();
    allConnections.forEach(conn => {
      if (!adjacency.has(conn.from_user_id)) adjacency.set(conn.from_user_id, new Set());
      if (!adjacency.has(conn.to_user_id)) adjacency.set(conn.to_user_id, new Set());
      adjacency.get(conn.from_user_id).add(conn.to_user_id);
      adjacency.get(conn.to_user_id).add(conn.from_user_id);
    });
    
    // Find pairs of user's connections that aren't connected to each other
    const userConnections = Array.from(context.connectedIds);
    const bridges = [];
    
    for (let i = 0; i < userConnections.length; i++) {
      for (let j = i + 1; j < userConnections.length; j++) {
        const person1 = userConnections[i];
        const person2 = userConnections[j];
        
        // Check if they're not connected
        const person1Connections = adjacency.get(person1) || new Set();
        if (!person1Connections.has(person2)) {
          bridges.push([person1, person2]);
        }
      }
    }
    
    // If user is a bridge for many pairs, surface top opportunities
    if (bridges.length >= 3) {
      // Get details for top bridge pairs
      const topBridges = bridges.slice(0, 3);
      
      for (const [person1Id, person2Id] of topBridges) {
        const { data: people } = await window.supabase
          .from('community')
          .select('id, name, interests, skills')
          .in('id', [person1Id, person2Id]);
        
        if (!people || people.length !== 2) continue;
        
        // Check for shared interests
        const interests1 = new Set(people[0].interests || []);
        const interests2 = new Set(people[1].interests || []);
        const sharedInterests = Array.from(interests1).filter(i => interests2.has(i));
        
        if (sharedInterests.length > 0) {
          const reasons = [];
          reasons.push(`Both interested in: ${sharedInterests[0]}`);
          reasons.push('Not yet connected');
          reasons.push('You are the bridge');
          
          moments.push({
            type: 'coordination',
            subtype: 'bridge_opportunity',
            target_id: person1Id,
            score: 55 + (sharedInterests.length * 10),
            why: reasons,
            action: 'Introduce',
            message: `Connect ${people[0].name} and ${people[1].name}`,
            detail: `They share interests but aren't connected yet`,
            data: {
              person1: people[0].name,
              person2: people[1].name,
              shared_interests: sharedInterests
            }
          });
        }
      }
    }
    
    return moments;
  }

  /**
   * Detect momentum shifts: sudden increase in activity
   */
  async detectMomentumShifts(profile, context) {
    const moments = [];
    const recentCutoff = new Date(Date.now() - this.recentActivityWindow * 24 * 60 * 60 * 1000);
    const olderCutoff = new Date(Date.now() - (this.recentActivityWindow * 2) * 24 * 60 * 60 * 1000);
    
    // Check project momentum
    for (const projectId of context.projectIds || []) {
      // Count recent activity vs older activity
      const { data: recentActivity } = await window.supabase
        .from('activity_log')
        .select('id')
        .eq('project_id', projectId)
        .gte('created_at', recentCutoff.toISOString());
      
      const { data: olderActivity } = await window.supabase
        .from('activity_log')
        .select('id')
        .eq('project_id', projectId)
        .gte('created_at', olderCutoff.toISOString())
        .lt('created_at', recentCutoff.toISOString());
      
      const recentCount = recentActivity?.length || 0;
      const olderCount = olderActivity?.length || 0;
      
      // Detect momentum shift (2x increase)
      if (recentCount > 0 && recentCount >= olderCount * 2) {
        const { data: project } = await window.supabase
          .from('projects')
          .select('id, title, description')
          .eq('id', projectId)
          .single();
        
        if (project) {
          const reasons = [];
          reasons.push(`Activity doubled in last 2 weeks`);
          reasons.push(`${recentCount} recent actions`);
          reasons.push('Momentum building');
          
          moments.push({
            type: 'coordination',
            subtype: 'momentum_shift',
            target_id: projectId,
            score: 65 + Math.min(recentCount * 5, 30),
            why: reasons,
            action: 'Check In',
            message: `"${project.title}" gaining momentum`,
            detail: `Activity accelerating - good time to engage`,
            data: {
              project_title: project.title,
              recent_activity: recentCount,
              growth_rate: Math.round((recentCount / Math.max(olderCount, 1)) * 100)
            }
          });
        }
      }
    }
    
    return moments;
  }

  /**
   * Detect conversation → action opportunities
   */
  async detectConversationToAction(profile, context) {
    const moments = [];
    const cutoffDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    
    // Get recent message threads with high activity
    const { data: conversations } = await window.supabase
      .from('conversations')
      .select('id, participant_1_id, participant_2_id')
      .or(`participant_1_id.eq.${profile.id},participant_2_id.eq.${profile.id}`);
    
    if (!conversations) return moments;
    
    for (const conv of conversations) {
      // Count recent messages
      const { data: recentMessages } = await window.supabase
        .from('messages')
        .select('id, content')
        .eq('conversation_id', conv.id)
        .gte('created_at', cutoffDate.toISOString())
        .order('created_at', { ascending: false });
      
      if (!recentMessages || recentMessages.length < 5) continue;
      
      // Simple heuristic: look for action keywords in recent messages
      const actionKeywords = ['should', 'could', 'let\'s', 'we can', 'next step', 'follow up', 'schedule', 'meet'];
      const hasActionSignals = recentMessages.some(msg => 
        actionKeywords.some(keyword => msg.content?.toLowerCase().includes(keyword))
      );
      
      if (hasActionSignals) {
        const otherId = conv.participant_1_id === profile.id ? conv.participant_2_id : conv.participant_1_id;
        const { data: other } = await window.supabase
          .from('community')
          .select('id, name')
          .eq('id', otherId)
          .single();
        
        if (other) {
          const reasons = [];
          reasons.push(`${recentMessages.length} messages in last week`);
          reasons.push('Action signals detected');
          reasons.push('Time to move forward');
          
          moments.push({
            type: 'coordination',
            subtype: 'conversation_to_action',
            target_id: otherId,
            score: 50 + Math.min(recentMessages.length * 3, 30),
            why: reasons,
            action: 'Follow Up',
            message: `Active conversation with ${other.name}`,
            detail: `Discussion ready to become action`,
            data: {
              other_name: other.name,
              message_count: recentMessages.length
            }
          });
        }
      }
    }
    
    return moments;
  }
}
