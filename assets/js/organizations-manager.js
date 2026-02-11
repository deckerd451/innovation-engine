// ================================================================
// Organizations Manager - Complete CRUD and Integration
// ================================================================
// Manages organizations, opportunities, and integrates with START flow
// ================================================================

import { getAuthUser, getCommunityUser } from './bootstrapSession.js';

console.log("%c🏢 Organizations Manager - Loading", "color:#ff6b6b; font-weight:bold;");

// ================================================================
// ORGANIZATIONS DATA MANAGEMENT
// ================================================================

/**
 * Seed initial organizations data
 */
async function seedOrganizations() {
  console.log('🌱 Seeding organizations data...');
  
  const supabase = window.supabase;
  if (!supabase) {
    throw new Error('Supabase not available');
  }
  
  // Check if organizations already exist
  const { data: existing } = await supabase
    .from('organizations')
    .select('id')
    .limit(1);
    
  if (existing && existing.length > 0) {
    console.log('📋 Organizations already seeded');
    return;
  }
  
  const sampleOrganizations = [
    {
      name: 'Charleston Tech Hub',
      slug: 'charleston-tech-hub',
      description: 'Connecting Charleston\'s tech community through events, mentorship, and collaboration opportunities.',
      website: 'https://charlestontechhub.com',
      industry: ['Technology', 'Community'],
      size: 'medium',
      location: 'Charleston, SC',
      founded_year: 2018,
      verified: true,
      linkedin_url: 'https://linkedin.com/company/charleston-tech-hub'
    },
    {
      name: 'Lowcountry Startups',
      slug: 'lowcountry-startups',
      description: 'Supporting early-stage startups in the Lowcountry region with funding, mentorship, and resources.',
      website: 'https://lowcountrystartups.org',
      industry: ['Startups', 'Venture Capital'],
      size: 'small',
      location: 'Charleston, SC',
      founded_year: 2020,
      verified: true
    },
    {
      name: 'Digital Health Collective',
      slug: 'digital-health-collective',
      description: 'Advancing healthcare through technology innovation and digital transformation initiatives.',
      website: 'https://digitalhealthcollective.org',
      industry: ['Healthcare', 'Technology'],
      size: 'medium',
      location: 'Charleston, SC',
      founded_year: 2019,
      verified: false
    },
    {
      name: 'Sustainable Charleston',
      slug: 'sustainable-charleston',
      description: 'Environmental sustainability initiatives and green technology development in Charleston.',
      website: 'https://sustainablecharleston.org',
      industry: ['Environment', 'Sustainability'],
      size: 'small',
      location: 'Charleston, SC',
      founded_year: 2017,
      verified: true
    },
    {
      name: 'Creative Coast',
      slug: 'creative-coast',
      description: 'Supporting creative professionals and digital media companies in the Charleston area.',
      website: 'https://creativecoast.org',
      industry: ['Creative', 'Media', 'Design'],
      size: 'medium',
      location: 'Charleston, SC',
      founded_year: 2015,
      verified: true
    },
    {
      name: 'Charleston AI Lab',
      slug: 'charleston-ai-lab',
      description: 'Research and development in artificial intelligence and machine learning applications.',
      website: 'https://charlestonailab.com',
      industry: ['Artificial Intelligence', 'Research'],
      size: 'startup',
      location: 'Charleston, SC',
      founded_year: 2021,
      verified: false
    }
  ];
  
  try {
    // Get current user profile
    const user = await getAuthUser();
    if (!user) {
      throw new Error('User not authenticated');
    }
    
    const profile = await getCommunityUser();
    if (!profile) {
      throw new Error('User profile not found');
    }
    
    // Add created_by to each organization
    const organizationsWithCreator = sampleOrganizations.map(org => ({
      ...org,
      created_by: profile.id
    }));
    
    // Insert organizations
    const { data: insertedOrgs, error: orgError } = await supabase
      .from('organizations')
      .insert(organizationsWithCreator)
      .select();
      
    if (orgError) {
      throw orgError;
    }
    
    console.log('✅ Organizations seeded:', insertedOrgs.length);
    
    // Seed sample opportunities
    await seedOpportunities(insertedOrgs, profile.id);
    
    return insertedOrgs;
    
  } catch (error) {
    console.error('❌ Failed to seed organizations:', error);
    throw error;
  }
}

/**
 * Seed sample opportunities
 */
async function seedOpportunities(organizations, userId) {
  console.log('💼 Seeding opportunities...');
  
  const supabase = window.supabase;
  
  const sampleOpportunities = [
    {
      organization_id: organizations[0].id, // Charleston Tech Hub
      title: 'Frontend Developer Intern',
      description: 'Join our team to build modern web applications using React and TypeScript. Perfect for students or recent graduates looking to gain real-world experience.',
      type: 'internship',
      location: 'Charleston, SC',
      remote_ok: true,
      compensation_type: 'stipend',
      compensation_range: '$1,500/month',
      required_skills: ['JavaScript', 'React', 'HTML', 'CSS'],
      experience_level: 'entry',
      commitment: 'part-time',
      application_email: 'internships@charlestontechhub.com',
      posted_by: userId
    },
    {
      organization_id: organizations[1].id, // Lowcountry Startups
      title: 'Startup Mentor Volunteer',
      description: 'Share your expertise with early-stage entrepreneurs. Help guide startups through challenges and growth opportunities.',
      type: 'volunteer',
      location: 'Charleston, SC',
      remote_ok: true,
      compensation_type: 'unpaid',
      required_skills: ['Business Development', 'Entrepreneurship', 'Mentoring'],
      experience_level: 'senior',
      commitment: 'flexible',
      application_email: 'mentors@lowcountrystartups.org',
      posted_by: userId
    },
    {
      organization_id: organizations[2].id, // Digital Health Collective
      title: 'Healthcare Data Analyst',
      description: 'Analyze healthcare data to identify trends and insights that improve patient outcomes. Work with cutting-edge health tech.',
      type: 'job',
      location: 'Charleston, SC',
      remote_ok: false,
      compensation_type: 'paid',
      compensation_range: '$65,000 - $85,000',
      required_skills: ['Python', 'SQL', 'Healthcare', 'Data Analysis'],
      experience_level: 'mid',
      commitment: 'full-time',
      application_url: 'https://digitalhealthcollective.org/careers',
      posted_by: userId
    },
    {
      organization_id: organizations[3].id, // Sustainable Charleston
      title: 'Environmental Project Coordinator',
      description: 'Coordinate sustainability initiatives and green technology projects. Make a real impact on environmental conservation.',
      type: 'job',
      location: 'Charleston, SC',
      remote_ok: false,
      compensation_type: 'paid',
      compensation_range: '$45,000 - $55,000',
      required_skills: ['Project Management', 'Environmental Science', 'Sustainability'],
      experience_level: 'mid',
      commitment: 'full-time',
      application_email: 'jobs@sustainablecharleston.org',
      posted_by: userId
    },
    {
      organization_id: organizations[4].id, // Creative Coast
      title: 'UX/UI Design Mentorship',
      description: 'One-on-one mentorship program for aspiring designers. Learn from experienced professionals in the creative industry.',
      type: 'mentorship',
      location: 'Charleston, SC',
      remote_ok: true,
      compensation_type: 'unpaid',
      required_skills: ['Design', 'UX/UI', 'Creative'],
      experience_level: 'any',
      commitment: 'flexible',
      application_email: 'mentorship@creativecoast.org',
      posted_by: userId,
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days
    },
    {
      organization_id: organizations[5].id, // Charleston AI Lab
      title: 'Machine Learning Research Assistant',
      description: 'Assist with AI research projects and help develop machine learning models for real-world applications.',
      type: 'internship',
      location: 'Charleston, SC',
      remote_ok: true,
      compensation_type: 'stipend',
      compensation_range: '$2,000/month',
      required_skills: ['Python', 'Machine Learning', 'AI', 'Research'],
      experience_level: 'entry',
      commitment: 'part-time',
      application_email: 'research@charlestonailab.com',
      posted_by: userId
    }
  ];
  
  try {
    const { data: insertedOpps, error } = await supabase
      .from('opportunities')
      .insert(sampleOpportunities)
      .select();
      
    if (error) {
      throw error;
    }
    
    console.log('✅ Opportunities seeded:', insertedOpps.length);
    return insertedOpps;
    
  } catch (error) {
    console.error('❌ Failed to seed opportunities:', error);
    throw error;
  }
}

// ================================================================
// ORGANIZATIONS CRUD OPERATIONS
// ================================================================

/**
 * Get all organizations with summary data
 */
async function getOrganizations(filters = {}) {
  const supabase = window.supabase;
  if (!supabase) {
    throw new Error('Supabase not available');
  }
  
  // Try the view first, fallback to direct table query
  let query;
  try {
    query = supabase
      .from('active_organizations_summary')
      .select('*');
  } catch (viewError) {
    console.warn('⚠️ active_organizations_summary view not available, using direct query');
    query = supabase
      .from('organizations')
      .select(`
        id, name, slug, description, logo_url, banner_url, industry, size, location,
        website, follower_count, opportunity_count, verified, created_at
      `)
      .eq('status', 'active');
  }
    
  // Apply filters
  if (filters.industry) {
    query = query.contains('industry', [filters.industry]);
  }
  
  if (filters.size) {
    query = query.eq('size', filters.size);
  }
  
  if (filters.verified !== undefined) {
    query = query.eq('verified', filters.verified);
  }
  
  if (filters.hasOpportunities) {
    query = query.gt('opportunity_count', 0);
  }
  
  // Default ordering
  query = query.order('follower_count', { ascending: false });
  
  const { data, error } = await query;
  
  if (error) {
    throw error;
  }
  
  return data || [];
}

/**
 * Get organization by ID or slug
 */
async function getOrganization(identifier) {
  const supabase = window.supabase;
  if (!supabase) {
    throw new Error('Supabase not available');
  }
  
  // Try the view first, fallback to direct table query
  let query;
  try {
    query = supabase
      .from('active_organizations_summary')
      .select('*');
  } catch (viewError) {
    console.warn('⚠️ active_organizations_summary view not available, using direct query');
    query = supabase
      .from('organizations')
      .select(`
        id, name, slug, description, logo_url, banner_url, industry, size, location,
        website, follower_count, opportunity_count, verified, created_at
      `)
      .eq('status', 'active');
  }
    
  if (identifier.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
    query = query.eq('id', identifier);
  } else {
    query = query.eq('slug', identifier);
  }
  
  const { data, error } = await query.single();
  
  if (error) {
    throw error;
  }
  
  return data;
}

/**
 * Follow/unfollow an organization
 */
async function toggleOrganizationFollow(organizationId) {
  const supabase = window.supabase;
  if (!supabase) {
    throw new Error('Supabase not available');
  }
  
  const user = await getAuthUser();
  if (!user) {
    throw new Error('User not authenticated');
  }
  
  const profile = await getCommunityUser();
  if (!profile) {
    throw new Error('User profile not found');
  }
  
  // Check if already following
  const { data: existing } = await supabase
    .from('organization_followers')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('community_id', profile.id)
    .single();
    
  if (existing) {
    // Unfollow
    const { error } = await supabase
      .from('organization_followers')
      .delete()
      .eq('id', existing.id);
      
    if (error) {
      throw error;
    }
    
    return { following: false, action: 'unfollowed' };
  } else {
    // Follow
    const { error } = await supabase
      .from('organization_followers')
      .insert({
        organization_id: organizationId,
        community_id: profile.id
      });
      
    if (error) {
      throw error;
    }
    
    return { following: true, action: 'followed' };
  }
}

/**
 * Get opportunities for an organization
 */
async function getOrganizationOpportunities(organizationId) {
  const supabase = window.supabase;
  if (!supabase) {
    throw new Error('Supabase not available');
  }
  
  const { data, error } = await supabase
    .from('opportunities_with_org')
    .select('*')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false });
    
  if (error) {
    throw error;
  }
  
  return data || [];
}

/**
 * Get all opportunities with filters
 */
async function getOpportunities(filters = {}) {
  const supabase = window.supabase;
  if (!supabase) {
    throw new Error('Supabase not available');
  }
  
  // Try the view first, fallback to direct table query
  let query;
  try {
    query = supabase
      .from('opportunities_with_org')
      .select('*');
  } catch (viewError) {
    console.warn('⚠️ opportunities_with_org view not available, using direct query');
    query = supabase
      .from('opportunities')
      .select(`
        *,
        organization:organizations(name, slug, logo_url, verified)
      `)
      .eq('status', 'open');
  }
    
  // Apply filters
  if (filters.type) {
    query = query.eq('type', filters.type);
  }
  
  if (filters.remote_ok !== undefined) {
    query = query.eq('remote_ok', filters.remote_ok);
  }
  
  if (filters.experience_level) {
    query = query.eq('experience_level', filters.experience_level);
  }
  
  if (filters.skills && filters.skills.length > 0) {
    query = query.overlaps('required_skills', filters.skills);
  }
  
  if (filters.organization_id) {
    query = query.eq('organization_id', filters.organization_id);
  }
  
  // Default ordering
  query = query.order('created_at', { ascending: false });
  
  const { data, error } = await query;
  
  if (error) {
    throw error;
  }
  
  return data || [];
}

// ================================================================
// UI COMPONENTS
// ================================================================

/**
 * Create organization card HTML
 */
function createOrganizationCard(org) {
  return `
    <div class="organization-card" data-org-id="${org.id}" style="
      background: linear-gradient(135deg, rgba(255,107,107,0.1), rgba(0,0,0,0.2));
      border: 2px solid rgba(255,107,107,0.3);
      border-radius: 12px;
      padding: 1.5rem;
      cursor: pointer;
      transition: all 0.3s ease;
      position: relative;
    ">
      ${org.verified ? `
        <div style="
          position: absolute;
          top: 1rem;
          right: 1rem;
          background: #00ff88;
          color: #000;
          padding: 0.25rem 0.5rem;
          border-radius: 12px;
          font-size: 0.7rem;
          font-weight: 700;
        ">
          ✓ VERIFIED
        </div>
      ` : ''}
      
      <div style="display: flex; align-items: start; gap: 1rem; margin-bottom: 1rem;">
        ${org.logo_url ? `
          <img src="${org.logo_url}" alt="${org.name}" style="
            width: 60px;
            height: 60px;
            border-radius: 8px;
            object-fit: cover;
            flex-shrink: 0;
          ">
        ` : `
          <div style="
            width: 60px;
            height: 60px;
            background: rgba(255,107,107,0.2);
            border: 2px solid rgba(255,107,107,0.4);
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.5rem;
            color: #ff6b6b;
            flex-shrink: 0;
          ">
            🏢
          </div>
        `}
        
        <div style="flex: 1;">
          <h3 style="color: #fff; margin: 0 0 0.5rem 0; font-size: 1.2rem; font-weight: 600;">
            ${org.name}
          </h3>
          <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.5rem;">
            ${(org.industry || []).slice(0, 2).map(industry => `
              <span style="
                background: rgba(255,107,107,0.2);
                border: 1px solid rgba(255,107,107,0.4);
                border-radius: 12px;
                padding: 0.2rem 0.5rem;
                font-size: 0.7rem;
                color: #ff6b6b;
              ">
                ${industry}
              </span>
            `).join('')}
          </div>
          <p style="color: rgba(255,255,255,0.7); margin: 0; font-size: 0.9rem; line-height: 1.4;">
            ${truncateText(org.description || 'No description available', 120)}
          </p>
        </div>
      </div>
      
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
        <div style="display: flex; gap: 1rem; font-size: 0.8rem; color: rgba(255,255,255,0.6);">
          <span>👥 ${org.follower_count || 0} followers</span>
          <span>💼 ${org.open_opportunities || 0} opportunities</span>
          <span>👨‍💼 ${org.member_count || 0} members</span>
        </div>
      </div>
      
      <div style="display: flex; gap: 0.5rem;">
        <button class="follow-org-btn" data-org-id="${org.id}" style="
          flex: 1;
          background: linear-gradient(135deg, #ff6b6b, #ff6b6bcc);
          border: none;
          border-radius: 8px;
          color: #fff;
          padding: 0.75rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        ">
          Follow
        </button>
        <button class="view-org-btn" data-org-id="${org.id}" style="
          background: rgba(255,255,255,0.1);
          border: 1px solid rgba(255,255,255,0.3);
          border-radius: 8px;
          color: #fff;
          padding: 0.75rem 1rem;
          cursor: pointer;
          transition: all 0.2s;
        ">
          View
        </button>
      </div>
    </div>
  `;
}

/**
 * Create opportunity card HTML
 */
function createOpportunityCard(opp) {
  const typeColors = {
    job: '#00ff88',
    internship: '#00e0ff',
    volunteer: '#ffd700',
    contract: '#ff6b6b',
    mentorship: '#9b59b6'
  };
  
  const typeColor = typeColors[opp.type] || '#00e0ff';
  
  return `
    <div class="opportunity-card" data-opp-id="${opp.id}" style="
      background: linear-gradient(135deg, rgba(155,89,182,0.1), rgba(0,0,0,0.2));
      border: 2px solid rgba(155,89,182,0.3);
      border-radius: 12px;
      padding: 1.5rem;
      cursor: pointer;
      transition: all 0.3s ease;
      position: relative;
    ">
      <div style="
        position: absolute;
        top: 1rem;
        right: 1rem;
        background: ${typeColor}20;
        border: 1px solid ${typeColor}60;
        border-radius: 12px;
        padding: 0.25rem 0.5rem;
        font-size: 0.7rem;
        color: ${typeColor};
        text-transform: uppercase;
        font-weight: 600;
      ">
        ${opp.type}
      </div>
      
      <div style="display: flex; align-items: start; gap: 1rem; margin-bottom: 1rem;">
        ${opp.organization_logo ? `
          <img src="${opp.organization_logo}" alt="${opp.organization_name}" style="
            width: 50px;
            height: 50px;
            border-radius: 8px;
            object-fit: cover;
            flex-shrink: 0;
          ">
        ` : `
          <div style="
            width: 50px;
            height: 50px;
            background: rgba(155,89,182,0.2);
            border: 2px solid rgba(155,89,182,0.4);
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.2rem;
            color: #9b59b6;
            flex-shrink: 0;
          ">
            💼
          </div>
        `}
        
        <div style="flex: 1;">
          <h4 style="color: #fff; margin: 0 0 0.25rem 0; font-size: 1.1rem; font-weight: 600;">
            ${opp.title}
          </h4>
          <p style="color: #9b59b6; margin: 0 0 0.5rem 0; font-size: 0.9rem; font-weight: 500;">
            ${opp.organization_name}
          </p>
          <p style="color: rgba(255,255,255,0.7); margin: 0; font-size: 0.9rem; line-height: 1.4;">
            ${truncateText(opp.description || 'No description available', 100)}
          </p>
        </div>
      </div>
      
      <div style="margin-bottom: 1rem;">
        <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.5rem;">
          ${(opp.required_skills || []).slice(0, 3).map(skill => `
            <span style="
              background: rgba(155,89,182,0.2);
              border: 1px solid rgba(155,89,182,0.4);
              border-radius: 12px;
              padding: 0.2rem 0.5rem;
              font-size: 0.7rem;
              color: #9b59b6;
            ">
              ${skill}
            </span>
          `).join('')}
        </div>
        
        <div style="display: flex; gap: 1rem; font-size: 0.8rem; color: rgba(255,255,255,0.6);">
          ${opp.location ? `<span>📍 ${opp.location}</span>` : ''}
          ${opp.remote_ok ? `<span>🌐 Remote OK</span>` : ''}
          ${opp.compensation_range ? `<span>💰 ${opp.compensation_range}</span>` : ''}
        </div>
      </div>
      
      <button class="apply-opp-btn" data-opp-id="${opp.id}" style="
        width: 100%;
        background: linear-gradient(135deg, #9b59b6, #9b59b6cc);
        border: none;
        border-radius: 8px;
        color: #fff;
        padding: 0.75rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
      ">
        View Opportunity
      </button>
    </div>
  `;
}

/**
 * Truncate text helper
 */
function truncateText(text, maxLength) {
  if (!text || text.length <= maxLength) return text;
  return text.substring(0, maxLength).trim() + '...';
}

// ================================================================
// INITIALIZATION
// ================================================================

/**
 * Initialize organizations system
 */
async function initializeOrganizations() {
  console.log('🏢 Initializing organizations system...');
  
  try {
    // Check if organizations table exists
    const supabase = window.supabase;
    if (!supabase) {
      console.warn('⚠️ Supabase not available, skipping organizations initialization');
      return;
    }
    
    // Test if organizations table exists
    const { data, error } = await supabase
      .from('organizations')
      .select('id')
      .limit(1);
      
    if (error && error.code === '42P01') {
      console.warn('⚠️ Organizations table does not exist. Run ORGANIZATIONS_SCHEMA.sql first.');
      return;
    }
    
    // Seed data if needed
    await seedOrganizations();
    
    console.log('✅ Organizations system initialized');
    
  } catch (error) {
    console.error('❌ Failed to initialize organizations:', error);
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  // Wait for other systems to load
  setTimeout(initializeOrganizations, 2000);
});

// ================================================================
// EXPORTS
// ================================================================

window.OrganizationsManager = {
  seedOrganizations,
  getOrganizations,
  getOrganization,
  toggleOrganizationFollow,
  getOrganizationOpportunities,
  getOpportunities,
  createOrganizationCard,
  createOpportunityCard,
  initialize: initializeOrganizations
};

console.log('✅ Organizations Manager ready');