// teamMatcher.js
async function findMatchesForProject(projectId) {
  // Get project and all team members
  const projects = await getAllProjects();
  const project = projects.find(p => p.id === projectId);
  if (!project) throw new Error('Project not found');
  
  const members = await getAllTeamMembers();
  
  // Calculate match scores
  const matches = members.map(member => {
    const matchingSkills = member.skills.filter(skill => 
      project.required_skills.some(reqSkill => 
        skill.toLowerCase().includes(reqSkill.toLowerCase()) || 
        reqSkill.toLowerCase().includes(skill.toLowerCase())
      )
    );
    
    return {
      member,
      matchCount: matchingSkills.length,
      matchPercentage: Math.round((matchingSkills.length / project.required_skills.length) * 100),
      matchingSkills
    };
  });
  
  // Sort by match percentage (highest first)
  return matches.sort((a, b) => b.matchPercentage - a.matchPercentage);
}

// Display matching team members for a project 
function displayMatches(projectId, containerId) {
  const container = document.getElementById(containerId);
  container.innerHTML = '<p>Finding matches...</p>';
  
  findMatchesForProject(projectId)
    .then(matches => {
      if (matches.length === 0) {
        container.innerHTML = '<p>No matching team members found.</p>';
        return;
      }
      
      let html = '<div class="matches-container">';
      matches.forEach(match => {
        if (match.matchPercentage > 0) {
          html += `
            <div class="match-card">
              <img src="${match.member.avatar_url}" alt="${match.member.full_name}">
              <h3>${match.member.full_name}</h3>
              <p class="match-percent">${match.matchPercentage}% match</p>
              <div class="skills">
                ${match.matchingSkills.map(skill => 
                  `<span class="skill-tag">${skill}</span>`
                ).join('')}
              </div>
              <button onclick="inviteTeamMember('${projectId}', '${match.member.github_username}')">
                Invite to Team
              </button>
            </div>
          `;
        }
      });
      html += '</div>';
      
      container.innerHTML = html;
    })
    .catch(error => {
      container.innerHTML = `<p>Error finding matches: ${error.message}</p>`;
    });
}

// Invite a team member to join a project
async function inviteTeamMember(projectId, username) {
  const token = getToken();
  if (!token) {
    alert('Please log in to invite team members');
    return;
  }
  
  try {
    // Get the project file
    const projects = await getAllProjects();
    const project = projects.find(p => p.id === projectId);
    if (!project) throw new Error('Project not found');
    
    // Check if user is already invited
    if (project.team_members.includes(username)) {
      alert('This member is already part of the team!');
      return;
    }
    
    // Add user to team members
    project.team_members.push(username);
    
    // Update project file
    const filePath = `${dataPath}/projects/${projectId}.json`;
    const existingFile = await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/contents/${filePath}`, {
      headers: { 'Authorization': `token ${token}` }
    });
    
    if (!existingFile.ok) throw new Error('Project file not found');
    
    const fileData = await existingFile.json();
    const content = btoa(JSON.stringify(project, null, 2));
    
    const response = await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/contents/${filePath}`, {
      method: 'PUT',
      headers: {
        'Authorization': `token ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: `Add ${username} to project team`,
        content,
        sha: fileData.sha,
        branch: 'main'
      })
    });
    
    if (!response.ok) throw new Error('Failed to update project');
    
    // Create a comment on the project issue to notify about the new team member
    const issueCommentResponse = await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/issues/comments`, {
      method: 'POST',
      headers: {
        'Authorization': `token ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        body: `@${username} has been invited to join the project!`
      })
    });
    
    alert(`${username} has been invited to the team!`);
    // Refresh the matches display
    displayMatches(projectId, 'matches-container');
    
  } catch (error) {
    alert('Error inviting team member: ' + error.message);
  }
}
