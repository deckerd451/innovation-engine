// ================================================================
// COORDINATION DETECTOR V2 - True Intelligence Layer
// ================================================================
// Detects emerging coordination moments with explicit reasoning
// Answers: "Why should this person act NOW?"
// ================================================================

export class CoordinationDetectorV2 {
  constructor() {
    this.momentumWindow = 21; // 3 weeks
    this.recentActivityWindow = 14; // 2 weeks
    this.conversationWindow = 7; // 1 week
  }

  /**
   * Detect coordination moments with explicit reasoning
   * Returns insights that explain timing, roles, gaps, and user position
   */
  async detectCoordinationMoments(profile, context, signals) {
    console.log('🧠 Intelligence layer running');
    console.log(`📊 Signals loaded: projects=${signals.projects.length}, connections=${signals.connections.length}, themes=${signals.themes.length}`);
    
    const moments = [];
    
    // 1. Theme convergence (multiple actors + roles)
    const themeConvergence = await this.detectThemeConvergence(profile, context, signals);
    moments.push(...themeConvergence);
    
    // 2. Role complementarity (funder + builder + organizer)
    const roleOpportunities = await this.detectRoleComplementarity(profile, context, signals);
    moments.push(...roleOpportunities);
    
    // 3. Bridge opportunities (you connect two groups)
    const bridgeOpportunities = await this.detectBridgeOpportunities(profile, context, signals);
    moments.push(...bridgeOpportunities);
    
    // 4. Momentum shifts (recent activity spike)
    const momentumShifts = await this.detectMomentumShifts(profile, context, signals);
    moments.push(...momentumShifts);
    
    // 5. Conversation → action readiness
    const actionOpportunities = await this.detectConversationToAction(profile, context, signals);
    moments.push(...actionOpportunities);
    
    console.log(`✨ Coordination moments found: ${moments.length}`);
    
    return moments;
  }

  /**
   * Detect theme convergence with explicit timing reasoning
   */
  async detectThemeConvergence(profile, context, signals) {
    const moments = [];
    const cutoffDate = new Date(Date.now() - this.momentumWindow * 24 * 60 * 60 * 1000);
    
    // Get themes user is interested in or participating in
    const userThemes = context.userThemes || [];
    
    for (const themeId of userThemes) {
      // Get recent participants with roles
      const { data: recentParticipants } = await window.supabase
        .from('theme_participants')
        .select(`
          community_id,
          joined_at,
          last_seen_at,
          community:community_id(id, name, role, user_role)
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
      
      // Analyze role diversity
      const roles = new Set();
      const userRoles = new Set();
      recentParticipants.forEach(p => {
        if (p.community?.role) roles.add(p.community.role.toLowerCase());
        if (p.community?.user_role) userRoles.add(p.community.user_role.toLowerCase());
      });
      
      // Check for key roles
      const keyRoles = ['funder', 'organizer', 'builder'];
      const hasKeyRoles = Array.from([...roles, ...userRoles]).some(r => 
        keyRoles.some(kr => r.includes(kr))
      );
      
      // Check user's connections in this theme
      const connectedParticipants = recentParticipants.filter(p => 
        context.connectedIds.includes(p.community_id)
      );
      
      // Detect convergence: 3+ people, role diversity, recent activity
      if (recentParticipants.length >= 3 && hasKeyRoles) {
        const reasons = [];
        
        // Timing reason
        reasons.push(`${recentParticipants.length} people active in last ${this.momentumWindow} days`);
        
        // Role reason
        const roleList = Array.from([...roles, ...userRoles]).slice(0, 3).join(', ');
        reasons.push(`Multiple roles present: ${roleList}`);
        
        // Position reason
        if (connectedParticipants.length > 0) {
          reasons.push(`You connect ${connectedParticipants.length} participant${connectedParticipants.length > 1 ? 's' : ''}`);
        } else {
          reasons.push('You can bridge this group');
        }
        
        moments.push({
          suggestion_type: 'coordination',
          subtype: 'theme_convergence',
          target_id: themeId,
          score: 65 + (recentParticipants.length * 5) + (roles.size * 10),
          why: reasons,
          source: 'coordination',
          data: {
            suggestionType: 'theme',
            title: theme.title,
            description: theme.description,
            action: 'Coordinate',
            message: `Momentum building around "${theme.title}"`,
            detail: `${recentParticipants.length} actors converging with complementary roles`,
            participant_count: recentParticipants.length,
            role_diversity: roles.size + userRoles.size,
            connected_count: connectedParticipants.length
          }
        });
      }
    }
    
    return moments;
  }

  /**
   * Detect role complementarity with gap analysis
   */
  async detectRoleComplementarity(profile, context, signals) {
    const moments = [];
    
    // Get user's connections with their roles and interests
    const { data: connections } = await window.supabase
      .from('community')
      .select('id, name, role, user_role, interests')
      .in('id', context.connectedIds);
    
    if (!connections || connections.length < 2) return moments;
    
    // Group by shared interests
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
    
    // Analyze each interest group for role complementarity
    const keyRoles = ['funder', 'organizer', 'builder', 'designer', 'researcher'];
    
    for (const [interest, people] of interestGroups.entries()) {
      if (people.length < 2) continue;
      
      const roles = new Set();
      people.forEach(p => {
        if (p.role) roles.add(p.role.toLowerCase());
        if (p.user_role) roles.add(p.user_role.toLowerCase());
      });
      
      // Check for complementary roles
      const presentRoles = Array.from(roles).filter(r => 
        keyRoles.some(kr => r.includes(kr))
      );
      
      if (presentRoles.length >= 2) {
        const reasons = [];
        
        // Overlap reason
        reasons.push(`${people.length} connections share interest: ${interest}`);
        
        // Role reason
        reasons.push(`Complementary roles: ${presentRoles.slice(0, 2).join(', ')}`);
        
        // Position reason
        reasons.push('You are the bridge');
        
        moments.push({
          suggestion_type: 'coordination',
          subtype: 'role_complementarity',
          target_id: people[0].id, // Link to first person for navigation
          score: 70 + (presentRoles.length * 10),
          why: reasons,
          source: 'coordination',
          data: {
            suggestionType: 'person',
            title: `Team forming: ${interest}`,
            description: `${people.map(p => p.name).join(', ')}`,
            action: 'Introduce',
            message: `Team forming around "${interest}"`,
            detail: `You connect ${people.length} people with complementary roles`,
            interest,
            people_count: people.length,
            roles: presentRoles
          }
        });
      }
    }
    
    return moments;
  }

  /**
   * Detect bridge opportunities with explicit gap identification
   */
  async detectBridgeOpportunities(profile, context, signals) {
    const moments = [];
    
    // Get all connections to build network graph
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
    
    // Find pairs of user's connections that aren't connected
    const userConnections = Array.from(context.connectedIds);
    const bridges = [];
    
    for (let i = 0; i < userConnections.length && i < 20; i++) {
      for (let j = i + 1; j < userConnections.length && j < 20; j++) {
        const person1 = userConnections[i];
        const person2 = userConnections[j];
        
        const person1Connections = adjacency.get(person1) || new Set();
        if (!person1Connections.has(person2)) {
          bridges.push([person1, person2]);
        }
      }
    }
    
    // Analyze top bridge opportunities
    if (bridges.length >= 2) {
      const topBridges = bridges.slice(0, 5);
      
      for (const [person1Id, person2Id] of topBridges) {
        const { data: people } = await window.supabase
          .from('community')
          .select('id, name, interests, skills, role, user_role')
          .in('id', [person1Id, person2Id]);
        
        if (!people || people.length !== 2) continue;
        
        // Check for shared interests
        const interests1 = new Set(people[0].interests || []);
        const interests2 = new Set(people[1].interests || []);
        const sharedInterests = Array.from(interests1).filter(i => interests2.has(i));
        
        // Check for complementary roles
        const roles1 = [people[0].role, people[0].user_role].filter(Boolean).map(r => r.toLowerCase());
        const roles2 = [people[1].role, people[1].user_role].filter(Boolean).map(r => r.toLowerCase());
        const hasComplementaryRoles = roles1.some(r1 => 
          roles2.some(r2 => r1 !== r2 && (r1.includes('funder') || r2.includes('funder') || r1.includes('builder') || r2.includes('builder')))
        );
        
        if (sharedInterests.length > 0 || hasComplementaryRoles) {
          const reasons = [];
          
          // Overlap reason
          if (sharedInterests.length > 0) {
            reasons.push(`Both interested in: ${sharedInterests[0]}`);
          }
          
          // Gap reason
          reasons.push('Not yet connected');
          
          // Position reason
          reasons.push('You are the only bridge');
          
          moments.push({
            suggestion_type: 'coordination',
            subtype: 'bridge_opportunity',
            target_id: person1Id,
            score: 60 + (sharedInterests.length * 10) + (hasComplementaryRoles ? 15 : 0),
            why: reasons,
            source: 'coordination',
            data: {
              suggestionType: 'person',
              title: `Connect ${people[0].name} and ${people[1].name}`,
              description: `They share interests but aren't connected yet`,
              action: 'Introduce',
              message: `Bridge opportunity: ${people[0].name} ↔ ${people[1].name}`,
              detail: sharedInterests.length > 0 
                ? `Shared interests: ${sharedInterests.join(', ')}`
                : 'Complementary roles',
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
   * Detect momentum shifts with timing analysis
   */
  async detectMomentumShifts(profile, context, signals) {
    const moments = [];
    const recentCutoff = new Date(Date.now() - this.recentActivityWindow * 24 * 60 * 60 * 1000);
    const olderCutoff = new Date(Date.now() - (this.recentActivityWindow * 2) * 24 * 60 * 60 * 1000);
    
    // Check project momentum for user's projects
    for (const projectId of context.projectIds || []) {
      try {
        // Count recent vs older activity
        // Note: activity_log may not have project_id column, so we catch errors
        const { data: recentActivity, error: recentError } = await window.supabase
          .from('activity_log')
          .select('id, action_type, created_at')
          .eq('project_id', projectId)
          .gte('created_at', recentCutoff.toISOString());
        
        if (recentError) {
          // If project_id column doesn't exist, skip momentum detection
          if (recentError.code === '42703' || recentError.message?.includes('column')) {
            console.warn('⚠️ activity_log.project_id column not found - skipping momentum detection');
            break; // Exit the loop, no point trying other projects
          }
          throw recentError;
        }
        
        const { data: olderActivity, error: olderError } = await window.supabase
          .from('activity_log')
          .select('id')
          .eq('project_id', projectId)
          .gte('created_at', olderCutoff.toISOString())
          .lt('created_at', recentCutoff.toISOString());
        
        if (olderError) throw olderError;
        
        const recentCount = recentActivity?.length || 0;
        const olderCount = olderActivity?.length || 0;
        
        // Detect momentum shift (activity doubled)
        if (recentCount >= 5 && recentCount >= olderCount * 1.5) {
          const { data: project } = await window.supabase
            .from('projects')
            .select('id, title, description')
            .eq('id', projectId)
            .single();
          
          if (project) {
            const reasons = [];
            
            // Timing reason
            reasons.push(`Activity increased ${Math.round((recentCount / Math.max(olderCount, 1)) * 100)}% in last ${this.recentActivityWindow} days`);
            
            // Momentum reason
            reasons.push(`${recentCount} recent actions`);
            
            // Why now reason
            reasons.push('Momentum building - time to engage');
            
            moments.push({
              suggestion_type: 'coordination',
              subtype: 'momentum_shift',
              target_id: projectId,
              score: 65 + Math.min(recentCount * 3, 30),
              why: reasons,
              source: 'coordination',
              data: {
                suggestionType: 'project',
                title: project.title,
                description: project.description,
                action: 'Check In',
                message: `"${project.title}" gaining momentum`,
                detail: `Activity accelerating - ${recentCount} actions in ${this.recentActivityWindow} days`,
                recent_activity: recentCount,
                growth_rate: Math.round((recentCount / Math.max(olderCount, 1)) * 100)
              }
            });
          }
        }
      } catch (err) {
        // Silently skip this project if there's an error
        console.warn(`⚠️ Momentum detection failed for project ${projectId}:`, err.message);
        continue;
      }
    }
    
    return moments;
  }

  /**
   * Detect conversation → action readiness
   */
  async detectConversationToAction(profile, context, signals) {
    const moments = [];
    const cutoffDate = new Date(Date.now() - this.conversationWindow * 24 * 60 * 60 * 1000);
    
    // Get recent conversations
    const { data: conversations } = await window.supabase
      .from('conversations')
      .select('id, participant_1_id, participant_2_id')
      .or(`participant_1_id.eq.${profile.id},participant_2_id.eq.${profile.id}`);
    
    if (!conversations) return moments;
    
    for (const conv of conversations) {
      // Count recent messages
      const { data: recentMessages } = await window.supabase
        .from('messages')
        .select('id, content, created_at')
        .eq('conversation_id', conv.id)
        .gte('created_at', cutoffDate.toISOString())
        .order('created_at', { ascending: false });
      
      if (!recentMessages || recentMessages.length < 5) continue;
      
      // Detect action keywords
      const actionKeywords = ['should', 'could', 'let\'s', 'we can', 'next step', 'follow up', 'schedule', 'meet', 'when can', 'how about'];
      const actionMessages = recentMessages.filter(msg => 
        actionKeywords.some(keyword => msg.content?.toLowerCase().includes(keyword))
      );
      
      if (actionMessages.length >= 2) {
        const otherId = conv.participant_1_id === profile.id ? conv.participant_2_id : conv.participant_1_id;
        const { data: other } = await window.supabase
          .from('community')
          .select('id, name')
          .eq('id', otherId)
          .single();
        
        if (other) {
          const reasons = [];
          
          // Activity reason
          reasons.push(`${recentMessages.length} messages in last ${this.conversationWindow} days`);
          
          // Signal reason
          reasons.push(`${actionMessages.length} action signals detected`);
          
          // Timing reason
          reasons.push('Discussion ready to become action');
          
          moments.push({
            suggestion_type: 'coordination',
            subtype: 'conversation_to_action',
            target_id: otherId,
            score: 55 + Math.min(actionMessages.length * 5, 25),
            why: reasons,
            source: 'coordination',
            data: {
              suggestionType: 'person',
              title: `Follow up with ${other.name}`,
              description: `Active conversation with action signals`,
              action: 'Follow Up',
              message: `Active conversation with ${other.name}`,
              detail: `${actionMessages.length} action signals in ${recentMessages.length} messages`,
              other_name: other.name,
              message_count: recentMessages.length,
              action_signals: actionMessages.length
            }
          });
        }
      }
    }
    
    return moments;
  }
}
