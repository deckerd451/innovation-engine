// main.js - Core application functionality for Innovation Engine

// Application state
const state = {
    currentUser: null,
    isAuthenticated: false,
    projects: [],
    teamMembers: [],
    notifications: []
};

// Initialize application
async function initApp() {
    console.log("Initializing Innovation Engine application...");
    
    // Check authentication status
    await checkAuthStatus();
    
    // Load initial data
    if (state.isAuthenticated) {
        await Promise.all([
            loadProjects(),
            loadTeamMembers()
        ]);
        
        // Set up UI based on authentication
        setupAuthenticatedUI();
    } else {
        setupUnauthenticatedUI();
    }
    
    // Set up event listeners
    setupEventListeners();
    
    // Initialize the UI components
    initializeUI();
    
    console.log("Application initialization complete");
}

// Check if user is authenticated
async function checkAuthStatus() {
    try {
        const authData = localStorage.getItem('authData');
        
        if (authData) {
            const parsedData = JSON.parse(authData);
            if (parsedData && parsedData.token && parsedData.expiresAt > Date.now()) {
                state.isAuthenticated = true;
                state.currentUser = parsedData.user;
                console.log("User is authenticated:", state.currentUser.username);
                return true;
            }
        }
        
        console.log("User is not authenticated");
        return false;
    } catch (error) {
        console.error("Error checking authentication status:", error);
        return false;
    }
}

// Load projects from data manager
async function loadProjects() {
    try {
        state.projects = await DataManager.getProjects();
        console.log(`Loaded ${state.projects.length} projects`);
    } catch (error) {
        console.error("Error loading projects:", error);
        showNotification("Failed to load projects. Please try again later.", "error");
    }
}

// Load team members from data manager
async function loadTeamMembers() {
    try {
        state.teamMembers = await DataManager.getTeamMembers();
        console.log(`Loaded ${state.teamMembers.length} team members`);
    } catch (error) {
        console.error("Error loading team members:", error);
        showNotification("Failed to load team members. Please try again later.", "error");
    }
}

// Set up UI for authenticated users
function setupAuthenticatedUI() {
    // Update navigation
    const authNav = document.getElementById('auth-nav');
    if (authNav) {
        authNav.innerHTML = `
            <span>Welcome, ${state.currentUser.username}</span>
            <a href="pages/projects.html">My Projects</a>
            <a href="pages/teams.html">My Teams</a>
            <button id="logout-btn">Logout</button>
        `;
        
        // Add logout event listener
        document.getElementById('logout-btn').addEventListener('click', logout);
    }
    
    // Show authenticated content
    document.querySelectorAll('.auth-required').forEach(el => {
        el.style.display = 'block';
    });
    
    // Hide unauthenticated content
    document.querySelectorAll('.unauth-only').forEach(el => {
        el.style.display = 'none';
    });
}

// Set up UI for unauthenticated users
function setupUnauthenticatedUI() {
    // Update navigation
    const authNav = document.getElementById('auth-nav');
    if (authNav) {
        authNav.innerHTML = `
            <a href="pages/register.html">Register</a>
            <button id="login-btn">Login</button>
        `;
        
        // Add login event listener
        document.getElementById('login-btn').addEventListener('click', showLoginModal);
    }
    
    // Hide authenticated content
    document.querySelectorAll('.auth-required').forEach(el => {
        el.style.display = 'none';
    });
    
    // Show unauthenticated content
    document.querySelectorAll('.unauth-only').forEach(el => {
        el.style.display = 'block';
    });
}

// Set up general event listeners
function setupEventListeners() {
    // Add project creation listener if on the right page
    const createProjectForm = document.getElementById('create-project-form');
    if (createProjectForm) {
        createProjectForm.addEventListener('submit', handleProjectCreation);
    }
    
    // Add team formation listener if on the right page
    const formTeamBtn = document.getElementById('form-team-btn');
    if (formTeamBtn) {
        formTeamBtn.addEventListener('click', handleTeamFormation);
    }
    
    // Notification close buttons
    document.addEventListener('click', function(event) {
        if (event.target.classList.contains('notification-close')) {
            const notification = event.target.closest('.notification');
            if (notification) {
                notification.remove();
            }
        }
    });
}

// Initialize UI components
function initializeUI() {
    // Initialize skill search if on index page
    const skillInput = document.getElementById('skillInput');
    if (skillInput) {
        // This functionality is already implemented in index.html
        console.log("Skill search UI initialized");
    }
    
    // Initialize projects list if on projects page
    const projectsList = document.getElementById('projects-list');
    if (projectsList) {
        renderProjects();
    }
    
    // Initialize teams list if on teams page
    const teamsList = document.getElementById('teams-list');
    if (teamsList) {
        renderTeams();
    }
}

// Show notification to user
function showNotification(message, type = 'info') {
    const notificationContainer = document.getElementById('notification-container');
    
    // Create notification container if it doesn't exist
    if (!notificationContainer) {
        const container = document.createElement('div');
        container.id = 'notification-container';
        container.style.position = 'fixed';
        container.style.top = '20px';
        container.style.right = '20px';
        container.style.zIndex = '1000';
        document.body.appendChild(container);
    }
    
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        ${message}
        <button class="notification-close">&times;</button>
    `;
    
    // Add to container
    document.getElementById('notification-container').appendChild(notification);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        if (notification.parentNode) {
            notification.remove();
        }
    }, 5000);
}

// Logout handler
function logout() {
    localStorage.removeItem('authData');
    state.isAuthenticated = false;
    state.currentUser = null;
    
    showNotification("You have been logged out successfully");
    
    // Redirect to home if not already there
    if (window.location.pathname !== '/' && window.location.pathname !== '/index.html') {
        window.location.href = '/';
    } else {
        setupUnauthenticatedUI();
    }
}

// Show login modal
function showLoginModal() {
    // Create modal if it doesn't exist
    let modal = document.getElementById('login-modal');
    
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'login-modal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <span class="close">&times;</span>
                <h2>Login to Innovation Engine</h2>
                <form id="login-form">
                    <div class="form-group">
                        <label for="username">Username:</label>
                        <input type="text" id="username" name="username" required>
                    </div>
                    <div class="form-group">
                        <label for="password">Password:</label>
                        <input type="password" id="password" name="password" required>
                    </div>
                    <div class="form-actions">
                        <button type="submit">Login</button>
                        <a href="pages/register.html">Need an account? Register</a>
                    </div>
                </form>
                <div class="github-login">
                    <button id="github-login">Login with GitHub</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        
        // Add event listeners to new modal
        modal.querySelector('.close').addEventListener('click', () => {
            modal.style.display = 'none';
        });
        
        modal.querySelector('#login-form').addEventListener('submit', handleLogin);
        modal.querySelector('#github-login').addEventListener('click', handleGitHubLogin);
        
        // Close when clicking outside
        window.addEventListener('click', (event) => {
            if (event.target === modal) {
                modal.style.display = 'none';
            }
        });
    }
    
    // Show the modal
    modal.style.display = 'block';
}

// Handle login form submission
async function handleLogin(event) {
    event.preventDefault();
    
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    
    try {
        const result = await Auth.login(username, password);
        
        if (result.success) {
            document.getElementById('login-modal').style.display = 'none';
            showNotification("Login successful!");
            
            // Update application state
            state.isAuthenticated = true;
            state.currentUser = result.user;
            
            // Update UI
            setupAuthenticatedUI();
            
            // Load user-specific data
            await Promise.all([
                loadProjects(),
                loadTeamMembers()
            ]);
        } else {
            showNotification(result.message || "Login failed. Please check your credentials.", "error");
        }
    } catch (error) {
        console.error("Login error:", error);
        showNotification("An error occurred during login. Please try again.", "error");
    }
}

// Handle GitHub login
function handleGitHubLogin() {
    Auth.initiateGitHubLogin();
}

// Initialize application when DOM is loaded
document.addEventListener('DOMContentLoaded', initApp);

// Make available globally
window.InnovationEngine = {
    showNotification,
    logout,
    showLoginModal
};
