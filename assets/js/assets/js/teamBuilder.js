function createTeamCard(person) {
  const skillsArr = (person.skills || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);

  return `
    <div class="team-card">
      <img src="${person.image_url || 'assets/default-avatar.png'}" class="profile-avatar" />

      <div class="person-name">${person.name}</div>

      <div class="skills-chips">
        ${skillsArr.map(skill => `<span class="skill-chip">${skill}</span>`).join("")}
      </div>
    </div>
  `;
}
