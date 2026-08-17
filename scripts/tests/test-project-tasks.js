// ================================================================
// Project Tasks Test Script
// ================================================================
// Live-database smoke test for the Tasks feature (project_tasks table +
// window.ProjectTasks). Run this in the browser console after signing in,
// same convention as test-profile-linking.js.
//
// Usage:
// 1. Open the browser console on the dashboard while signed in
// 2. Copy and paste this entire script
// 3. Run: await testProjectTasks()
//
// The script creates a throwaway project owned by the signed-in user,
// exercises task CRUD/status/ordering/authorization against it, then
// archives the test project and deletes the test tasks it created. It
// does not touch any other project's data.
// ================================================================

window.testProjectTasks = async function () {
  console.log('🧪 ========================================');
  console.log('🧪 PROJECT TASKS TEST');
  console.log('🧪 ========================================');

  const results = [];
  function record(name, pass, detail) {
    results.push({ name, pass, detail });
    console.log(`${pass ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
  }

  if (!window.supabase) {
    console.error('❌ Supabase client not available');
    return { success: false, reason: 'no supabase client' };
  }
  if (!window.ProjectTasks) {
    console.error('❌ window.ProjectTasks not loaded (assets/js/project-tasks.js)');
    return { success: false, reason: 'ProjectTasks module missing' };
  }

  const supabase = window.supabase;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    console.error('❌ No user signed in');
    return { success: false, reason: 'not signed in' };
  }

  const { data: me, error: meErr } = await supabase
    .from('community')
    .select('id, name')
    .eq('user_id', user.id)
    .single();
  if (meErr || !me) {
    console.error('❌ Could not resolve community profile for signed-in user:', meErr);
    return { success: false, reason: 'no community profile' };
  }
  console.log(`👤 Testing as: ${me.name} (${me.id})`);

  let testProjectId = null;
  const createdTaskIds = [];

  try {
    // --- Setup: throwaway project owned by the current user ---
    const { data: project, error: projErr } = await supabase
      .from('projects')
      .insert([{
        title: `__task-test-${Date.now()}`,
        description: 'Throwaway project created by test-project-tasks.js',
        creator_id: me.id,
        status: 'active',
      }])
      .select()
      .single();
    if (projErr) throw new Error('Setup failed: could not create test project — ' + projErr.message);
    testProjectId = project.id;
    console.log(`📁 Created test project ${testProjectId}`);

    // 1. Persistence + 2. belongs to correct project
    const created = await window.ProjectTasks.createTask(testProjectId, { title: 'Update sponsor section' }, me.id);
    createdTaskIds.push(created.id);
    record('1. Task persists with an id', !!created.id);
    record('2. Task belongs to the correct project', created.project_id === testProjectId);
    record('Default status is open', created.status === 'open');
    record('Default priority is medium', created.priority === 'medium');

    // 3. Authorized user (creator) can create — implied by the above succeeding
    record('3. Authorized user (creator) can create tasks', !!created.id);

    // 4. Authorized user can edit
    const edited = await window.ProjectTasks.updateTask(created, { title: 'Update HarborHack sponsor section', description: 'Refresh logos' }, me.id);
    record('4. Authorized user can edit title/description', edited.title === 'Update HarborHack sponsor section' && edited.description === 'Refresh logos');

    // 5. Authorized user can update status + 6. completion timestamp set
    const inProgress = await window.ProjectTasks.updateTask(edited, { status: 'in_progress' }, me.id);
    record('5. Status moves open → in_progress', inProgress.status === 'in_progress');
    const done = await window.ProjectTasks.updateTask(inProgress, { status: 'done' }, me.id);
    record('6. completed_at is set when status becomes done', !!done.completed_at);

    // 7. Reopening clears completion timestamp
    const reopened = await window.ProjectTasks.updateTask(done, { status: 'open' }, me.id);
    record('7. Reopening clears completed_at', reopened.completed_at === null);

    // 10. Ordering (fetchTasks returns newest-created first)
    const second = await window.ProjectTasks.createTask(testProjectId, { title: 'Verify registration links' }, me.id);
    createdTaskIds.push(second.id);
    const list = await window.ProjectTasks.fetchTasks(testProjectId);
    record('10. Tasks are ordered newest-first', list.length >= 2 && list[0].id === second.id);

    // 11. Unfinished count correct
    const counts = await window.ProjectTasks.fetchOpenCounts([testProjectId]);
    const expectedOpen = list.filter(t => t.status !== 'done').length;
    record('11. Unfinished task count matches', counts.get(testProjectId) === expectedOpen, `expected ${expectedOpen}, got ${counts.get(testProjectId)}`);

    // 9. Unauthorized mutation is rejected — find (or skip) a project this user did not create
    const { data: otherProjects } = await supabase
      .from('projects')
      .select('id')
      .neq('creator_id', me.id)
      .limit(1);
    if (otherProjects && otherProjects.length > 0) {
      const { data: rejectedInsert, error: rlsErr } = await supabase
        .from('project_tasks')
        .insert([{ project_id: otherProjects[0].id, title: 'should be rejected by RLS' }])
        .select();
      const wasRejected = !!rlsErr || !rejectedInsert || rejectedInsert.length === 0;
      record('9. Unauthorized mutation is rejected (RLS)', wasRejected, rlsErr?.message || 'insert silently returned no rows');
      // Clean up in the unlikely event RLS was misconfigured and it succeeded
      if (rejectedInsert && rejectedInsert.length > 0) {
        await supabase.from('project_tasks').delete().eq('id', rejectedInsert[0].id);
      }
    } else {
      console.log('⚠️ Skipped test 9 (no other project available to test against)');
    }

    // 8. Authorized user can delete
    await window.ProjectTasks.deleteTask(second);
    const afterDelete = await window.ProjectTasks.fetchTasks(testProjectId);
    record('8. Authorized user can delete a task', !afterDelete.find(t => t.id === second.id));

    // 12. Deleting/updating projects does not leave invalid task relationships
    // Projects are soft-deleted (status change), never hard-deleted, so the
    // FK is never exercised in normal use — verify the remaining task is
    // still reachable through its project_id after the project is archived.
    await supabase.from('projects').update({ status: 'archived' }).eq('id', testProjectId);
    const stillThere = await window.ProjectTasks.fetchTasks(testProjectId);
    record('12. Task relationship survives project status change', stillThere.some(t => t.id === reopened.id));

  } catch (err) {
    console.error('❌ Test run failed with an exception:', err);
    record('Unhandled exception', false, err.message);
  } finally {
    // --- Cleanup ---
    for (const id of createdTaskIds) {
      await supabase.from('project_tasks').delete().eq('id', id).then(() => {}, () => {});
    }
    if (testProjectId) {
      // Projects have no DELETE policy (soft-delete only, matching
      // deleteProjectSoft) — archive instead of trying to hard-delete.
      await supabase.from('projects').update({ status: 'archived' }).eq('id', testProjectId);
      console.log(`🧹 Archived test project ${testProjectId}`);
    }
  }

  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;
  console.log('\n' + '='.repeat(60));
  console.log(`%c📊 Test Results: ${passed} passed, ${failed} failed`,
    failed === 0 ? 'color: #00ff88; font-weight: bold;' : 'color: #ff6b6b; font-weight: bold;');
  console.log('='.repeat(60));

  window.projectTasksTestResults = { passed, failed, total: results.length, results, success: failed === 0 };
  console.log('💡 Results saved to window.projectTasksTestResults');
  return window.projectTasksTestResults;
};
