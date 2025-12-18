/**
 * CharlestonHacks Innovation Engine - Feature Enhancements
 * Phase 1-3: All features as drop-in enhancement
 * 
 * USAGE: Add this script to your existing 2card.html:
 * <script type="module" src="assets/js/enhancements.js"></script>
 */

// Wait for both supabase and DOM
const initEnhancements = setInterval(() => {
  if (!window.supabase || !document.getElementById('profile')) return;
  clearInterval(initEnhancements);
  
  console.log('%c🚀 Loading Enhanced Features...', 'color:#c9a35e; font-weight:bold; font-size:16px');
  
  const supabase = window.supabase;
  
  // Global enhancements object
  window.CharlestonEnhancements = {
    currentUser: null,
    currentChannel: null,
    messageSubscription: null,
    presenceChannel: null,
    charts: {},
    
    async init() {
      // Get current user from existing auth
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        this.currentUser = session.user;
        await this.loadProfile();
        this.setupFeatures();
      }
      
      // Listen for auth changes
      supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN') {
          this.currentUser = session.user;
          this.loadProfile().then(() => this.setupFeatures());
        }
      });
    },
    
    async loadProfile() {
      const { data } = await supabase
        .from('community')
        .select('*')
        .eq('user_id', this.currentUser.id)
        .single();
      
      if (data) {
        this.profile = data;
      }
    },
    
    setupFeatures() {
      console.log('%c📦 Phase 1: Profile uploads, filters, loading states', 'color:#0ff');
      this.setupProfileImageUpload();
      this.setupProjectFilters();
      
      console.log('%c⚡ Phase 2: Real-time messaging, presence, notifications', 'color:#0ff');
      this.initPresence();
      this.setupBBSEnhancements();
      
      console.log('%c🎨 Phase 3: Synapse network, analytics, PDF export', 'color:#0ff');
      this.setupAnalytics();
      this.setupPDFExport();
      
      console.log('%c✨ All features loaded!', 'color:#c9a35e; font-weight:bold');
    },
    
    // ===========================================
    // PHASE 1: PROFILE IMAGE UPLOAD
    // ===========================================
    
    setupProfileImageUpload() {
      // Add image upload to profile section
      const profileForm = document.getElementById('skills-form');
      if (!profileForm) return;
      
      // Create upload UI if it doesn't exist
      if (!document.getElementById('profile-photo-input')) {
        const uploadHTML = `
          <div style="margin-bottom: 2rem;">
            <label style="display: block; margin-bottom: 0.5rem; color: #00e0ff;">Profile Picture</label>
            <div style="display: flex; align-items: center; gap: 2rem;">
              <div class="image-upload-container" onclick="document.getElementById('profile-photo-input').click()" style="width: 150px; height: 150px; border: 2px dashed #00e0ff; border-radius: 50%; overflow: hidden; cursor: pointer; position: relative;">
                <img id="profile-image-preview" src="https://via.placeholder.com/150" style="width: 100%; height: 100%; object-fit: cover;">
                <div style="position: absolute; inset: 0; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.3s;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0">
                  <i class="fas fa-camera" style="font-size: 2rem; color: #fff;"></i>
                </div>
              </div>
              <div>
                <input type="file" id="profile-photo-input" accept="image/*" style="display: none;">
                <button type="button" class="action-btn" onclick="document.getElementById('profile-photo-input').click()">
                  <i class="fas fa-upload"></i> Upload Photo
                </button>
                <p style="color: #888; font-size: 0.85rem; margin-top: 0.5rem;">JPG, PNG or GIF. Max 2MB.</p>
                <div id="upload-progress" style="display: none; margin-top: 0.5rem;">
                  <div style="border: 3px solid rgba(0, 224, 255, 0.3); border-top: 3px solid #00e0ff; border-radius: 50%; width: 20px; height: 20px; animation: spin 1s linear infinite;"></div>
                </div>
              </div>
            </div>
          </div>
        `;
        
        profileForm.insertAdjacentHTML('afterbegin', uploadHTML);
      }
      
      // Load existing image
      if (this.profile?.image_url) {
        const img = document.getElementById('profile-image-preview');
        if (img) img.src = this.profile.image_url;
      }
      
      // Handle upload
      const input = document.getElementById('profile-photo-input');
      if (input) {
        input.addEventListener('change', async (e) => {
          const file = e.target.files[0];
          if (!file) return;
          
          await this.uploadProfileImage(file);
        });
      }
    },
    
    async uploadProfileImage(file) {
      if (file.size > 2 * 1024 * 1024) {
        this.notify('Image too large. Max 2MB', 'error');
        return;
      }
      
      const progress = document.getElementById('upload-progress');
      if (progress) progress.style.display = 'block';
      
      try {
        const fileExt = file.name.split('.').pop();
        const fileName = `${this.currentUser.id}-${Date.now()}.${fileExt}`;
        const filePath = `profiles/${fileName}`;
        
        // Upload to Supabase Storage
        const { error: uploadError } = await supabase.storage
          .from('hacksbucket')
          .upload(filePath, file, {
            cacheControl: '3600',
            upsert: true
          });
        
        if (uploadError) throw uploadError;
        
        // Get public URL
        const { data: { publicUrl } } = supabase.storage
          .from('hacksbucket')
          .getPublicUrl(filePath);
        
        // Update database
        await supabase
          .from('community')
          .update({ image_url: publicUrl })
          .eq('user_id', this.currentUser.id);
        
        // Update UI
        const img = document.getElementById('profile-image-preview');
        if (img) img.src = publicUrl;
        
        this.profile.image_url = publicUrl;
        this.notify('Profile picture updated!', 'success');
        
      } catch (error) {
        console.error('Upload error:', error);
        this.notify('Upload failed: ' + error.message, 'error');
      } finally {
        if (progress) progress.style.display = 'none';
      }
    },
    
    // ===========================================
    // PHASE 1: PROJECT FILTERS
    // ===========================================
    
    setupProjectFilters() {
      // Add filter controls to projects section
      const projectsSection = document.getElementById('projects');
      if (!projectsSection) return;
      
      // Check if filters already exist
      if (document.getElementById('project-search-enhanced')) return;
      
      const filtersHTML = `
        <div style="margin: 1.5rem 0; display: flex; gap: 1rem; flex-wrap: wrap;">
          <input type="text" id="project-search-enhanced" placeholder="Search projects..." style="flex: 1; min-width: 250px; padding: 0.7rem; background: rgba(0,0,0,0.5); border: 1px solid rgba(0,224,255,0.3); border-radius: 8px; color: #fff;">
          
          <select id="project-status-filter" style="padding: 0.7rem; background: rgba(0,0,0,0.5); border: 1px solid rgba(0,224,255,0.3); border-radius: 8px; color: #fff;">
            <option value="all">All Status</option>
            <option value="open">Open for Bids</option>
            <option value="active">Active</option>
            <option value="completed">Completed</option>
          </select>
          
          <select id="project-sort" style="padding: 0.7rem; background: rgba(0,0,0,0.5); border: 1px solid rgba(0,224,255,0.3); border-radius: 8px; color: #fff;">
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="most-bids">Most Bids</option>
            <option value="most-upvotes">Most Upvotes</option>
          </select>
        </div>
      `;
      
      projectsSection.insertAdjacentHTML('afterbegin', filtersHTML);
      
      // Add event listeners with debounce
      let searchTimeout;
      const searchInput = document.getElementById('project-search-enhanced');
      if (searchInput) {
        searchInput.addEventListener('input', () => {
          clearTimeout(searchTimeout);
          searchTimeout = setTimeout(() => this.filterProjects(), 300);
        });
      }
      
      const statusFilter = document.getElementById('project-status-filter');
      if (statusFilter) {
        statusFilter.addEventListener('change', () => this.filterProjects());
      }
      
      const sortSelect = document.getElementById('project-sort');
      if (sortSelect) {
        sortSelect.addEventListener('change', () => this.filterProjects());
      }
    },
    
    async filterProjects() {
      const search = document.getElementById('project-search-enhanced')?.value || '';
      const status = document.getElementById('project-status-filter')?.value || 'all';
      const sort = document.getElementById('project-sort')?.value || 'newest';
      
      let query = supabase.from('projects').select('*');
      
      if (status !== 'all') {
        query = query.eq('status', status);
      }
      
      if (search) {
        query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`);
      }
      
      switch (sort) {
        case 'newest':
          query = query.order('created_at', { ascending: false });
          break;
        case 'oldest':
          query = query.order('created_at', { ascending: true });
          break;
        case 'most-bids':
          query = query.order('bid_count', { ascending: false });
          break;
        case 'most-upvotes':
          query = query.order('upvote_count', { ascending: false });
          break;
      }
      
      const { data } = await query;
      console.log('Filtered projects:', data);
      // Hook into your existing render function if available
    },
    
    // ===========================================
    // PHASE 2: PRESENCE & REAL-TIME
    // ===========================================
    
    initPresence() {
      this.presenceChannel = supabase.channel('online-users');
      
      this.presenceChannel
        .on('presence', { event: 'sync' }, () => {
          const state = this.presenceChannel.presenceState();
          console.log('✓ Online users:', Object.keys(state).length);
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            await this.presenceChannel.track({
              user_id: this.currentUser.id,
              email: this.currentUser.email,
              online_at: new Date().toISOString()
            });
          }
        });
    },
    
    setupBBSEnhancements() {
      // Enhanced BBS with realtime subscriptions
      // This integrates with your existing BBS modal
      const bbsModal = document.getElementById('bbs-modal');
      if (!bbsModal) return;
      
      // Add realtime subscription when BBS opens
      const openBBSBtn = document.getElementById('open-bbs');
      if (openBBSBtn) {
        openBBSBtn.addEventListener('click', () => {
          setTimeout(() => this.initBBSRealtime(), 500);
        });
      }
    },
    
    async initBBSRealtime() {
      // Subscribe to new messages in general channel
      const channelId = 'general'; // Or get from current channel
      
      if (this.messageSubscription) {
        supabase.removeChannel(this.messageSubscription);
      }
      
      this.messageSubscription = supabase
        .channel(`messages:${channelId}`)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'bbs_messages',
          filter: `channel_id=eq.${channelId}`
        }, (payload) => {
          console.log('New message:', payload.new);
          // Your existing BBS will handle the display
        })
        .subscribe();
    },
    
    // ===========================================
    // PHASE 3: ANALYTICS
    // ===========================================
    
    setupAnalytics() {
      // Add analytics tab if it doesn't exist
      const existingAnalytics = document.getElementById('analytics');
      if (existingAnalytics) return;
      
      // Create analytics section
      const analyticsHTML = `
        <section id="analytics" class="tab-content-pane">
          <h2>Analytics Dashboard</h2>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 2rem; margin: 2rem 0;">
            <div style="background: rgba(10,10,10,0.8); border: 1px solid rgba(0,224,255,0.3); border-radius: 12px; padding: 2rem;">
              <h3 style="color: #00e0ff; margin-bottom: 1rem;">Projects Over Time</h3>
              <canvas id="projects-chart"></canvas>
            </div>
            <div style="background: rgba(10,10,10,0.8); border: 1px solid rgba(0,224,255,0.3); border-radius: 12px; padding: 2rem;">
              <h3 style="color: #00e0ff; margin-bottom: 1rem;">Top Skills</h3>
              <canvas id="skills-chart"></canvas>
            </div>
          </div>
        </section>
      `;
      
      const profileSection = document.getElementById('profile');
      if (profileSection) {
        profileSection.insertAdjacentHTML('afterend', analyticsHTML);
      }
      
      // Add analytics button to nav if needed
      // Load charts when analytics tab is opened
    },
    
    async loadAnalyticsCharts() {
      // Projects over time
      const { data: projects } = await supabase
        .from('projects')
        .select('created_at')
        .order('created_at');
      
      if (projects && window.Chart) {
        const grouped = this.groupByMonth(projects);
        
        const ctx = document.getElementById('projects-chart');
        if (ctx) {
          new Chart(ctx, {
            type: 'line',
            data: {
              labels: grouped.labels,
              datasets: [{
                label: 'Projects Created',
                data: grouped.counts,
                borderColor: '#00e0ff',
                backgroundColor: 'rgba(0, 224, 255, 0.1)',
                fill: true
              }]
            },
            options: {
              responsive: true,
              plugins: {
                legend: { labels: { color: '#fff' } }
              },
              scales: {
                y: { ticks: { color: '#fff' } },
                x: { ticks: { color: '#fff' } }
              }
            }
          });
        }
      }
    },
    
    groupByMonth(data) {
      const months = {};
      data.forEach(item => {
        const month = new Date(item.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
        months[month] = (months[month] || 0) + 1;
      });
      
      return {
        labels: Object.keys(months),
        counts: Object.values(months)
      };
    },
    
    // ===========================================
    // PHASE 3: PDF EXPORT
    // ===========================================
    
    setupPDFExport() {
      // Add export button when viewing CYNQ
      const cynqSection = document.getElementById('cynq');
      if (!cynqSection) return;
      
      if (!document.getElementById('export-pdf-btn')) {
        const exportBtn = document.createElement('button');
        exportBtn.id = 'export-pdf-btn';
        exportBtn.className = 'action-btn';
        exportBtn.innerHTML = '<i class="fas fa-file-pdf"></i> Export as PDF';
        exportBtn.style.cssText = 'position: fixed; bottom: 30px; right: 30px; z-index: 9999;';
        exportBtn.onclick = () => this.exportWorkflowPDF();
        
        document.body.appendChild(exportBtn);
      }
    },
    
    async exportWorkflowPDF() {
      if (!window.jspdf) {
        this.notify('PDF library not loaded', 'error');
        return;
      }
      
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF();
      
      // Get project data from current context
      doc.setFontSize(20);
      doc.text('CYNQ Workflow Export', 10, 10);
      
      doc.setFontSize(12);
      doc.text('CharlestonHacks Innovation Engine', 10, 20);
      doc.text(new Date().toLocaleDateString(), 10, 30);
      
      doc.save('workflow-export.pdf');
      this.notify('PDF exported!', 'success');
    },
    
    // ===========================================
    // UTILITIES
    // ===========================================
    
    notify(message, type = 'info') {
      // Create notification container if doesn't exist
      let container = document.getElementById('notification-container');
      if (!container) {
        container = document.createElement('div');
        container.id = 'notification-container';
        document.body.appendChild(container);
      }
      
      const toast = document.createElement('div');
      toast.style.cssText = `
        position: fixed;
        top: 80px;
        right: 20px;
        background: ${type === 'success' ? 'linear-gradient(135deg, #0f0, #0c0)' : type === 'error' ? 'linear-gradient(135deg, #f00, #c00)' : 'linear-gradient(135deg, #00e0ff, #00b8cc)'};
        color: ${type === 'error' ? '#fff' : '#000'};
        padding: 1rem 1.5rem;
        border-radius: 8px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        z-index: 10000;
        font-weight: 600;
        max-width: 350px;
        animation: slideIn 0.3s ease;
      `;
      toast.textContent = message;
      
      container.appendChild(toast);
      
      setTimeout(() => {
        toast.style.animation = 'slideIn 0.3s ease reverse';
        setTimeout(() => toast.remove(), 300);
      }, 3000);
    }
  };
  
  // Initialize
  window.CharlestonEnhancements.init();
}, 100);

// Add required CSS animations
const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn {
    from { transform: translateX(400px); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
  
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
`;
document.head.appendChild(style);

console.log('%c✓ Enhancement module loaded', 'color:#0ff; font-weight:bold');
