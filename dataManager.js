// dataManager.js
const repoOwner = 'YOUR_USERNAME';
const repoName = 'innovation-engine';
const dataPath = 'data';

// Get authenticated user's token
function getToken() {
  return localStorage.getItem('github_token');
}

// Save team member profile
async function saveTeamMember(memberData) {
  const token = getToken();
  if (!token) throw new Error('Authentication required');
  
  const username = memberData.github_username;
  const filePath = `${dataPath}/members/${username}.json`;
  
  // Check if file exists first (to update vs create)
  let sha;
  try {
    const existingFile = await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/contents/${filePath}`, {
      headers: { 'Authorization': `token ${token}` }
    });
    
    if (existingFile.ok) {
      const fileData = await existingFile.json();
      sha = fileData.sha;
    }
  } catch (error) {
    // File doesn't exist, will create new
  }
  
  // Prepare the request to create/update file
  const content = btoa(JSON.stringify(memberData, null, 2)); // Convert to base64
  const method = sha ? 'PUT' : 'PUT'; // GitHub API uses PUT for both create and update
  
  const requestBody = {
    message: `${sha ? 'Update' : 'Create'} profile for ${username}`,
    content,
    branch: 'main'
  };
  
  if (sha) requestBody.sha = sha;
  
  const response = await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/contents/${filePath}`, {
    method,
    headers: {
      'Authorization': `token ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message);
  }
  
  return response.json();
}

// Create a new project
async function createProject(projectData) {
  const token = getToken();
  if (!token) throw new Error('Authentication required');
  
  const projectId = generateProjectId(projectData.title);
  const filePath = `${dataPath}/projects/${projectId}.json`;
  
  const content = btoa(JSON.stringify({
    ...projectData,
    id: projectId,
    created_by: JSON.parse(localStorage.getItem('user_data')).login,
    created_at: new Date().toISOString(),
    team_members: [],
    status: 'forming'
  }, null, 2));
  
  const response = await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/contents/${filePath}`, {
    method: 'PUT',
    headers: {
      'Authorization': `token ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      message: `Create project: ${projectData.title}`,
      content,
      branch: 'main'
    })
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message);
  }
  
  // Create a GitHub issue for the project
  createProjectIssue(projectData);
  
  return response.json();
}

// Get all team members
async function getAllTeamMembers() {
  const token = getToken();
  
  const response = await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/contents/${dataPath}/members`, {
    headers: token ? { 'Authorization': `token ${token}` } : {}
  });
  
  if (!response.ok) return []; // No members yet or directory doesn't exist
  
  const files = await response.json();
  const members = await Promise.all(files.map(async file => {
    const fileResponse = await fetch(file.download_url);
    return fileResponse.json();
  }));
  
  return members;
}

// Get all projects
async function getAllProjects() {
  const token = getToken();
  
  const response = await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/contents/${dataPath}/projects`, {
    headers: token ? { 'Authorization': `token ${token}` } : {}
  });
  
  if (!response.ok) return []; // No projects yet or directory doesn't exist
  
  const files = await response.json();
  const projects = await Promise.all(files.map(async file => {
    const fileResponse = await fetch(file.download_url);
    return fileResponse.json();
  }));
  
  return projects;
}

// Create a GitHub issue for project tracking
async function createProjectIssue(projectData) {
  const token = getToken();
  if (!token) return;
  
  const response = await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/issues`, {
    method: 'POST',
    headers: {
      'Authorization': `token ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      title: `Project: ${projectData.title}`,
      body: `
## Project Description
${projectData.description}

## Required Skills
${projectData.required_skills.join(', ')}

## Timeline
${projectData.timeline || 'Not specified'}

## Team Size
${projectData.team_size || 'Not specified'}

This issue is used to track the project's progress.
      `,
      labels: ['project']
    })
  });
  
  return response.json();
}

// Helper function to generate a project ID from title
function generateProjectId(title) {
  return title.toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, '-') + 
    '-' + Date.now().toString().substring(9);
}
