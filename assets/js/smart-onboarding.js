// ================================================================
// SMART ONBOARDING SYSTEM
// ================================================================
// Intelligent, adaptive onboarding that personalizes based on user behavior and preferences

console.log("%c🎯 Smart Onboarding Loading...", "color:#0ff; font-weight: bold; font-size: 16px");

let supabase = null;
let currentUserProfile = null;
let onboardingState = {
  currentStep: 0,
  completedSteps: [],
  userType: null,
  preferences: {},
  skipReasons: [],
  startTime: null,
  interactions: []
};

// Onboarding flow configurations for different user types
const ONBOARDING_FLOWS = {
  DEVELOPER: {
    name: 'Developer',
    steps: [
      { id: 'welcome', title: 'Welcome to CharlestonHacks', type: 'intro' },
      { id: 'profile_setup', title: 'Set Up Your Developer Profile', type: 'form' },
      { id: 'skill_selection', title: 'Select Your Technical Skills', type: 'multi_select' },
      { id: 'project_interests', title: 'What Projects Interest You?', type: 'card_selection' },
      { id: 'collaboration_style', title: 'Your Collaboration Style', type: 'quiz' },
      { id: 'first_connections', title: 'Connect with Fellow Developers', type: 'recommendations' },
      { id: 'explore_projects', title: 'Explore Active Projects', type: 'discovery' },
      { id: 'completion', title: 'You\'re All Set!', type: 'completion' }
    ],
    estimatedTime: '5-7 minutes'
  },
  DESIGNER: {
    name: 'Designer',
    steps: [
      { id: 'welcome', title: 'Welcome to CharlestonHacks', type: 'intro' },
      { id: 'profile_setup', title: 'Set Up Your Design Profile', type: 'form' },
      { id: 'design_skills', title: 'Your Design Expertise', type: 'multi_select' },
      { id: 'portfolio_setup', title: 'Showcase Your Work', type: 'portfolio' },
      { id: 'design_interests', title: 'Design Areas of Interest', type: 'card_selection' },
      { id: 'collaboration_tools', title: 'Preferred Collaboration Tools', type: 'tool_selection' },
      { id: 'connect_developers', title: 'Connect with Developers', type: 'recommendations' },
      { id: 'join_projects', title: 'Find Design Opportunities', type: 'discovery' },
      { id: 'completion', title: 'Ready to Create!', type: 'completion' }
    ],
    estimatedTime: '6-8 minutes'
  },
  ENTREPRENEUR: {
    name: 'Entrepreneur',
    steps: [
      { id: 'welcome', title: 'Welcome to CharlestonHacks', type: 'intro' },
      { id: 'business_profile', title: 'Tell Us About Your Vision', type: 'form' },
      { id: 'industry_focus', title: 'Industry Focus Areas', type: 'multi_select' },
      { id: 'team_needs', title: 'What Team Members Do You Need?', type: 'team_builder' },
      { id: 'project_scope', title: 'Project Scope and Timeline', type: 'project_planner' },
      { id: 'find_talent', title: 'Connect with Talent', type: 'recommendations' },
      { id: 'create_project', title: 'Create Your First Project', type: 'project_creation' },
      { id: 'completion', title: 'Let\'s Build Something Great!', type: 'completion' }
    ],
    estimatedTime: '7-10 minutes'
  },
  STUDENT: {
    name: 'Student',
    steps: [
      { id: 'welcome', title: 'Welcome to CharlestonHacks', type: 'intro' },
      { id: 'academic_profile', title: 'Your Academic Background', type: 'form' },
      { id: 'learning_goals', title: 'What Do You Want to Learn?', type: 'goal_selection' },
      { id: 'skill_level', title: 'Current Skill Assessment', type: 'skill_assessment' },
      { id: 'mentorship_interest', title: 'Interested in Mentorship?', type: 'mentorship_setup' },
      { id: 'find_mentors', title: 'Connect with Mentors', type: 'recommendations' },
      { id: 'join_beginner_projects', title: 'Beginner-Friendly Projects', type: 'discovery' },
      { id: 'completion', title: 'Start Your Learning Journey!', type: 'completion' }
    ],
    estimatedTime: '4-6 minutes'
  },
  GENERAL: {
    name: 'Community Member',
    steps: [
      { id: 'welcome', title: 'Welcome to CharlestonHacks', type: 'intro' },
      { id: 'interest_discovery', title: 'What Brings You Here?', type: 'interest_quiz' },
      { id: 'profile_setup', title: 'Set Up Your Profile', type: 'form' },
      { id: 'community_exploration', title: 'Explore the Community', type: 'community_tour' },
      { id: 'find_connections', title: 'Find Your People', type: 'recommendations' },
      { id: 'discover_opportunities', title: 'Discover Opportunities', type: 'discovery' },
      { id: 'completion', title: 'Welcome to the Community!', type: 'completion' }
    ],
    estimatedTime: '3-5 minutes'
  }
};

// Initialize smart onboarding
export function initSmartOnboarding() {
  supabase = window.supabase;
  
  // Listen for profile loaded
  window.addEventListener('profile-loaded', (e) => {
    currentUserProfile = e.detail.profile;
    checkOnboardingStatus();
  });

  // Expose functions globally
  window.startSmartOnboarding = startSmartOnboarding;
  window.continueOnboarding = continueOnboarding;
  window.skipOnboardingStep = skipOnboardingStep;
  window.completeOnboarding = completeOnboarding;
  window.restartOnboarding = restartOnboarding;

  console.log('✅ Smart onboarding initialized');
}

// Check if user needs onboarding
async function checkOnboardingStatus() {
  if (!currentUserProfile) return;

  try {
    // Check if user has completed onboarding
    const onboardingData = localStorage.getItem(`onboarding_${currentUserProfile.id}`);
    
    if (!onboardingData) {
      // New user - determine if they need onboarding
      const profileCompleteness = calculateProfileCompleteness(currentUserProfile);
      
      if (profileCompleteness < 0.7) { // Less than 70% complete
        console.log('🎯 New user detected, starting onboarding...');
        setTimeout(() => showOnboardingPrompt(), 2000); // Show after 2 seconds
      }
    } else {
      const data = JSON.parse(onboardingData);
      if (!data.completed && data.currentStep < data.totalSteps) {
        console.log('🎯 Incomplete onboarding detected');
        setTimeout(() => showContinueOnboardingPrompt(data), 3000);
      }
    }
  } catch (error) {
    console.error('🎯 Error checking onboarding status:', error);
  }
}

// Calculate profile completeness
function calculateProfileCompleteness(profile) {
  const fields = ['name', 'bio', 'skills', 'user_role', 'availability'];
  const completed = fields.filter(field => profile[field] && profile[field].trim().length > 0);
  return completed.length / fields.length;
}

// Show onboarding prompt for new users
function showOnboardingPrompt() {
  const modal = document.createElement('div');
  modal.id = 'onboarding-prompt';
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.8);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    padding: 1rem;
  `;

  modal.innerHTML = `
    <div style="
      background: linear-gradient(135deg, rgba(10, 14, 39, 0.98), rgba(26, 26, 46, 0.98));
      border: 2px solid rgba(0, 224, 255, 0.5);
      border-radius: 16px;
      backdrop-filter: blur(10px);
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.7);
      max-width: 500px;
      width: 100%;
      padding: 2rem;
      text-align: center;
    ">
      <div style="
        width: 80px;
        height: 80px;
        border-radius: 50%;
        background: linear-gradient(135deg, #00e0ff, #0080ff);
        margin: 0 auto 1.5rem;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 2rem;
      ">
        🎯
      </div>
      
      <h2 style="color: #00e0ff; margin-bottom: 1rem; font-size: 1.5rem;">
        Welcome to CharlestonHacks!
      </h2>
      
      <p style="color: rgba(255, 255, 255, 0.8); margin-bottom: 1.5rem; line-height: 1.6;">
        Let's get you set up with a personalized experience. Our smart onboarding will help you:
      </p>
      
      <div style="text-align: left; margin-bottom: 2rem;">
        <div style="display: flex; align-items: center; margin-bottom: 0.75rem; color: rgba(255, 255, 255, 0.9);">
          <span style="color: #00ff88; margin-right: 0.5rem;">✓</span>
          Find the right people to connect with
        </div>
        <div style="display: flex; align-items: center; margin-bottom: 0.75rem; color: rgba(255, 255, 255, 0.9);">
          <span style="color: #00ff88; margin-right: 0.5rem;">✓</span>
          Discover projects that match your interests
        </div>
        <div style="display: flex; align-items: center; margin-bottom: 0.75rem; color: rgba(255, 255, 255, 0.9);">
          <span style="color: #00ff88; margin-right: 0.5rem;">✓</span>
          Set up your profile for maximum impact
        </div>
        <div style="display: flex; align-items: center; color: rgba(255, 255, 255, 0.9);">
          <span style="color: #00ff88; margin-right: 0.5rem;">✓</span>
          Get personalized recommendations
        </div>
      </div>
      
      <div style="display: flex; gap: 1rem; justify-content: center;">
        <button onclick="startSmartOnboarding()" style="
          background: linear-gradient(135deg, #00e0ff, #0080ff);
          border: none;
          border-radius: 8px;
          color: white;
          padding: 0.75rem 1.5rem;
          font-weight: 600;
          cursor: pointer;
          font-size: 1rem;
        ">
          Get Started (5 min)
        </button>
        <button onclick="closeOnboardingPrompt()" style="
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 8px;
          color: rgba(255, 255, 255, 0.8);
          padding: 0.75rem 1.5rem;
          cursor: pointer;
          font-size: 1rem;
        ">
          Maybe Later
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Close function
  window.closeOnboardingPrompt = function() {
    modal.remove();
    // Track that user declined onboarding
    trackOnboardingEvent('prompt_declined');
  };
}

// Show continue onboarding prompt
function showContinueOnboardingPrompt(data) {
  const progress = Math.round((data.currentStep / data.totalSteps) * 100);
  
  if (window.showSynapseNotification) {
    window.showSynapseNotification(
      `Continue your onboarding? You're ${progress}% complete.`,
      'info',
      {
        action: 'Continue',
        callback: () => continueOnboarding()
      }
    );
  }
}

// Start smart onboarding
window.startSmartOnboarding = async function() {
  console.log('🎯 Starting smart onboarding...');
  
  // Close any existing prompts
  document.getElementById('onboarding-prompt')?.remove();
  
  // Determine user type through quick assessment
  const userType = await determineUserType();
  
  // Initialize onboarding state
  onboardingState = {
    currentStep: 0,
    completedSteps: [],
    userType: userType,
    preferences: {},
    skipReasons: [],
    startTime: Date.now(),
    interactions: [],
    flow: ONBOARDING_FLOWS[userType]
  };
  
  // Save initial state
  saveOnboardingState();
  
  // Start the flow
  showOnboardingStep(0);
  
  // Track onboarding start
  trackOnboardingEvent('started', { userType });
};

// Determine user type through quick assessment
async function determineUserType() {
  return new Promise((resolve) => {
    const modal = document.createElement('div');
    modal.id = 'user-type-assessment';
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.8);
      backdrop-filter: blur(4px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
      padding: 1rem;
    `;

    modal.innerHTML = `
      <div style="
        background: linear-gradient(135deg, rgba(10, 14, 39, 0.98), rgba(26, 26, 46, 0.98));
        border: 2px solid rgba(0, 224, 255, 0.5);
        border-radius: 16px;
        backdrop-filter: blur(10px);
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.7);
        max-width: 600px;
        width: 100%;
        padding: 2rem;
      ">
        <h2 style="color: #00e0ff; margin-bottom: 1.5rem; text-align: center;">
          What best describes you?
        </h2>
        
        <div style="display: grid; gap: 1rem;">
          ${Object.entries(ONBOARDING_FLOWS).map(([key, flow]) => `
            <button onclick="selectUserType('${key}')" style="
              background: rgba(0, 224, 255, 0.05);
              border: 2px solid rgba(0, 224, 255, 0.3);
              border-radius: 12px;
              padding: 1.5rem;
              color: white;
              cursor: pointer;
              text-align: left;
              transition: all 0.2s;
            " onmouseover="this.style.borderColor='rgba(0, 224, 255, 0.6)'" 
               onmouseout="this.style.borderColor='rgba(0, 224, 255, 0.3)'">
              <div style="font-weight: 600; margin-bottom: 0.5rem; color: #00e0ff;">
                ${flow.name}
              </div>
              <div style="color: rgba(255, 255, 255, 0.7); font-size: 0.9rem;">
                Estimated time: ${flow.estimatedTime}
              </div>
            </button>
          `).join('')}
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    window.selectUserType = function(type) {
      modal.remove();
      resolve(type);
    };
  });
}

// Show onboarding step
function showOnboardingStep(stepIndex) {
  const flow = onboardingState.flow;
  const step = flow.steps[stepIndex];
  
  if (!step) {
    completeOnboarding();
    return;
  }

  console.log(`🎯 Showing onboarding step: ${step.title}`);

  // Create step modal
  const modal = document.createElement('div');
  modal.id = 'onboarding-step';
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.8);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    padding: 1rem;
  `;

  const progress = Math.round((stepIndex / flow.steps.length) * 100);

  modal.innerHTML = `
    <div style="
      background: linear-gradient(135deg, rgba(10, 14, 39, 0.98), rgba(26, 26, 46, 0.98));
      border: 2px solid rgba(0, 224, 255, 0.5);
      border-radius: 16px;
      backdrop-filter: blur(10px);
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.7);
      max-width: 700px;
      width: 100%;
      max-height: 80vh;
      overflow-y: auto;
      position: relative;
    ">
      <!-- Progress Bar -->
      <div style="
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 4px;
        background: rgba(0, 224, 255, 0.2);
        border-radius: 16px 16px 0 0;
      ">
        <div style="
          height: 100%;
          width: ${progress}%;
          background: linear-gradient(90deg, #00e0ff, #0080ff);
          border-radius: 16px 16px 0 0;
          transition: width 0.3s ease;
        "></div>
      </div>
      
      <!-- Header -->
      <div style="padding: 2rem 2rem 1rem;">
        <div style="display: flex; justify-content: between; align-items: center; margin-bottom: 1rem;">
          <div>
            <h2 style="color: #00e0ff; margin: 0; font-size: 1.5rem;">
              ${step.title}
            </h2>
            <div style="color: rgba(255, 255, 255, 0.6); font-size: 0.9rem; margin-top: 0.25rem;">
              Step ${stepIndex + 1} of ${flow.steps.length}
            </div>
          </div>
          <button onclick="skipOnboardingStep()" style="
            background: none;
            border: none;
            color: rgba(255, 255, 255, 0.6);
            cursor: pointer;
            font-size: 0.9rem;
          ">
            Skip
          </button>
        </div>
      </div>
      
      <!-- Content -->
      <div id="onboarding-step-content" style="padding: 0 2rem 2rem;">
        ${generateStepContent(step, stepIndex)}
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  
  // Track step view
  trackOnboardingEvent('step_viewed', { 
    stepId: step.id, 
    stepIndex, 
    stepType: step.type 
  });
}

// Generate content for different step types
function generateStepContent(step, stepIndex) {
  switch (step.type) {
    case 'intro':
      return generateIntroContent(step);
    case 'form':
      return generateFormContent(step);
    case 'multi_select':
      return generateMultiSelectContent(step);
    case 'card_selection':
      return generateCardSelectionContent(step);
    case 'recommendations':
      return generateRecommendationsContent(step);
    case 'completion':
      return generateCompletionContent(step);
    default:
      return generateDefaultContent(step);
  }
}

// Generate intro content
function generateIntroContent(step) {
  return `
    <div style="text-align: center;">
      <div style="
        width: 100px;
        height: 100px;
        border-radius: 50%;
        background: linear-gradient(135deg, #00e0ff, #0080ff);
        margin: 0 auto 2rem;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 3rem;
      ">
        🚀
      </div>
      
      <p style="color: rgba(255, 255, 255, 0.8); font-size: 1.1rem; line-height: 1.6; margin-bottom: 2rem;">
        Welcome to CharlestonHacks! We're excited to have you join our innovation community. 
        Let's personalize your experience to help you connect, collaborate, and create amazing projects.
      </p>
      
      <button onclick="nextOnboardingStep()" style="
        background: linear-gradient(135deg, #00e0ff, #0080ff);
        border: none;
        border-radius: 8px;
        color: white;
        padding: 1rem 2rem;
        font-weight: 600;
        cursor: pointer;
        font-size: 1rem;
      ">
        Let's Get Started
      </button>
    </div>
  `;
}

// Generate form content
function generateFormContent(step) {
  const userType = onboardingState.userType;
  
  return `
    <div>
      <p style="color: rgba(255, 255, 255, 0.8); margin-bottom: 2rem;">
        Tell us about yourself so we can personalize your experience.
      </p>
      
      <div style="display: grid; gap: 1.5rem;">
        <div>
          <label style="color: #00e0ff; display: block; margin-bottom: 0.5rem; font-weight: 600;">
            ${userType === 'DEVELOPER' ? 'Developer' : userType === 'DESIGNER' ? 'Design' : 'Professional'} Bio
          </label>
          <textarea id="onboarding-bio" placeholder="Tell us about your background, interests, and what you're looking to achieve..." style="
            width: 100%;
            min-height: 100px;
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 8px;
            color: white;
            padding: 1rem;
            font-family: inherit;
            resize: vertical;
          "></textarea>
        </div>
        
        <div>
          <label style="color: #00e0ff; display: block; margin-bottom: 0.5rem; font-weight: 600;">
            Current Role/Status
          </label>
          <select id="onboarding-role" style="
            width: 100%;
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 8px;
            color: white;
            padding: 1rem;
            font-family: inherit;
          ">
            <option value="">Select your current status...</option>
            ${userType === 'DEVELOPER' ? `
              <option value="Senior Developer">Senior Developer</option>
              <option value="Mid-level Developer">Mid-level Developer</option>
              <option value="Junior Developer">Junior Developer</option>
              <option value="Full Stack Developer">Full Stack Developer</option>
              <option value="Frontend Developer">Frontend Developer</option>
              <option value="Backend Developer">Backend Developer</option>
            ` : userType === 'DESIGNER' ? `
              <option value="Senior Designer">Senior Designer</option>
              <option value="Mid-level Designer">Mid-level Designer</option>
              <option value="Junior Designer">Junior Designer</option>
              <option value="UI/UX Designer">UI/UX Designer</option>
              <option value="Product Designer">Product Designer</option>
              <option value="Graphic Designer">Graphic Designer</option>
            ` : `
              <option value="Student">Student</option>
              <option value="Recent Graduate">Recent Graduate</option>
              <option value="Career Changer">Career Changer</option>
              <option value="Entrepreneur">Entrepreneur</option>
              <option value="Freelancer">Freelancer</option>
              <option value="Other">Other</option>
            `}
          </select>
        </div>
        
        <div>
          <label style="color: #00e0ff; display: block; margin-bottom: 0.5rem; font-weight: 600;">
            Availability
          </label>
          <select id="onboarding-availability" style="
            width: 100%;
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 8px;
            color: white;
            padding: 1rem;
            font-family: inherit;
          ">
            <option value="Available">Available for projects</option>
            <option value="Open to opportunities">Open to opportunities</option>
            <option value="Limited availability">Limited availability</option>
            <option value="Just exploring">Just exploring</option>
          </select>
        </div>
      </div>
      
      <div style="display: flex; gap: 1rem; justify-content: flex-end; margin-top: 2rem;">
        <button onclick="previousOnboardingStep()" style="
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 8px;
          color: rgba(255, 255, 255, 0.8);
          padding: 0.75rem 1.5rem;
          cursor: pointer;
        ">
          Back
        </button>
        <button onclick="saveFormAndContinue()" style="
          background: linear-gradient(135deg, #00e0ff, #0080ff);
          border: none;
          border-radius: 8px;
          color: white;
          padding: 0.75rem 1.5rem;
          font-weight: 600;
          cursor: pointer;
        ">
          Continue
        </button>
      </div>
    </div>
  `;
}

// Generate completion content
function generateCompletionContent(step) {
  return `
    <div style="text-align: center;">
      <div style="
        width: 120px;
        height: 120px;
        border-radius: 50%;
        background: linear-gradient(135deg, #00ff88, #00e0ff);
        margin: 0 auto 2rem;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 4rem;
      ">
        🎉
      </div>
      
      <h3 style="color: #00ff88; margin-bottom: 1rem; font-size: 1.5rem;">
        Congratulations!
      </h3>
      
      <p style="color: rgba(255, 255, 255, 0.8); font-size: 1.1rem; line-height: 1.6; margin-bottom: 2rem;">
        You're all set up and ready to start your CharlestonHacks journey! 
        We've personalized your experience based on your preferences.
      </p>
      
      <div style="background: rgba(0, 224, 255, 0.1); border: 1px solid rgba(0, 224, 255, 0.3); border-radius: 8px; padding: 1.5rem; margin-bottom: 2rem; text-align: left;">
        <h4 style="color: #00e0ff; margin-bottom: 1rem;">What's Next?</h4>
        <div style="display: grid; gap: 0.75rem;">
          <div style="display: flex; align-items: center; color: rgba(255, 255, 255, 0.9);">
            <span style="color: #00ff88; margin-right: 0.5rem;">→</span>
            Explore personalized project recommendations
          </div>
          <div style="display: flex; align-items: center; color: rgba(255, 255, 255, 0.9);">
            <span style="color: #00ff88; margin-right: 0.5rem;">→</span>
            Connect with like-minded community members
          </div>
          <div style="display: flex; align-items: center; color: rgba(255, 255, 255, 0.9);">
            <span style="color: #00ff88; margin-right: 0.5rem;">→</span>
            Join or create your first project
          </div>
          <div style="display: flex; align-items: center; color: rgba(255, 255, 255, 0.9);">
            <span style="color: #00ff88; margin-right: 0.5rem;">→</span>
            Participate in community events and hackathons
          </div>
        </div>
      </div>
      
      <button onclick="completeOnboarding()" style="
        background: linear-gradient(135deg, #00ff88, #00e0ff);
        border: none;
        border-radius: 8px;
        color: white;
        padding: 1rem 2rem;
        font-weight: 600;
        cursor: pointer;
        font-size: 1rem;
      ">
        Start Exploring
      </button>
    </div>
  `;
}

// Generate default content for other step types
function generateDefaultContent(step) {
  return `
    <div style="text-align: center;">
      <p style="color: rgba(255, 255, 255, 0.8); margin-bottom: 2rem;">
        This step (${step.type}) is being developed. 
      </p>
      
      <button onclick="nextOnboardingStep()" style="
        background: linear-gradient(135deg, #00e0ff, #0080ff);
        border: none;
        border-radius: 8px;
        color: white;
        padding: 0.75rem 1.5rem;
        font-weight: 600;
        cursor: pointer;
      ">
        Continue
      </button>
    </div>
  `;
}

// Navigation functions
window.nextOnboardingStep = function() {
  onboardingState.currentStep++;
  onboardingState.completedSteps.push(onboardingState.currentStep - 1);
  
  document.getElementById('onboarding-step')?.remove();
  showOnboardingStep(onboardingState.currentStep);
  
  saveOnboardingState();
  trackOnboardingEvent('step_completed', { 
    stepIndex: onboardingState.currentStep - 1 
  });
};

window.previousOnboardingStep = function() {
  if (onboardingState.currentStep > 0) {
    onboardingState.currentStep--;
    document.getElementById('onboarding-step')?.remove();
    showOnboardingStep(onboardingState.currentStep);
    saveOnboardingState();
  }
};

window.saveFormAndContinue = function() {
  // Save form data
  const bio = document.getElementById('onboarding-bio')?.value;
  const role = document.getElementById('onboarding-role')?.value;
  const availability = document.getElementById('onboarding-availability')?.value;
  
  if (bio) onboardingState.preferences.bio = bio;
  if (role) onboardingState.preferences.role = role;
  if (availability) onboardingState.preferences.availability = availability;
  
  // Update user profile if possible
  if (currentUserProfile && supabase) {
    updateUserProfile({
      bio: bio || currentUserProfile.bio,
      user_role: role || currentUserProfile.user_role,
      availability: availability || currentUserProfile.availability
    });
  }
  
  nextOnboardingStep();
};

// Skip step
window.skipOnboardingStep = function() {
  const step = onboardingState.flow.steps[onboardingState.currentStep];
  onboardingState.skipReasons.push({
    stepId: step.id,
    stepIndex: onboardingState.currentStep,
    timestamp: Date.now()
  });
  
  trackOnboardingEvent('step_skipped', { 
    stepId: step.id, 
    stepIndex: onboardingState.currentStep 
  });
  
  nextOnboardingStep();
};

// Complete onboarding
window.completeOnboarding = function() {
  console.log('🎯 Onboarding completed!');
  
  // Mark as completed
  onboardingState.completed = true;
  onboardingState.completedAt = Date.now();
  onboardingState.totalTime = Date.now() - onboardingState.startTime;
  
  // Save final state
  saveOnboardingState();
  
  // Close modal
  document.getElementById('onboarding-step')?.remove();
  
  // Track completion
  trackOnboardingEvent('completed', {
    userType: onboardingState.userType,
    totalTime: onboardingState.totalTime,
    stepsCompleted: onboardingState.completedSteps.length,
    stepsSkipped: onboardingState.skipReasons.length
  });
  
  // Show success notification
  if (window.showSynapseNotification) {
    window.showSynapseNotification(
      'Welcome to CharlestonHacks! Your personalized experience is ready.',
      'success'
    );
  }
  
  // Trigger recommendations refresh
  if (window.getPersonalizedRecommendations) {
    setTimeout(() => {
      window.getPersonalizedRecommendations('people', { refresh: true });
      window.getPersonalizedRecommendations('projects', { refresh: true });
    }, 1000);
  }
};

// Continue existing onboarding
window.continueOnboarding = function() {
  const data = JSON.parse(localStorage.getItem(`onboarding_${currentUserProfile.id}`));
  if (data) {
    onboardingState = data;
    showOnboardingStep(onboardingState.currentStep);
  }
};

// Restart onboarding
window.restartOnboarding = function() {
  localStorage.removeItem(`onboarding_${currentUserProfile.id}`);
  startSmartOnboarding();
};

// Update user profile
async function updateUserProfile(updates) {
  if (!supabase || !currentUserProfile) return;
  
  try {
    const { error } = await supabase
      .from('community')
      .update(updates)
      .eq('id', currentUserProfile.id);
    
    if (error) {
      console.error('🎯 Failed to update user profile:', error);
    } else {
      console.log('🎯 User profile updated');
      // Update local profile
      Object.assign(currentUserProfile, updates);
    }
  } catch (error) {
    console.error('🎯 Error updating user profile:', error);
  }
}

// Save onboarding state
function saveOnboardingState() {
  try {
    localStorage.setItem(`onboarding_${currentUserProfile.id}`, JSON.stringify(onboardingState));
  } catch (error) {
    console.warn('🎯 Failed to save onboarding state:', error);
  }
}

// Track onboarding events
function trackOnboardingEvent(eventType, data = {}) {
  const event = {
    type: `onboarding_${eventType}`,
    userId: currentUserProfile?.id,
    timestamp: Date.now(),
    data: {
      ...data,
      userType: onboardingState.userType,
      currentStep: onboardingState.currentStep
    }
  };
  
  // Track with analytics system if available
  if (window.trackEvent) {
    window.trackEvent(event.type, event.data);
  }
  
  console.log('🎯 Onboarding event:', event);
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  initSmartOnboarding();
});

console.log('✅ Smart onboarding system ready');