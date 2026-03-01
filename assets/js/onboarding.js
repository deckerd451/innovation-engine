// Onboarding System
// Guides new users through profile completion

let onboardingState = {
  currentStep: 0,
  profile: null,
  totalSteps: 4
};

function showOnboarding(profile) {
  onboardingState.profile = profile;
  onboardingState.currentStep = 0;
  
  const modal = createOnboardingModal();
  document.body.appendChild(modal);
  showOnboardingStep(0);
}

function createOnboardingModal() {
  const modal = document.createElement('div');
  modal.id = 'onboarding-modal';
  modal.className = 'onboarding-modal';
  modal.innerHTML = `
    <div class="onboarding-content">
      <div class="onboarding-header">
        <h2>Welcome to CharlestonHacks!</h2>
        <div class="progress-bar">
          <div class="progress-fill" id="onboarding-progress"></div>
        </div>
        <p class="step-indicator">Step <span id="current-step">1</span> of ${onboardingState.totalSteps}</p>
      </div>
      <div class="onboarding-body" id="onboarding-body"></div>
      <div class="onboarding-footer">
        <button id="onboarding-skip" class="btn-secondary">Skip for now</button>
        <div class="nav-buttons">
          <button id="onboarding-back" class="btn-secondary" style="display: none;">Back</button>
          <button id="onboarding-next" class="btn-primary">Next</button>
        </div>
      </div>
    </div>
  `;
  
  modal.querySelector('#onboarding-skip').onclick = skipOnboarding;
  modal.querySelector('#onboarding-back').onclick = () => navigateOnboarding(-1);
  modal.querySelector('#onboarding-next').onclick = () => navigateOnboarding(1);
  
  return modal;
}

function showOnboardingStep(step) {
  const body = document.getElementById('onboarding-body');
  const currentStepEl = document.getElementById('current-step');
  const progress = document.getElementById('onboarding-progress');
  const backBtn = document.getElementById('onboarding-back');
  const nextBtn = document.getElementById('onboarding-next');
  
  currentStepEl.textContent = step + 1;
  progress.style.width = `${((step + 1) / onboardingState.totalSteps) * 100}%`;
  backBtn.style.display = step > 0 ? 'block' : 'none';
  
  const steps = [
    createWelcomeStep,
    createProfileStep,
    createSkillsStep,
    createInterestsStep
  ];
  
  body.innerHTML = '';
  body.appendChild(steps[step]());
  
  if (step === onboardingState.totalSteps - 1) {
    nextBtn.textContent = 'Complete';
  } else {
    nextBtn.textContent = 'Next';
  }
}

function createWelcomeStep() {
  const step = document.createElement('div');
  step.className = 'onboarding-step';
  step.innerHTML = `
    <div class="welcome-step">
      <i class="fas fa-rocket" style="font-size: 4rem; color: #00e0ff; margin-bottom: 1rem;"></i>
      <h3>Make Invisible Networks Visible</h3>
      <p>CharlestonHacks connects innovators, mentors, and collaborators through an interactive network visualization.</p>
      <div class="feature-list">
        <div class="feature-item">
          <i class="fas fa-users"></i>
          <span>Discover people with shared interests</span>
        </div>
        <div class="feature-item">
          <i class="fas fa-project-diagram"></i>
          <span>Visualize your network connections</span>
        </div>
        <div class="feature-item">
          <i class="fas fa-lightbulb"></i>
          <span>Collaborate on innovative projects</span>
        </div>
      </div>
    </div>
  `;
  return step;
}

function createProfileStep() {
  const step = document.createElement('div');
  step.className = 'onboarding-step';
  step.innerHTML = `
    <div class="profile-step">
      <h3>Tell us about yourself</h3>
      <p>Help others discover you by completing your profile.</p>
      <div class="form-group">
        <label>Display Name *</label>
        <input type="text" id="onboarding-name" placeholder="Your name" value="${onboardingState.profile?.display_name || ''}" />
      </div>
      <div class="form-group">
        <label>Bio</label>
        <textarea id="onboarding-bio" placeholder="A brief description about yourself" rows="3">${onboardingState.profile?.bio || ''}</textarea>
      </div>
      <div class="form-group">
        <label>Location</label>
        <input type="text" id="onboarding-location" placeholder="City, State" value="${onboardingState.profile?.location || ''}" />
      </div>
    </div>
  `;
  return step;
}

function createSkillsStep() {
  const step = document.createElement('div');
  step.className = 'onboarding-step';
  step.innerHTML = `
    <div class="skills-step">
      <h3>What are your skills?</h3>
      <p>Add skills to help others find you for collaboration.</p>
      <div class="form-group">
        <label>Skills (comma-separated)</label>
        <input type="text" id="onboarding-skills" placeholder="e.g., JavaScript, Design, Marketing" value="${(onboardingState.profile?.skills || []).join(', ')}" />
      </div>
      <div class="skill-suggestions">
        <p>Popular skills:</p>
        <div class="skill-chips">
          ${['JavaScript', 'Python', 'Design', 'Marketing', 'Data Science', 'AI/ML'].map(skill => 
            `<button class="skill-chip" onclick="addSkillToInput('${skill}')">${skill}</button>`
          ).join('')}
        </div>
      </div>
    </div>
  `;
  return step;
}

function createInterestsStep() {
  const step = document.createElement('div');
  step.className = 'onboarding-step';
  step.innerHTML = `
    <div class="interests-step">
      <h3>What interests you?</h3>
      <p>Select topics you're passionate about to connect with like-minded people.</p>
      <div class="form-group">
        <label>Interests (comma-separated)</label>
        <input type="text" id="onboarding-interests" placeholder="e.g., AI, Healthcare, Education" value="${(onboardingState.profile?.interests || []).join(', ')}" />
      </div>
      <div class="interest-suggestions">
        <p>Popular interests:</p>
        <div class="interest-chips">
          ${['AI', 'Healthcare', 'Education', 'Sustainability', 'Fintech', 'IoT'].map(interest => 
            `<button class="interest-chip" onclick="addInterestToInput('${interest}')">${interest}</button>`
          ).join('')}
        </div>
      </div>
    </div>
  `;
  return step;
}

function navigateOnboarding(direction) {
  const newStep = onboardingState.currentStep + direction;
  
  if (newStep < 0) return;
  
  if (newStep >= onboardingState.totalSteps) {
    completeOnboarding();
    return;
  }
  
  onboardingState.currentStep = newStep;
  showOnboardingStep(newStep);
}

async function completeOnboarding() {
  const name = document.getElementById('onboarding-name')?.value;
  const bio = document.getElementById('onboarding-bio')?.value;
  const location = document.getElementById('onboarding-location')?.value;
  const skills = document.getElementById('onboarding-skills')?.value.split(',').map(s => s.trim()).filter(Boolean);
  const interests = document.getElementById('onboarding-interests')?.value.split(',').map(s => s.trim()).filter(Boolean);
  
  if (!name) {
    showToast('Please enter your name', 'error');
    onboardingState.currentStep = 1;
    showOnboardingStep(1);
    return;
  }
  
  try {
    const { error } = await window.supabase
      .from('community')
      .update({
        display_name: name,
        bio: bio || null,
        location: location || null,
        skills: skills.length > 0 ? skills : null,
        interests: interests.length > 0 ? interests : null,
        onboarding_completed: true,
        profile_completed: true
      })
      .eq('id', onboardingState.profile.id);
    
    if (error) throw error;
    
    document.getElementById('onboarding-modal').remove();
    showSuccessToast('Profile completed! Welcome to CharlestonHacks!');
    
    setTimeout(() => location.reload(), 1000);
  } catch (err) {
    showToast('Failed to save profile. Please try again.', 'error');
  }
}

function skipOnboarding() {
  if (confirm('You can complete your profile later from the profile menu. Continue?')) {
    document.getElementById('onboarding-modal').remove();
  }
}

function addSkillToInput(skill) {
  const input = document.getElementById('onboarding-skills');
  const current = input.value.split(',').map(s => s.trim()).filter(Boolean);
  if (!current.includes(skill)) {
    current.push(skill);
    input.value = current.join(', ');
  }
}

function addInterestToInput(interest) {
  const input = document.getElementById('onboarding-interests');
  const current = input.value.split(',').map(s => s.trim()).filter(Boolean);
  if (!current.includes(interest)) {
    current.push(interest);
    input.value = current.join(', ');
  }
}

if (typeof window !== 'undefined') {
  window.showOnboarding = showOnboarding;
  window.addSkillToInput = addSkillToInput;
  window.addInterestToInput = addInterestToInput;
}
