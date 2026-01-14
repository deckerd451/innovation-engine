/**
 * Remove Duplicate Themes Script
 * 
 * This script identifies and removes duplicate theme circles from the database.
 * Duplicates are identified by matching title (case-insensitive).
 * 
 * For each set of duplicates, it keeps the oldest one (earliest created_at)
 * and deletes the rest.
 */

// Run this in the browser console on dashboard.html

async function removeDuplicateThemes() {
  console.log('🔍 Starting duplicate theme removal...');
  
  const supabase = window.supabase;
  if (!supabase) {
    console.error('❌ Supabase not available');
    return;
  }

  try {
    // 1. Load all themes
    const { data: allThemes, error: loadError } = await supabase
      .from('theme_circles')
      .select('*')
      .order('created_at', { ascending: true }); // Oldest first

    if (loadError) throw loadError;

    console.log(`📊 Found ${allThemes.length} total themes`);

    // 2. Group themes by normalized title
    const themeGroups = {};
    
    allThemes.forEach(theme => {
      const normalizedTitle = theme.title.toLowerCase().trim();
      
      if (!themeGroups[normalizedTitle]) {
        themeGroups[normalizedTitle] = [];
      }
      
      themeGroups[normalizedTitle].push(theme);
    });

    // 3. Find duplicates
    const duplicateGroups = Object.entries(themeGroups)
      .filter(([title, themes]) => themes.length > 1);

    if (duplicateGroups.length === 0) {
      console.log('✅ No duplicate themes found!');
      return;
    }

    console.log(`🔍 Found ${duplicateGroups.length} sets of duplicates:`);
    
    duplicateGroups.forEach(([title, themes]) => {
      console.log(`\n📌 "${title}" (${themes.length} copies):`);
      themes.forEach((theme, idx) => {
        console.log(`  ${idx + 1}. ID: ${theme.id}, Created: ${new Date(theme.created_at).toLocaleString()}, Status: ${theme.status}`);
      });
    });

    // 4. Ask for confirmation
    const confirmed = confirm(
      `Found ${duplicateGroups.length} sets of duplicate themes.\n\n` +
      `This will keep the OLDEST theme in each set and delete the rest.\n\n` +
      `Total themes to delete: ${duplicateGroups.reduce((sum, [_, themes]) => sum + themes.length - 1, 0)}\n\n` +
      `Continue?`
    );

    if (!confirmed) {
      console.log('❌ Cancelled by user');
      return;
    }

    // 5. Delete duplicates (keep the first/oldest in each group)
    let deletedCount = 0;
    const errors = [];

    for (const [title, themes] of duplicateGroups) {
      const [keepTheme, ...deleteThemes] = themes; // Keep first (oldest), delete rest
      
      console.log(`\n🔄 Processing "${title}"...`);
      console.log(`  ✅ Keeping: ${keepTheme.id} (${new Date(keepTheme.created_at).toLocaleString()})`);
      
      for (const theme of deleteThemes) {
        try {
          console.log(`  🗑️  Deleting: ${theme.id} (${new Date(theme.created_at).toLocaleString()})`);
          
          // Delete theme participants first
          const { error: participantsError } = await supabase
            .from('theme_participants')
            .delete()
            .eq('theme_id', theme.id);
          
          if (participantsError) {
            console.warn(`  ⚠️  Warning deleting participants: ${participantsError.message}`);
          }

          // Update projects to point to the kept theme
          const { error: projectsError } = await supabase
            .from('projects')
            .update({ theme_id: keepTheme.id })
            .eq('theme_id', theme.id);
          
          if (projectsError) {
            console.warn(`  ⚠️  Warning updating projects: ${projectsError.message}`);
          }

          // Delete the duplicate theme
          const { error: deleteError } = await supabase
            .from('theme_circles')
            .delete()
            .eq('id', theme.id);
          
          if (deleteError) throw deleteError;
          
          deletedCount++;
          console.log(`  ✅ Deleted successfully`);
          
        } catch (error) {
          console.error(`  ❌ Error deleting ${theme.id}:`, error);
          errors.push({ theme, error });
        }
      }
    }

    // 6. Summary
    console.log('\n' + '='.repeat(50));
    console.log('📊 SUMMARY');
    console.log('='.repeat(50));
    console.log(`✅ Successfully deleted: ${deletedCount} duplicate themes`);
    console.log(`❌ Errors: ${errors.length}`);
    
    if (errors.length > 0) {
      console.log('\n❌ Failed deletions:');
      errors.forEach(({ theme, error }) => {
        console.log(`  - ${theme.title} (${theme.id}): ${error.message}`);
      });
    }

    console.log('\n✨ Done! Refresh the page to see changes.');
    
    // Offer to refresh
    if (confirm('Duplicate themes removed! Refresh the page now?')) {
      window.location.reload();
    }

  } catch (error) {
    console.error('❌ Error during duplicate removal:', error);
  }
}

// Auto-run if this script is executed
console.log('🚀 Duplicate Theme Removal Script Loaded');
console.log('📝 Run: removeDuplicateThemes()');

// Make function available globally
window.removeDuplicateThemes = removeDuplicateThemes;
