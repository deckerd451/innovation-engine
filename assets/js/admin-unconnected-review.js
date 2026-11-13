// Read-only admin follow-up. All server-provided strings are inserted as text.
export function renderUnconnectedReview(host, snapshotCount) {
  host.hidden = false;
  host.replaceChildren();
  const title = document.createElement('h3'); title.textContent = 'Members with no recorded connections'; title.tabIndex = -1;
  const status = document.createElement('p'); status.setAttribute('role', 'status');
  const list = document.createElement('ul'); list.className = 'admin-review-members';
  const controls = document.createElement('div'); controls.className = 'admin-review-controls';
  const previous = button('Previous'), next = button('Next'), refresh = button('Refresh');
  controls.append(previous, next, refresh); host.append(title, status, list, controls);
  let offset = 0, generation = 0;
  const pageSize = 25;
  function button(text) { const el=document.createElement('button'); el.type='button'; el.textContent=text; return el; }
  async function load() {
    const request = ++generation;
    previous.disabled = next.disabled = refresh.disabled = true;
    status.textContent = 'Loading members…'; list.replaceChildren();
    try {
      const {data, error} = await window.supabase.rpc('get_admin_unconnected_members', {p_offset:offset, p_limit:pageSize});
      if (!host.isConnected || request !== generation) return;
      if (error) throw error;
      if (!data || !Number.isSafeInteger(data.total) || data.total < 0 || !Array.isArray(data.members)) throw Error('Invalid review response');
      if (offset >= data.total && offset > 0) { offset = Math.max(0, Math.floor((data.total-1)/pageSize)*pageSize); return load(); }
      const difference = data.total !== snapshotCount ? ` Analytics previously showed ${snapshotCount}; this review uses the latest data.` : '';
      status.textContent = data.total ? `Showing ${offset+1}–${offset+data.members.length} of ${data.total} members.${difference}` : `No members currently match.${difference}`;
      for (const member of data.members) {
        const row=document.createElement('li'), info=document.createElement('div'), name=document.createElement('strong'), skills=document.createElement('p');
        name.textContent=member.name || 'Unnamed';
        skills.textContent=Array.isArray(member.skills) ? member.skills.join(', ') : member.skills || 'No skills listed';
        const manage=button('Manage person'); manage.setAttribute('aria-label', `Manage person: ${member.name || 'Unnamed'}`);
        manage.onclick=()=>{
          if (window.openAdminPersonFromAnalytics?.(member.id) === true) window.closeAnalyticsModal?.();
          else status.textContent='People management is not ready. Close and reopen Admin, then try again.';
        };
        info.append(name,skills); row.append(info,manage); list.append(row);
      }
      previous.disabled=offset===0; next.disabled=offset+pageSize>=data.total;
    } catch (error) {
      if (!host.isConnected || request !== generation) return;
      status.textContent=error.code==='PGRST202'||error.code==='42883'
        ? 'Member review needs database setup. The deployment guide describes the required step.'
        : error.code==='42501' ? 'You do not have admin access to this list.' : 'Members could not be loaded. Try Refresh.';
    } finally { if (host.isConnected && request===generation) refresh.disabled=false; }
  }
  previous.onclick=()=>{offset=Math.max(0,offset-pageSize);load();};
  next.onclick=()=>{offset+=pageSize;load();}; refresh.onclick=load;
  title.scrollIntoView({block:'start'}); title.focus({preventScroll:true}); load();
}
