// ================================================================
// BROWSER CONSOLE SCRIPT: Seed AI in Healthcare Theme
// ================================================================
// Run this in the browser console while logged in to seed:
// 1. User dmhamilton1@live.com as participant in AI Healthcare theme
// 2. "maslow wearable" project linked to that theme
// ================================================================

(async function seedAIHealthcareTheme() {
  console.log('🌱 Starting AI Healthcare theme seeding...');

  try {
    // Check if supabase is available
    if (!window.supabase) {
      throw new Error('Supabase not available. Please ensure you are logged in.');
    }

    const supabase = window.supabase;

    // Step 1: Find AI in Healthcare theme
    console.log('📋 Step 1: Finding AI in Healthcare theme...');
    const { data: themes, error: themeError } = await supabase
      .from('theme_circles')
      .select('*')
      .or('title.ilike.%ai%healthcare%,title.ilike.%healthcare%ai%')
      .limit(1);

    if (themeError) throw themeError;

    if (!themes || themes.length === 0) {
      throw new Error('AI in Healthcare theme not found. Please create it first.');
    }

    const theme = themes[0];
    console.log('✅ Found theme:', theme.title, '(ID:', theme.id + ')');

    // Step 2: Find user by email
    console.log('📋 Step 2: Finding user dmhamilton1@live.com...');
    const { data: users, error: userError } = await supabase
      .from('community')
      .select('*')
      .eq('email', 'dmhamilton1@live.com')
      .limit(1);

    if (userError) throw userError;

    if (!users || users.length === 0) {
      throw new Error('User dmhamilton1@live.com not found. Please ensure user is registered.');
    }

    const user = users[0];
    console.log('✅ Found user:', user.name, '(ID:', user.id + ')');

    // Step 3: Add user as participant to theme
    console.log('📋 Step 3: Adding user as participant to theme...');
    const { error: participantError } = await supabase
      .from('theme_participants')
      .upsert({
        theme_id: theme.id,
        community_id: user.id,
        engagement_level: 'leading',
        signals: 'leading',
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'theme_id,community_id'
      });

    if (participantError) throw participantError;
    console.log('✅ Added user as leading participant to theme');

    // Step 4: Find maslow wearable project
    console.log('📋 Step 4: Finding maslow wearable project...');
    const { data: projects, error: projectError } = await supabase
      .from('projects')
      .select('*')
      .or('title.ilike.%maslow%wearable%,name.ilike.%maslow%wearable%')
      .limit(1);

    if (projectError) throw projectError;

    let project;
    if (!projects || projects.length === 0) {
      // Create the project if it doesn't exist
      console.log('⚠️  Project not found. Creating maslow wearable project...');
      const { data: newProject, error: createError } = await supabase
        .from('projects')
        .insert({
          title: 'Maslow Wearable',
          name: 'Maslow Wearable',
          description: 'AI-powered wearable device for healthcare monitoring and wellness tracking',
          creator_id: user.id,
          theme_id: theme.id,
          status: 'active',
          required_skills: ['AI', 'Healthcare', 'Wearables', 'IoT'],
          tags: ['AI', 'Healthcare', 'Wearables']
        })
        .select()
        .single();

      if (createError) throw createError;
      project = newProject;
      console.log('✅ Created project:', project.title, '(ID:', project.id + ')');
    } else {
      project = projects[0];
      console.log('✅ Found project:', project.title, '(ID:', project.id + ')');

      // Update project to link to theme
      console.log('📋 Step 5: Linking project to theme...');
      const { error: updateError } = await supabase
        .from('projects')
        .update({ theme_id: theme.id })
        .eq('id', project.id);

      if (updateError) throw updateError;
      console.log('✅ Linked project to theme');
    }

    // Step 5: Ensure user is creator/member of the project
    console.log('📋 Step 6: Ensuring user is creator of project...');
    const { error: memberError } = await supabase
      .from('project_members')
      .upsert({
        project_id: project.id,
        user_id: user.id,
        community_id: user.id,
        role: 'creator',
        joined_at: new Date().toISOString()
      }, {
        onConflict: 'project_id,community_id'
      });

    if (memberError) throw memberError;
    console.log('✅ User is now creator of project');

    // Success summary
    console.log('\n🎉 ===== SEEDING COMPLETE! =====');
    console.log('✅ Theme:', theme.title, '(', theme.id, ')');
    console.log('✅ User:', user.name, '(', user.email, ')');
    console.log('✅ Project:', project.title, '(', project.id, ')');
    console.log('\n💡 Refresh the page to see the changes in the visualization!');

    // Trigger refresh if available
    if (typeof window.refreshSynapseConnections === 'function') {
      console.log('🔄 Refreshing synapse view...');
      await window.refreshSynapseConnections();
      console.log('✅ Synapse view refreshed!');
    }

    return {
      success: true,
      theme,
      user,
      project
    };

  } catch (error) {
    console.error('❌ Error seeding AI Healthcare theme:', error);
    console.error('Error details:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
})();
