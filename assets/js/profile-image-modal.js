/**
 * Profile Image Modal
 * Provides click-to-enlarge functionality for profile pictures
 */

export function createProfileImageModal(imageUrl, userName, initials) {
  // Create modal overlay
  const modal = document.createElement('div');
  modal.id = 'profile-image-modal';
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.9);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100002;
    animation: fadeIn 0.3s ease;
    cursor: pointer;
  `;

  // Create image container
  const imageContainer = document.createElement('div');
  imageContainer.style.cssText = `
    position: relative;
    max-width: 90%;
    max-height: 90%;
    animation: zoomIn 0.3s ease;
  `;

  // Create enlarged image or placeholder
  let enlargedContent;
  if (imageUrl) {
    enlargedContent = document.createElement('img');
    enlargedContent.src = imageUrl;
    enlargedContent.style.cssText = `
      width: 400px;
      height: 400px;
      border-radius: 50%;
      object-fit: cover;
      box-shadow: 0 20px 60px rgba(0, 224, 255, 0.5);
      border: 4px solid rgba(0, 224, 255, 0.8);
    `;
  } else {
    enlargedContent = document.createElement('div');
    enlargedContent.style.cssText = `
      width: 400px;
      height: 400px;
      background: linear-gradient(135deg, #00e0ff, #0080ff);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12rem;
      font-weight: bold;
      color: white;
      box-shadow: 0 20px 60px rgba(0, 224, 255, 0.5);
      border: 4px solid rgba(0, 224, 255, 0.8);
    `;
    enlargedContent.textContent = initials;
  }

  // Create user name label
  const nameLabel = document.createElement('div');
  nameLabel.style.cssText = `
    position: absolute;
    bottom: -60px;
    left: 50%;
    transform: translateX(-50%);
    color: #00e0ff;
    font-size: 1.5rem;
    font-weight: 700;
    text-align: center;
    white-space: nowrap;
  `;
  nameLabel.textContent = userName;

  // Create close button
  const closeButton = document.createElement('button');
  closeButton.innerHTML = '✕';
  closeButton.style.cssText = `
    position: absolute;
    top: -50px;
    right: -50px;
    background: rgba(255, 255, 255, 0.1);
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-radius: 50%;
    width: 40px;
    height: 40px;
    color: #fff;
    font-size: 1.5rem;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
  `;
  closeButton.onmouseenter = () => {
    closeButton.style.background = 'rgba(255, 255, 255, 0.2)';
    closeButton.style.transform = 'scale(1.1)';
  };
  closeButton.onmouseleave = () => {
    closeButton.style.background = 'rgba(255, 255, 255, 0.1)';
    closeButton.style.transform = 'scale(1)';
  };

  // Assemble modal
  imageContainer.appendChild(enlargedContent);
  imageContainer.appendChild(nameLabel);
  imageContainer.appendChild(closeButton);
  modal.appendChild(imageContainer);

  // Close modal on click
  const closeModal = () => {
    modal.style.animation = 'fadeOut 0.3s ease';
    setTimeout(() => modal.remove(), 300);
  };

  modal.onclick = closeModal;
  closeButton.onclick = (e) => {
    e.stopPropagation();
    closeModal();
  };

  // Prevent closing when clicking on image
  imageContainer.onclick = (e) => e.stopPropagation();

  // Add CSS animations if not already present
  if (!document.getElementById('profile-modal-animations')) {
    const style = document.createElement('style');
    style.id = 'profile-modal-animations';
    style.textContent = `
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      @keyframes fadeOut {
        from { opacity: 1; }
        to { opacity: 0; }
      }
      @keyframes zoomIn {
        from { transform: scale(0.5); opacity: 0; }
        to { transform: scale(1); opacity: 1; }
      }
    `;
    document.head.appendChild(style);
  }

  document.body.appendChild(modal);
}

/**
 * Make a profile image element clickable to enlarge
 */
export function makeProfileImageClickable(imageElement, imageUrl, userName, initials) {
  imageElement.style.cursor = 'pointer';
  imageElement.style.transition = 'transform 0.2s ease, box-shadow 0.2s ease';
  
  imageElement.addEventListener('mouseenter', () => {
    imageElement.style.transform = 'scale(1.05)';
    imageElement.style.boxShadow = '0 8px 20px rgba(0, 224, 255, 0.4)';
  });
  
  imageElement.addEventListener('mouseleave', () => {
    imageElement.style.transform = 'scale(1)';
    imageElement.style.boxShadow = '';
  });
  
  imageElement.addEventListener('click', (e) => {
    e.stopPropagation();
    createProfileImageModal(imageUrl, userName, initials);
  });
}
