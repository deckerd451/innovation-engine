// ================================================================
// SIMPLE DASHBOARD CONTROLLER
// ================================================================
// Main controller for simplified dashboard

console.log('📊 Simple Dashboard Loading...');

// Initialize dashboard
function initSimpleDashboard() {
  // Initialize all systems
  if (typeof initSimpleAuth === 'function') {
    initSimpleAuth();
  }
  
  if (typeof initSimpleMessaging === 'function') {
    initSimpleMessaging();
  }
  
  if (typeof initSimpleSynapse === 'function') {
    initSimpleSynapse();
  }
  
  console.log('✅ Simple Dashboard Ready');
}

// Navigation functions
window.showThemes = function() {
  console.log('Showing themes...');
  if (typeof window.renderCurrentView === 'function') {
    window.renderCurrentView();
  } else {
    console.warn('renderCurrentView function not available');
  }
};

window.showProjects = function() {
  console.log('Showing projects...');
  showProjectsView();
};

window.showPeople = function() {
  console.log('Showing people...');
  showPeopleView();
};

window.showProfile = function() {
  console.log('Showing profile...');
  showProfileView();
};

window.showConnections = function() {
  console.log('Showing connections...');
  showConnectionsView();
};

window.createProject = function() {
  console.log('Creating project...');
  showProjectCreator();
};

window.joinTheme = function() {
  console.log('Joining theme...');
  showThemeBrowser();
};

// Show coming soon message
function showComingSoon(feature) {
  const container = document.getElementById('synapse-container');
  container.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #666;">
      <div style="text-align: center;">
        <i class="fas fa-tools" style="font-size: 3rem; margin-bottom: 20px;"></i><br>
        <h3>${feature}</h3>
        <p>This feature is coming soon in the simplified dashboard!</p>
        <button onclick="window.showThemes()" style="
          background: rgba(0,224,255,0.2);
          border: 1px solid rgba(0,224,255,0.5);
          color: #00e0ff;
          padding: 10px 20px;
          border-radius: 4px;
          cursor: pointer;
          margin-top: 15px;
        ">
          <i class="fas fa-arrow-left"></i> Back to Themes
        </button>
      </div>
    </div>
  `;
}

// Projects view
async function showProjectsView() {
  const container = document.getElementById('synapse-container');
  container.innerHTML = `
    <div style="padding: 20px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px;">
        <h2 style="color: #00e0ff; margin: 0;">
          <i class="fas fa-project-diagram"></i> Active Projects
        </h2>
        <button onclick="showProjectCreator()" style="
          background: #00e0ff;
          border: none;
          color: black;
          padding: 10px 20px;
          border-radius: 4px;
          cursor: pointer;
          font-weight: bold;
        ">
          <i class="fas fa-plus"></i> New Project
        </button>
      </div>
      <div id="projects-list">
        <div style="text-align: center; color: #666; padding: 40px;">
          <i class="fas fa-spinner fa-spin" style="font-size: 2rem; margin-bottom: 15px;"></i><br>
          Loading projects...
        </div>
      </div>
    </div>
  `;

  try {
    const { data: projects, error } = await window.supabase
      .from('projects')
      .select('*')
      .eq('status', 'open')
      .order('created_at', { ascending: false });

    if (error) throw error;

    const projectsList = document.getElementById('projects-list');
    if (projects && projects.length > 0) {
      projectsList.innerHTML = projects.map(project => `
        <div style="
          background: linear-gradient(135deg, rgba(255,107,53,0.1) 0%, rgba(0,0,0,0.8) 100%);
          border: 1px solid rgba(255,107,53,0.3);
          border-radius: 8px;
          padding: 20px;
          margin-bottom: 15px;
          cursor: pointer;
          transition: all 0.3s ease;
        " onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='translateY(0)'">
          <h3 style="color: #ff6b35; margin: 0 0 10px 0;">
            <i class="fas fa-project-diagram"></i> ${project.title}
          </h3>
          <p style="color: #ccc; margin: 0 0 15px 0; line-height: 1.4;">
            ${project.description ? project.description.substring(0, 150) + '...' : 'No description available'}
          </p>
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div style="color: #999; font-size: 0.9rem;">
              Status: <span style="color: #4caf50;">${project.status}</span>
            </div>
            <button onclick="viewProject('${project.id}')" style="
              background: rgba(255,107,53,0.2);
              border: 1px solid rgba(255,107,53,0.5);
              color: #ff6b35;
              padding: 6px 12px;
              border-radius: 4px;
              cursor: pointer;
              font-size: 0.9rem;
            ">
              <i class="fas fa-eye"></i> View
            </button>
          </div>
        </div>
      `).join('');
    } else {
      projectsList.innerHTML = `
        <div style="text-align: center; color: #666; padding: 40px;">
          <i class="fas fa-project-diagram" style="font-size: 3rem; margin-bottom: 20px;"></i><br>
          <h3>No Active Projects</h3>
          <p>Be the first to create a project!</p>
          <button onclick="showProjectCreator()" style="
            background: #ff6b35;
            border: none;
            color: white;
            padding: 12px 24px;
            border-radius: 6px;
            cursor: pointer;
            font-weight: bold;
            margin-top: 15px;
          ">
            <i class="fas fa-plus"></i> Create First Project
          </button>
        </div>
      `;
    }
  } catch (error) {
    console.error('Error loading projects:', error);
    document.getElementById('projects-list').innerHTML = `
      <div style="text-align: center; color: #f44336; padding: 40px;">
        <i class="fas fa-exclamation-triangle" style="font-size: 2rem; margin-bottom: 15px;"></i><br>
        <h3>Error Loading Projects</h3>
        <p>Failed to load projects. Please try again.</p>
        <button onclick="showProjectsView()" style="
          background: #f44336;
          border: none;
          color: white;
          padding: 10px 20px;
          border-radius: 4px;
          cursor: pointer;
          margin-top: 15px;
        ">
          <i class="fas fa-redo"></i> Retry
        </button>
      </div>
    `;
  }
}

// People view
async function showPeopleView() {
  const container = document.getElementById('synapse-container');
  container.innerHTML = `
    <div style="padding: 20px;">
      <h2 style="color: #00e0ff; margin-bottom: 30px;">
        <i class="fas fa-users"></i> Community Members
      </h2>
      <div id="people-list">
        <div style="text-align: center; color: #666; padding: 40px;">
          <i class="fas fa-spinner fa-spin" style="font-size: 2rem; margin-bottom: 15px;"></i><br>
          Loading community members...
        </div>
      </div>
    </div>
  `;

  try {
    const { data: people, error } = await window.supabase
      .from('community')
      .select('id, name, skills, bio, image_url')
      .limit(20)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const peopleList = document.getElementById('people-list');
    if (people && people.length > 0) {
      peopleList.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px;">
          ${people.map(person => `
            <div style="
              background: linear-gradient(135deg, rgba(76,175,80,0.1) 0%, rgba(0,0,0,0.8) 100%);
              border: 1px solid rgba(76,175,80,0.3);
              border-radius: 8px;
              padding: 20px;
              text-align: center;
              transition: all 0.3s ease;
            " onmouseover="this.style.transform='translateY(-5px)'" onmouseout="this.style.transform='translateY(0)'">
              <div style="
                width: 60px;
                height: 60px;
                border-radius: 50%;
                background: linear-gradient(135deg, #4caf50, #2e7d32);
                margin: 0 auto 15px auto;
                display: flex;
                align-items: center;
                justify-content: center;
                color: white;
                font-size: 1.5rem;
                font-weight: bold;
              ">
                ${person.name ? person.name.charAt(0).toUpperCase() : '?'}
              </div>
              <h3 style="color: #4caf50; margin: 0 0 10px 0; font-size: 1.1rem;">
                ${person.name || 'Anonymous'}
              </h3>
              <p style="color: #ccc; margin: 0 0 15px 0; font-size: 0.9rem; line-height: 1.4;">
                ${person.bio ? person.bio.substring(0, 100) + '...' : 'No bio available'}
              </p>
              <div style="color: #999; font-size: 0.8rem; margin-bottom: 15px;">
                Skills: ${person.skills || 'Not specified'}
              </div>
              <button onclick="sendDirectMessage('${person.id}', '')" style="
                background: rgba(76,175,80,0.2);
                border: 1px solid rgba(76,175,80,0.5);
                color: #4caf50;
                padding: 8px 16px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 0.9rem;
              ">
                <i class="fas fa-message"></i> Message
              </button>
            </div>
          `).join('')}
        </div>
      `;
    } else {
      peopleList.innerHTML = `
        <div style="text-align: center; color: #666; padding: 40px;">
          <i class="fas fa-users" style="font-size: 3rem; margin-bottom: 20px;"></i><br>
          <h3>No Community Members</h3>
          <p>The community is just getting started!</p>
        </div>
      `;
    }
  } catch (error) {
    console.error('Error loading people:', error);
    document.getElementById('people-list').innerHTML = `
      <div style="text-align: center; color: #f44336; padding: 40px;">
        <i class="fas fa-exclamation-triangle" style="font-size: 2rem; margin-bottom: 15px;"></i><br>
        <h3>Error Loading People</h3>
        <p>Failed to load community members. Please try again.</p>
        <button onclick="showPeopleView()" style="
          background: #f44336;
          border: none;
          color: white;
          padding: 10px 20px;
          border-radius: 4px;
          cursor: pointer;
          margin-top: 15px;
        ">
          <i class="fas fa-redo"></i> Retry
        </button>
      </div>
    `;
  }
}

// Profile view
async function showProfileView() {
  const container = document.getElementById('synapse-container');
  const profile = window.getCurrentProfile();
  
  if (!profile) {
    container.innerHTML = `
      <div style="text-align: center; color: #f44336; padding: 40px;">
        <i class="fas fa-user-slash" style="font-size: 3rem; margin-bottom: 20px;"></i><br>
        <h3>Profile Not Available</h3>
        <p>Please log in to view your profile.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div style="padding: 20px;">
      <h2 style="color: #00e0ff; margin-bottom: 30px;">
        <i class="fas fa-user"></i> Your Profile
      </h2>
      <div style="
        background: linear-gradient(135deg, rgba(0,224,255,0.1) 0%, rgba(0,0,0,0.8) 100%);
        border: 1px solid rgba(0,224,255,0.3);
        border-radius: 8px;
        padding: 30px;
        max-width: 600px;
        margin: 0 auto;
      ">
        <div style="text-align: center; margin-bottom: 30px;">
          <div style="
            width: 100px;
            height: 100px;
            border-radius: 50%;
            background: linear-gradient(135deg, #00e0ff, #0099cc);
            margin: 0 auto 20px auto;
            display: flex;
            align-items: center;
            justify-content: center;
            color: black;
            font-size: 2.5rem;
            font-weight: bold;
          ">
            ${profile.name ? profile.name.charAt(0).toUpperCase() : '?'}
          </div>
          <h3 style="color: #00e0ff; margin: 0 0 10px 0; font-size: 1.5rem;">
            ${profile.name || 'Anonymous User'}
          </h3>
          <p style="color: #999; margin: 0;">
            ${profile.email || 'No email available'}
          </p>
        </div>
        
        <div style="margin-bottom: 25px;">
          <h4 style="color: #ccc; margin-bottom: 10px;">Bio</h4>
          <p style="color: #999; line-height: 1.6;">
            ${profile.bio || 'No bio available. Click edit to add one!'}
          </p>
        </div>
        
        <div style="margin-bottom: 25px;">
          <h4 style="color: #ccc; margin-bottom: 10px;">Skills</h4>
          <p style="color: #999;">
            ${profile.skills || 'No skills listed. Click edit to add some!'}
          </p>
        </div>
        
        <div style="text-align: center;">
          <button onclick="showComingSoon('Profile Editor')" style="
            background: #00e0ff;
            border: none;
            color: black;
            padding: 12px 24px;
            border-radius: 6px;
            cursor: pointer;
            font-weight: bold;
            margin-right: 10px;
          ">
            <i class="fas fa-edit"></i> Edit Profile
          </button>
          <button onclick="window.showThemes()" style="
            background: rgba(0,224,255,0.2);
            border: 1px solid rgba(0,224,255,0.5);
            color: #00e0ff;
            padding: 12px 24px;
            border-radius: 6px;
            cursor: pointer;
          ">
            <i class="fas fa-arrow-left"></i> Back to Dashboard
          </button>
        </div>
      </div>
    </div>
  `;
}

// Connections view
async function showConnectionsView() {
  const container = document.getElementById('synapse-container');
  const profile = window.getCurrentProfile();
  
  if (!profile) {
    container.innerHTML = `
      <div style="text-align: center; color: #f44336; padding: 40px;">
        <i class="fas fa-user-slash" style="font-size: 3rem; margin-bottom: 20px;"></i><br>
        <h3>Login Required</h3>
        <p>Please log in to view your connections.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div style="padding: 20px;">
      <h2 style="color: #00e0ff; margin-bottom: 30px;">
        <i class="fas fa-handshake"></i> Your Connections
      </h2>
      <div id="connections-list">
        <div style="text-align: center; color: #666; padding: 40px;">
          <i class="fas fa-spinner fa-spin" style="font-size: 2rem; margin-bottom: 15px;"></i><br>
          Loading connections...
        </div>
      </div>
    </div>
  `;

  try {
    const { data: connections, error } = await window.supabase
      .from('connections')
      .select(`
        *,
        from_user:community!connections_from_user_id_fkey(id, name, skills),
        to_user:community!connections_to_user_id_fkey(id, name, skills)
      `)
      .or(`from_user_id.eq.${profile.id},to_user_id.eq.${profile.id}`)
      .eq('status', 'accepted');

    if (error) throw error;

    const connectionsList = document.getElementById('connections-list');
    if (connections && connections.length > 0) {
      connectionsList.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px;">
          ${connections.map(conn => {
            const otherUser = conn.from_user_id === profile.id ? conn.to_user : conn.from_user;
            return `
              <div style="
                background: linear-gradient(135deg, rgba(0,224,255,0.1) 0%, rgba(0,0,0,0.8) 100%);
                border: 1px solid rgba(0,224,255,0.3);
                border-radius: 8px;
                padding: 20px;
                text-align: center;
                transition: all 0.3s ease;
              " onmouseover="this.style.transform='translateY(-5px)'" onmouseout="this.style.transform='translateY(0)'">
                <div style="
                  width: 60px;
                  height: 60px;
                  border-radius: 50%;
                  background: linear-gradient(135deg, #00e0ff, #0099cc);
                  margin: 0 auto 15px auto;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  color: black;
                  font-size: 1.5rem;
                  font-weight: bold;
                ">
                  ${otherUser?.name ? otherUser.name.charAt(0).toUpperCase() : '?'}
                </div>
                <h3 style="color: #00e0ff; margin: 0 0 10px 0; font-size: 1.1rem;">
                  ${otherUser?.name || 'Unknown User'}
                </h3>
                <div style="color: #999; font-size: 0.8rem; margin-bottom: 15px;">
                  Skills: ${otherUser?.skills || 'Not specified'}
                </div>
                <button onclick="sendDirectMessage('${otherUser?.id}', '')" style="
                  background: rgba(0,224,255,0.2);
                  border: 1px solid rgba(0,224,255,0.5);
                  color: #00e0ff;
                  padding: 8px 16px;
                  border-radius: 4px;
                  cursor: pointer;
                  font-size: 0.9rem;
                ">
                  <i class="fas fa-message"></i> Message
                </button>
              </div>
            `;
          }).join('')}
        </div>
      `;
    } else {
      connectionsList.innerHTML = `
        <div style="text-align: center; color: #666; padding: 40px;">
          <i class="fas fa-handshake" style="font-size: 3rem; margin-bottom: 20px;"></i><br>
          <h3>No Connections Yet</h3>
          <p>Start connecting with other community members!</p>
          <button onclick="showPeopleView()" style="
            background: #00e0ff;
            border: none;
            color: black;
            padding: 12px 24px;
            border-radius: 6px;
            cursor: pointer;
            font-weight: bold;
            margin-top: 15px;
          ">
            <i class="fas fa-users"></i> Browse People
          </button>
        </div>
      `;
    }
  } catch (error) {
    console.error('Error loading connections:', error);
    document.getElementById('connections-list').innerHTML = `
      <div style="text-align: center; color: #f44336; padding: 40px;">
        <i class="fas fa-exclamation-triangle" style="font-size: 2rem; margin-bottom: 15px;"></i><br>
        <h3>Error Loading Connections</h3>
        <p>Failed to load connections. Please try again.</p>
        <button onclick="showConnectionsView()" style="
          background: #f44336;
          border: none;
          color: white;
          padding: 10px 20px;
          border-radius: 4px;
          cursor: pointer;
          margin-top: 15px;
        ">
          <i class="fas fa-redo"></i> Retry
        </button>
      </div>
    `;
  }
}

// Project creator
function showProjectCreator() {
  const container = document.getElementById('synapse-container');
  container.innerHTML = `
    <div style="padding: 20px;">
      <div style="margin-bottom: 20px;">
        <button onclick="showProjectsView()" style="
          background: rgba(0,224,255,0.2);
          border: 1px solid rgba(0,224,255,0.5);
          color: #00e0ff;
          padding: 8px 15px;
          border-radius: 4px;
          cursor: pointer;
        ">
          <i class="fas fa-arrow-left"></i> Back to Projects
        </button>
      </div>
      
      <div style="
        background: linear-gradient(135deg, rgba(255,107,53,0.1) 0%, rgba(0,0,0,0.8) 100%);
        border: 1px solid rgba(255,107,53,0.3);
        border-radius: 8px;
        padding: 30px;
        max-width: 600px;
        margin: 0 auto;
      ">
        <h2 style="color: #ff6b35; margin-bottom: 30px; text-align: center;">
          <i class="fas fa-plus-circle"></i> Create New Project
        </h2>
        
        <form id="project-form" style="display: flex; flex-direction: column; gap: 20px;">
          <div>
            <label style="color: #ccc; display: block; margin-bottom: 8px;">Project Title</label>
            <input type="text" id="project-title" required style="
              width: 100%;
              padding: 12px;
              border: 1px solid #333;
              border-radius: 4px;
              background: rgba(0,0,0,0.7);
              color: white;
              font-size: 1rem;
            " placeholder="Enter project title...">
          </div>
          
          <div>
            <label style="color: #ccc; display: block; margin-bottom: 8px;">Description</label>
            <textarea id="project-description" required style="
              width: 100%;
              padding: 12px;
              border: 1px solid #333;
              border-radius: 4px;
              background: rgba(0,0,0,0.7);
              color: white;
              font-size: 1rem;
              min-height: 120px;
              resize: vertical;
            " placeholder="Describe your project..."></textarea>
          </div>
          
          <div style="text-align: center; margin-top: 20px;">
            <button type="submit" style="
              background: #ff6b35;
              border: none;
              color: white;
              padding: 12px 30px;
              border-radius: 6px;
              font-size: 1.1rem;
              font-weight: bold;
              cursor: pointer;
              margin-right: 10px;
            ">
              <i class="fas fa-rocket"></i> Create Project
            </button>
            <button type="button" onclick="showProjectsView()" style="
              background: rgba(255,107,53,0.2);
              border: 1px solid rgba(255,107,53,0.5);
              color: #ff6b35;
              padding: 12px 30px;
              border-radius: 6px;
              cursor: pointer;
            ">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  `;

  // Handle form submission
  document.getElementById('project-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const title = document.getElementById('project-title').value.trim();
    const description = document.getElementById('project-description').value.trim();
    const profile = window.getCurrentProfile();
    
    if (!profile) {
      alert('Please log in to create a project');
      return;
    }
    
    if (!title || !description) {
      alert('Please fill in all fields');
      return;
    }
    
    try {
      const { data, error } = await window.supabase
        .from('projects')
        .insert([{
          title: title,
          description: description,
          creator_id: profile.id,
          status: 'open'
        }]);
      
      if (error) throw error;
      
      alert('Project created successfully!');
      showProjectsView();
    } catch (error) {
      console.error('Error creating project:', error);
      alert('Failed to create project. Please try again.');
    }
  });
}

// Theme browser
function showThemeBrowser() {
  const container = document.getElementById('synapse-container');
  container.innerHTML = `
    <div style="padding: 20px;">
      <div style="margin-bottom: 20px;">
        <button onclick="window.showThemes()" style="
          background: rgba(0,224,255,0.2);
          border: 1px solid rgba(0,224,255,0.5);
          color: #00e0ff;
          padding: 8px 15px;
          border-radius: 4px;
          cursor: pointer;
        ">
          <i class="fas fa-arrow-left"></i> Back to Themes
        </button>
      </div>
      
      <div style="text-align: center; color: #666; padding: 60px;">
        <i class="fas fa-lightbulb" style="font-size: 4rem; margin-bottom: 30px; color: #00e0ff;"></i><br>
        <h2 style="color: #00e0ff; margin-bottom: 20px;">Theme Browser</h2>
        <p style="font-size: 1.1rem; line-height: 1.6; margin-bottom: 30px;">
          Browse and join innovation themes to connect with like-minded innovators and collaborate on exciting projects.
        </p>
        <p style="color: #999; margin-bottom: 30px;">
          This feature will allow you to:
        </p>
        <div style="text-align: left; max-width: 400px; margin: 0 auto 30px auto;">
          <div style="margin-bottom: 10px;"><i class="fas fa-check" style="color: #4caf50; margin-right: 10px;"></i> Browse all available themes</div>
          <div style="margin-bottom: 10px;"><i class="fas fa-check" style="color: #4caf50; margin-right: 10px;"></i> See theme participants and projects</div>
          <div style="margin-bottom: 10px;"><i class="fas fa-check" style="color: #4caf50; margin-right: 10px;"></i> Join themes that interest you</div>
          <div style="margin-bottom: 10px;"><i class="fas fa-check" style="color: #4caf50; margin-right: 10px;"></i> Get matched with relevant collaborators</div>
        </div>
        <div style="color: #00e0ff; font-weight: bold; margin-bottom: 30px;">
          Coming Soon!
        </div>
        <button onclick="window.showThemes()" style="
          background: #00e0ff;
          border: none;
          color: black;
          padding: 12px 24px;
          border-radius: 6px;
          cursor: pointer;
          font-weight: bold;
        ">
          <i class="fas fa-eye"></i> View Current Themes
        </button>
      </div>
    </div>
  `;
}

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
  // Small delay to ensure other scripts are loaded
  setTimeout(initSimpleDashboard, 100);
});

// Expose functions globally
window.showProjectsView = showProjectsView;
window.showPeopleView = showPeopleView;
window.showProfileView = showProfileView;
window.showConnectionsView = showConnectionsView;
window.showProjectCreator = showProjectCreator;
window.showThemeBrowser = showThemeBrowser;
window.showComingSoon = showComingSoon;

console.log('✅ Simple Dashboard Loaded');