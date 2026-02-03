// ================================================================
// Profile Completion Helper
// ================================================================
// Streamlined profile completion flow with smart suggestions
// ================================================================

console.log("%c📝 Profile Completion Helper - Loading", "color:#0f8; font-weight:bold;");

class ProfileCompletionHelper {
  constructor() {
    this.suggestions = {
      skills: [
        // Technical Skills
        'JavaScript', 'Python', 'React', 'Node.js', 'HTML/CSS', 'SQL', 'Git',
        'Machine Learning', 'Data Analysis', 'UI/UX Design', 'Mobile Development',
        'Cloud Computing', 'DevOps', 'Cybersecurity', 'Blockchain',
        
        // Business Skills
        'Project Management', 'Marketing', 'Sales', 'Business Development',
        'Strategy', 'Operations', 'Finance', 'Legal', 'HR',
        
        // Creative Skills
        'Graphic Design', 'Video Editing', 'Content Writing', 'Photography',
        'Branding', 'Social Media', 'Public Speaking', 'Event Planning',
        
        // Research & Analysis
        'Research', 'Data Visualization', 'Statistics', 'User Research',
        'Market Analysis', 'Competitive Analysis'
      ],
      
      interests: [
        // Technology
        'Artificial Intelligence', 'Web Development', 'Mobile Apps', 'IoT',
        'Robotics', 'Virtual Reality', 'Augmented Reality', 'Gaming',
        
        // Business & Entrepreneurship
        'Startups', 'Innovation', 'Entrepreneurship', 'Venture Capital',
        'Business Strategy', 'Digital Transformation', 'E-commerce',
        
        // Social Impact
        'Social Impact', 'Sustainability', 'Education', 'Healthcare',
        'Climate Change', 'Diversity & Inclusion', 'Community Building',
        
        // Industries
        'FinTech', 'HealthTech', 'EdTech', 'AgTech', 'CleanTech',
        'Cybersecurity', 'Blockchain', 'Data Science'
      ]
    };
  }

  /**
   * Show enhanced profile completion modal
   */
  showCompletionModal() {
    console.log('📝 Opening profile completion modal...');
    
    const modal = document.createElement('div');
    modal.id = 'profile-completion-modal';
    modal.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.8);
      backdrop-filter: blur(4px);
      z-index: 10000;
      display: flex;
      align-items: center;
      justify-content: center;
      animation: fadeIn 0.3s ease-out;
    `;
    
    modal.innerHTML = `
      <div style="
        background: linear-gradient(135deg, rgba(10,14,39,0.98), rgba(26,26,46,0.98));
        border: 2px solid rgba(0,224,255,0.4);
        border-radius: 16px;
        padding: 2rem;
        max-width: 600px;
        width: 90%;
        max-height: 90vh;
        overflow-y: auto;
        box-shadow: 0 20px 60px rgba(0,0,0,0.7);
      ">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
          <h2 style="color: #00e0ff; margin: 0; font-size: 1.5rem;">
            <i class="fas fa-user-edit"></i> Complete Your Profile
          </h2>
          <button onclick="this.closest('#profile-completion-modal').remove()" style="
            background: rgba(255,255,255,0.1);
            border: 1px solid rgba(255,255,255,0.2);
            color: white;
            width: 32px;
            height: 32px;
            border-radius: 50%;
            cursor: pointer;
            font-size: 1rem;
          ">
            <i class="fas fa-times"></i>
          </button>
        </div>

        <div id="completion-steps">
          ${this.generateCompletionSteps()}
        </div>

        <div style="margin-top: 2rem; text-align: center;">
          <button id="save-profile-btn" style="
            background: linear-gradient(135deg, #00ff88, #00e0ff);
            border: none;
            border-radius: 12px;
            color: #000;
            padding: 1rem 2rem;
            font-size: 1.1rem;
            font-weight: 700;
            cursor: pointer;
            margin-right: 1rem;
          ">
            Save Profile
          </button>
          <button onclick="this.closest('#profile-completion-modal').remove()" style="
            background: rgba(255,255,255,0.1);
            border: 1px solid rgba(255,255,255,0.3);
            border-radius: 12px;
            color: white;
            padding: 1rem 2rem;
            cursor: pointer;
          ">
            Skip for Now
          </button>
        </div>
      </div>
    `;
    
    // Add CSS animations
    if (!document.getElementById('profile-completion-styles')) {
      const style = document.createElement('style');
      style.id = 'profile-completion-styles';
      style.textContent = `
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        
        .skill-tag, .interest-tag {
          display: inline-block;
          background: rgba(0,224,255,0.1);
          border: 1px solid rgba(0,224,255,0.3);
          border-radius: 20px;
          padding: 0.4rem 0.8rem;
          margin: 0.25rem;
          cursor: pointer;
          transition: all 0.2s;
          font-size: 0.85rem;
          color: #00e0ff;
        }
        
        .skill-tag:hover, .interest-tag:hover {
          background: rgba(0,224,255,0.2);
          border-color: rgba(0,224,255,0.5);
          transform: translateY(-1px);
        }
        
        .skill-tag.selected, .interest-tag.selected {
          background: rgba(0,255,136,0.2);
          border-color: rgba(0,255,136,0.5);
          color: #00ff88;
        }
        
        .completion-step {
          margin-bottom: 2rem;
          padding: 1.5rem;
          background: rgba(0,0,0,0.2);
          border-radius: 12px;
          border-left: 4px solid rgba(0,224,255,0.5);
        }
        
        .step-header {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          margin-bottom: 1rem;
          color: #00e0ff;
          font-weight: 600;
          font-size: 1.1rem;
        }
        
        .form-field {
          margin-bottom: 1rem;
        }
        
        .form-field label {
          display: block;
          color: rgba(255,255,255,0.9);
          margin-bottom: 0.5rem;
          font-weight: 600;
        }
        
        .form-field input, .form-field textarea {
          width: 100%;
          padding: 0.75rem;
          background: rgba(0,0,0,0.3);
          border: 1px solid rgba(255,255,255,0.2);
          border-radius: 8px;
          color: white;
          font-size: 1rem;
        }
        
        .form-field input:focus, .form-field textarea:focus {
          outline: none;
          border-color: rgba(0,224,255,0.5);
          box-shadow: 0 0 10px rgba(0,224,255,0.2);
        }
        
        .suggestions-container {
          max-height: 200px;
          overflow-y: auto;
          margin-top: 0.5rem;
          padding: 0.5rem;
          background: rgba(0,0,0,0.2);
          border-radius: 8px;
        }
      `;
      document.head.appendChild(style);
    }
    
    document.body.appendChild(modal);
    
    // Setup event handlers
    this.setupModalHandlers(modal);
    
    // Pre-fill with existing data
    this.prefillExistingData();
  }

  /**
   * Generate completion steps HTML
   */
  generateCompletionSteps() {
    const profile = window.currentUserProfile || {};
    
    return `
      <div class="completion-step">
        <div class="step-header">
          <i class="fas fa-user"></i>
          <span>Basic Information</span>
        </div>
        <div class="form-field">
          <label for="profile-name">Display Name</label>
          <input type="text" id="profile-name" placeholder="How should people know you?" 
                 value="${profile.name || ''}" maxlength="50">
        </div>
        <div class="form-field">
          <label for="profile-bio">Bio</label>
          <textarea id="profile-bio" placeholder="Tell us about yourself, your background, and what you're passionate about..." 
                    rows="3" maxlength="500">${profile.bio || ''}</textarea>
        </div>
      </div>

      <div class="completion-step">
        <div class="step-header">
          <i class="fas fa-tools"></i>
          <span>Skills & Expertise</span>
        </div>
        <div class="form-field">
          <label>Select your skills (click to add/remove)</label>
          <div id="selected-skills" style="margin-bottom: 1rem; min-height: 40px; padding: 0.5rem; background: rgba(0,0,0,0.2); border-radius: 8px;">
            <span style="color: rgba(255,255,255,0.5); font-style: italic;">Selected skills will appear here...</span>
          </div>
          <div class="suggestions-container">
            ${this.suggestions.skills.map(skill => 
              `<span class="skill-tag" data-skill="${skill}">${skill}</span>`
            ).join('')}
          </div>
        </div>
      </div>

      <div class="completion-step">
        <div class="step-header">
          <i class="fas fa-heart"></i>
          <span>Interests & Focus Areas</span>
        </div>
        <div class="form-field">
          <label>What are you interested in? (click to add/remove)</label>
          <div id="selected-interests" style="margin-bottom: 1rem; min-height: 40px; padding: 0.5rem; background: rgba(0,0,0,0.2); border-radius: 8px;">
            <span style="color: rgba(255,255,255,0.5); font-style: italic;">Selected interests will appear here...</span>
          </div>
          <div class="suggestions-container">
            ${this.suggestions.interests.map(interest => 
              `<span class="interest-tag" data-interest="${interest}">${interest}</span>`
            ).join('')}
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Setup modal event handlers
   */
  setupModalHandlers(modal) {
    const selectedSkills = new Set();
    const selectedInterests = new Set();
    
    // Skill selection
    modal.querySelectorAll('.skill-tag').forEach(tag => {
      tag.addEventListener('click', () => {
        const skill = tag.dataset.skill;
        if (selectedSkills.has(skill)) {
          selectedSkills.delete(skill);
          tag.classList.remove('selected');
        } else {
          selectedSkills.add(skill);
          tag.classList.add('selected');
        }
        this.updateSelectedDisplay('selected-skills', selectedSkills, 'skills');
      });
    });
    
    // Interest selection
    modal.querySelectorAll('.interest-tag').forEach(tag => {
      tag.addEventListener('click', () => {
        const interest = tag.dataset.interest;
        if (selectedInterests.has(interest)) {
          selectedInterests.delete(interest);
          tag.classList.remove('selected');
        } else {
          selectedInterests.add(interest);
          tag.classList.add('selected');
        }
        this.updateSelectedDisplay('selected-interests', selectedInterests, 'interests');
      });
    });
    
    // Save button
    modal.querySelector('#save-profile-btn').addEventListener('click', async () => {
      await this.saveProfile({
        name: modal.querySelector('#profile-name').value,
        bio: modal.querySelector('#profile-bio').value,
        skills: Array.from(selectedSkills),
        interests: Array.from(selectedInterests)
      });
      modal.remove();
    });
    
    // Store references for prefilling
    this.selectedSkills = selectedSkills;
    this.selectedInterests = selectedInterests;
  }

  /**
   * Update selected items display
   */
  updateSelectedDisplay(containerId, selectedSet, type) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    if (selectedSet.size === 0) {
      container.innerHTML = `<span style="color: rgba(255,255,255,0.5); font-style: italic;">Selected ${type} will appear here...</span>`;
    } else {
      container.innerHTML = Array.from(selectedSet).map(item => 
        `<span class="${type === 'skills' ? 'skill' : 'interest'}-tag selected" style="margin: 0.25rem;">${item}</span>`
      ).join('');
    }
  }

  /**
   * Prefill existing data
   */
  prefillExistingData() {
    const profile = window.currentUserProfile || {};
    
    // Prefill skills
    if (profile.skills) {
      const skills = Array.isArray(profile.skills) ? profile.skills : 
                    typeof profile.skills === 'string' ? profile.skills.split(',').map(s => s.trim()) : [];
      
      skills.forEach(skill => {
        const tag = document.querySelector(`[data-skill="${skill}"]`);
        if (tag) {
          tag.classList.add('selected');
          this.selectedSkills.add(skill);
        }
      });
      
      this.updateSelectedDisplay('selected-skills', this.selectedSkills, 'skills');
    }
    
    // Prefill interests
    if (profile.interests && Array.isArray(profile.interests)) {
      profile.interests.forEach(interest => {
        const tag = document.querySelector(`[data-interest="${interest}"]`);
        if (tag) {
          tag.classList.add('selected');
          this.selectedInterests.add(interest);
        }
      });
      
      this.updateSelectedDisplay('selected-interests', this.selectedInterests, 'interests');
    }
  }

  /**
   * Save profile data
   */
  async saveProfile(data) {
    console.log('💾 Saving profile data:', data);
    
    try {
      const supabase = window.supabase;
      if (!supabase) throw new Error('Supabase not available');
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not logged in');
      
      // Update profile
      const { error } = await supabase
        .from('community')
        .update({
          name: data.name || user.email?.split('@')[0] || 'User',
          bio: data.bio || '',
          skills: data.skills.join(', '),
          interests: data.interests,
          profile_completed: true,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', user.id);
      
      if (error) throw error;
      
      // Update global profile
      if (window.currentUserProfile) {
        Object.assign(window.currentUserProfile, {
          name: data.name,
          bio: data.bio,
          skills: data.skills.join(', '),
          interests: data.interests,
          profile_completed: true
        });
      }
      
      // Dispatch update event
      window.dispatchEvent(new CustomEvent('profile-updated', {
        detail: { profile: window.currentUserProfile }
      }));
      
      // Show success message
      this.showSuccessMessage();
      
      
    } catch (error) {
      console.error('❌ Failed to save profile:', error);
      this.showErrorMessage(error.message);
    }
  }

  /**
   * Show success message
   */
  showSuccessMessage() {
    const message = document.createElement('div');
    message.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: linear-gradient(135deg, rgba(0,255,136,0.95), rgba(0,224,255,0.95));
      color: #000;
      padding: 1rem 1.5rem;
      border-radius: 12px;
      font-weight: 600;
      z-index: 10001;
      box-shadow: 0 8px 25px rgba(0,255,136,0.4);
      animation: slideInRight 0.5s ease-out;
    `;
    
    message.innerHTML = `
      <i class="fas fa-check-circle"></i> Profile updated successfully!
    `;
    
    document.body.appendChild(message);
    
    setTimeout(() => {
      message.style.animation = 'slideInRight 0.3s ease-out reverse';
      setTimeout(() => message.remove(), 300);
    }, 3000);
  }

  /**
   * Show error message
   */
  showErrorMessage(errorText) {
    const message = document.createElement('div');
    message.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: linear-gradient(135deg, rgba(255,107,107,0.95), rgba(255,59,48,0.95));
      color: white;
      padding: 1rem 1.5rem;
      border-radius: 12px;
      font-weight: 600;
      z-index: 10001;
      box-shadow: 0 8px 25px rgba(255,107,107,0.4);
      animation: slideInRight 0.5s ease-out;
    `;
    
    message.innerHTML = `
      <i class="fas fa-exclamation-circle"></i> Error: ${errorText}
    `;
    
    document.body.appendChild(message);
    
    setTimeout(() => {
      message.style.animation = 'slideInRight 0.3s ease-out reverse';
      setTimeout(() => message.remove(), 300);
    }, 5000);
  }
}

// ================================================================
// GLOBAL INSTANCE AND INTEGRATION
// ================================================================

const profileCompletionHelper = new ProfileCompletionHelper();

// Export for global access
window.ProfileCompletionHelper = profileCompletionHelper;

// Integration with user menu
document.addEventListener('DOMContentLoaded', () => {
  // Override the user menu click to use our enhanced modal for incomplete profiles
  setTimeout(() => {
    const userMenu = document.getElementById('user-menu');
    if (userMenu) {
      userMenu.addEventListener('click', (e) => {
        const profile = window.currentUserProfile;
        if (profile && (!profile.profile_completed || !profile.skills || !profile.bio)) {
          e.preventDefault();
          e.stopPropagation();
          profileCompletionHelper.showCompletionModal();
        }
      });
    }
  }, 3000);
});

