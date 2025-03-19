// auth.js - Authentication functionality for Innovation Engine

const Auth = (function() {
    // Configuration
    const config = {
        apiBase: 'https://api.charlestonhacks.com/v1',
        githubClientId: 'your-github-client-id', // This would be replaced with actual client ID
        githubRedirectUri: `${window.location.origin}/github-callback.html`,
        tokenKey: 'authData'
    };
    
    // Check if a token is valid
    function isTokenValid(token) {
        if (!token) return false;
        
        try {
            // Simple check - in production would verify with server
            const payload = JSON.parse(atob(token.split('.')[1]));
            return payload.exp * 1000 > Date.now();
        } catch (e) {
            console.error("Error validating token:", e);
            return false;
        }
    }
    
    // Normal login with username and password
    async function login(username, password) {
        try {
            const response = await fetch(`${config.apiBase}/auth/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, password })
            });
            
            const data = await response.json();
            
            if (response.ok && data.token) {
                // Store auth data
                const authData = {
                    token: data.token,
                    user: data.user,
                    expiresAt: Date.now() + (data.expiresIn * 1000)
                };
                
                localStorage.setItem(config.tokenKey, JSON.stringify(authData));
                return { success: true, user: data.user };
            } else {
                return { success: false, message: data.message || 'Login failed' };
            }
        } catch (error) {
            console.error("Login error:", error);
            return { success: false, message: 'Network error. Please try again.' };
        }
    }
    
    // Register new user
    async function register(userData) {
        try {
            const response = await fetch(`${config.apiBase}/auth/register`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(userData)
            });
            
            const data = await response.json();
            
            if (response.ok) {
                return { success: true, message: data.message || 'Registration successful!' };
            } else {
                return { success: false, message: data.message || 'Registration failed' };
            }
        } catch (error) {
            console.error("Registration error:", error);
            return { success: false, message: 'Network error. Please try again.' };
        }
    }
    
    // Initiate GitHub OAuth login flow
    function initiateGitHubLogin() {
        // Generate a random state for security
        const state = Math.random().toString(36).substring(2, 15);
        
        // Store the state in localStorage to verify when GitHub redirects back
        localStorage.setItem('githubOAuthState', state);
        
        // Build the GitHub authorization URL
        const githubAuthUrl = 'https://github.com/login/oauth/authorize' +
            `?client_id=${config.githubClientId}` +
            `&redirect_uri=${encodeURIComponent(config.githubRedirectUri)}` +
            `&state=${state}` +
            '&scope=user:email';
        
        // Redirect to GitHub for authorization
        window.location.href = githubAuthUrl;
    }
    
    // Handle GitHub OAuth callback
    async function handleGitHubCallback(code, state) {
        // Verify state to prevent CSRF attacks
        const storedState = localStorage.getItem('githubOAuthState');
        localStorage.removeItem('githubOAuthState');
        
        if (state !== storedState) {
            return { success: false, message: 'Invalid state. Authentication failed.' };
        }
        
        try {
            // Exchange code for token via backend to protect client_secret
            const response = await fetch(`${config.apiBase}/auth/github`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ code })
            });
            
            const data = await response.json();
            
            if (response.ok && data.token) {
                // Store auth data
                const authData = {
                    token: data.token,
                    user: data.user,
                    expiresAt: Date.now() + (data.expiresIn * 1000),
                    isGithub: true
                };
                
                localStorage.setItem(config.tokenKey, JSON.stringify(authData));
                return { success: true, user: data.user };
            } else {
                return { success: false, message: data.message || 'GitHub authentication failed' };
            }
        } catch (error) {
            console.error("GitHub auth error:", error);
            return { success: false, message: 'Network error. Please try again.' };
        }
    }
    
    // Logout user
    function logout() {
        localStorage.removeItem(config.tokenKey);
        
        // Redirect to home page
        if (window.location.pathname !== '/' && window.location.pathname !== '/index.html') {
            window.location.href = '/';
        }
        
        return { success: true };
    }
    
    // Get current authenticated user
    function getCurrentUser() {
        try {
            const authData = localStorage.getItem(config.tokenKey);
            if (authData) {
                const parsed = JSON.parse(authData);
                if (parsed && parsed.user && parsed.expiresAt > Date.now()) {
                    return parsed.user;
                }
            }
            return null;
        } catch (error) {
            console.error("Error getting current user:", error);
            return null;
        }
    }
    
    // Get auth token for API requests
    function getToken() {
        try {
            const authData = localStorage.getItem(config.tokenKey);
            if (authData) {
                const parsed = JSON.parse(authData);
                if (parsed && parsed.token && parsed.expiresAt > Date.now()) {
                    return parsed.token;
                }
            }
            return null;
        } catch (error) {
            console.error("Error getting token:", error);
            return null;
        }
    }
    
    // Check if user is authenticated
    function isAuthenticated() {
        return getToken() !== null;
    }

    // Expose public methods
    return {
        login,
        register,
        logout,
        initiateGitHubLogin,
        handleGitHubCallback,
        getCurrentUser,
        getToken,
        isAuthenticated
    };
})();

// If this file is loaded from github-callback.html, handle the callback
document.addEventListener('DOMContentLoaded', function() {
    if (window.location.pathname.includes('github-callback')) {
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        const state = urlParams.get('state');
        
        if (code && state) {
            const resultElement = document.getElementById('github-result');
            
            if (resultElement) {
                resultElement.textContent = 'Processing GitHub login...';
            }
            
            Auth.handleGitHubCallback(code, state)
                .then(result => {
                    if (result.success) {
                        if (resultElement) {
                            resultElement.textContent = 'GitHub login successful! Redirecting...';
                        }
                        
                        // Redirect to home page or wherever is appropriate
                        setTimeout(() => {
                            window.location.href = '/';
                        }, 1000);
                    } else {
                        if (resultElement) {
                            resultElement.textContent = `GitHub login failed: ${result.message}`;
                        }
                    }
                })
                .catch(error => {
                    console.error("Error in GitHub callback:", error);
                    if (resultElement) {
                        resultElement.textContent = 'An error occurred during GitHub login. Please try again.';
                    }
                });
        }
    }
});
