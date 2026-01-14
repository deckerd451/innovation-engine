// PASTE THIS ENTIRE SCRIPT INTO BROWSER CONSOLE ON dashboard.html
// Then run: removeDuplicates()

async function removeDuplicates() {
  console.log('🔍 Loading themes...');
  
  const { data: themes, error } = await window.supabase
    .from('theme_circles')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log(`📊 Total themes: ${themes.length}`);

  // Group by title (case-insensitive)
  const groups = {};
  themes.forEach(t => {
    const key = t.title.toLowerCase().trim();
    if (!groups[key]) groups[key] = [];
    groups[key].push(t);
  });

  // Find duplicates
  const dupes = Object.entries(groups).filter(([_, ts]) => ts.length > 1);
  
  if (dupes.length === 0) {
    console.log('✅ No duplicates found!');
    return;
  }

  console.log(`\n🔍 Found ${dupes.length} duplicate sets:\n`);
  
  let toDelete = [];
  dupes.forEach(([title, ts]) => {
    console.log(`📌 "${title}" (${ts.length} copies):`);
    ts.forEach((t, i) => {
      const action = i === 0 ? '✅ KEEP' : '🗑️ DELETE';
      console.log(`  ${action}: ${t.id.substring(0, 8)}... created ${new Date(t.created_at).toLocaleDateString()}`);
      if (i > 0) toDelete.push(t);
    });
  });

  console.log(`\n⚠️ Will delete ${toDelete.length} duplicate themes`);
  
  if (!confirm(`Delete ${toDelete.length} duplicate themes?`)) {
    console.log('❌ Cancelled');
    return;
  }

  // Delete duplicates
  let deleted = 0;
  for (const theme of toDelete) {
    try {
      // Delete participants
      await window.supabase
        .from('theme_participants')
        .delete()
        .eq('theme_id', theme.id);

      // Delete theme
      const { error: delError } = await window.supabase
        .from('theme_circles')
        .delete()
        .eq('id', theme.id);

      if (delError) throw delError;
      
      deleted++;
      console.log(`✅ Deleted: ${theme.title}`);
    } catch (e) {
      console.error(`❌ Failed to delete ${theme.title}:`, e);
    }
  }

  console.log(`\n✨ Done! Deleted ${deleted}/${toDelete.length} duplicates`);
  
  if (confirm('Refresh page now?')) {
    location.reload();
  }
}

console.log('✅ Script loaded! Run: removeDuplicates()');
