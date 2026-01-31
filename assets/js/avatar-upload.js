// ================================================================
// AVATAR UPLOAD MODULE
// ================================================================
// Handles avatar image upload to Supabase Storage

(() => {
  'use strict';

  const GUARD = '__CH_AVATAR_UPLOAD_LOADED__';
  if (window[GUARD]) {
    console.log('⚠️ Avatar upload already loaded');
    return;
  }
  window[GUARD] = true;

  const BUCKET_NAME = 'hacksbucket';
  const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
  const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

  // ================================================================
  // UPLOAD AVATAR
  // ================================================================

  async function uploadAvatar(file, userId) {
    console.log('📤 Uploading avatar for user:', userId);

    // Validate file
    const validation = validateFile(file);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    try {
      // Generate unique filename with avatars subfolder
      const fileExt = file.name.split('.').pop();
      const fileName = `avatars/${userId}/${Date.now()}.${fileExt}`;

      // Upload to Supabase Storage
      const { data, error } = await window.supabase.storage
        .from(BUCKET_NAME)
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (error) {
        console.error('Upload error:', error);
        throw new Error(`Upload failed: ${error.message}`);
      }

      console.log('✅ Avatar uploaded:', data.path);

      // Get public URL
      const { data: urlData } = window.supabase.storage
        .from(BUCKET_NAME)
        .getPublicUrl(data.path);

      return {
        path: data.path,
        url: urlData.publicUrl
      };

    } catch (err) {
      console.error('Error uploading avatar:', err);
      throw err;
    }
  }

  // ================================================================
  // DELETE OLD AVATAR
  // ================================================================

  async function deleteOldAvatar(path) {
    if (!path) return;

    try {
      const { error } = await window.supabase.storage
        .from(BUCKET_NAME)
        .remove([path]);

      if (error) {
        console.warn('Error deleting old avatar:', error);
      } else {
        console.log('✅ Old avatar deleted:', path);
      }
    } catch (err) {
      console.warn('Error deleting old avatar:', err);
    }
  }

  // ================================================================
  // VALIDATE FILE
  // ================================================================

  function validateFile(file) {
    if (!file) {
      return { valid: false, error: 'No file selected' };
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return { 
        valid: false, 
        error: 'Invalid file type. Please upload a JPEG, PNG, or WebP image.' 
      };
    }

    if (file.size > MAX_FILE_SIZE) {
      return { 
        valid: false, 
        error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB.` 
      };
    }

    return { valid: true };
  }

  // ================================================================
  // CREATE UPLOAD UI
  // ================================================================

  function createUploadUI(currentAvatarUrl, onUploadSuccess) {
    const container = document.createElement('div');
    container.style.cssText = `
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 1rem;
      padding: 1rem;
      background: rgba(0,224,255,0.05);
      border: 1px solid rgba(0,224,255,0.2);
      border-radius: 12px;
    `;

    // Preview image
    const preview = document.createElement('div');
    preview.style.cssText = `
      width: 120px;
      height: 120px;
      border-radius: 50%;
      overflow: hidden;
      border: 3px solid rgba(0,224,255,0.3);
      background: linear-gradient(135deg, #00e0ff, #0080ff);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 3rem;
      color: white;
      font-weight: bold;
    `;

    if (currentAvatarUrl) {
      preview.innerHTML = `<img src="${currentAvatarUrl}" style="width: 100%; height: 100%; object-fit: cover;">`;
    } else {
      preview.textContent = '?';
    }

    // File input (hidden)
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = ALLOWED_TYPES.join(',');
    fileInput.style.display = 'none';

    // Upload button
    const uploadBtn = document.createElement('button');
    uploadBtn.type = 'button';
    uploadBtn.style.cssText = `
      padding: 0.75rem 1.5rem;
      background: linear-gradient(135deg, rgba(0,224,255,0.3), rgba(0,224,255,0.2));
      border: 1px solid rgba(0,224,255,0.5);
      border-radius: 8px;
      color: #00e0ff;
      cursor: pointer;
      font-weight: 600;
      transition: all 0.2s;
    `;
    uploadBtn.innerHTML = '<i class="fas fa-upload"></i> Upload Avatar';

    uploadBtn.addEventListener('mouseenter', () => {
      uploadBtn.style.background = 'linear-gradient(135deg, rgba(0,224,255,0.4), rgba(0,224,255,0.3))';
    });
    uploadBtn.addEventListener('mouseleave', () => {
      uploadBtn.style.background = 'linear-gradient(135deg, rgba(0,224,255,0.3), rgba(0,224,255,0.2))';
    });

    // Status message
    const status = document.createElement('div');
    status.style.cssText = `
      font-size: 0.85rem;
      color: rgba(255,255,255,0.6);
      text-align: center;
    `;
    status.textContent = 'JPEG, PNG, or WebP (max 5MB)';

    // Click upload button to trigger file input
    uploadBtn.addEventListener('click', () => {
      fileInput.click();
    });

    // Handle file selection
    fileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      // Show preview immediately
      const reader = new FileReader();
      reader.onload = (e) => {
        preview.innerHTML = `<img src="${e.target.result}" style="width: 100%; height: 100%; object-fit: cover;">`;
      };
      reader.readAsDataURL(file);

      // Disable button and show loading
      uploadBtn.disabled = true;
      uploadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';
      status.style.color = '#00e0ff';
      status.textContent = 'Uploading...';

      try {
        // Get current user
        const { data: { user } } = await window.supabase.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        // Get community profile to get old avatar path
        const { data: profile } = await window.supabase
          .from('community')
          .select('avatar_storage_path')
          .eq('user_id', user.id)
          .single();

        // Upload new avatar
        const result = await uploadAvatar(file, user.id);

        // Update profile with new avatar
        const { error: updateError } = await window.supabase
          .from('community')
          .update({ 
            avatar_storage_path: result.path,
            image_url: result.url // Keep image_url for backward compatibility
          })
          .eq('user_id', user.id);

        if (updateError) throw updateError;

        // Delete old avatar if exists
        if (profile?.avatar_storage_path) {
          await deleteOldAvatar(profile.avatar_storage_path);
        }

        // Success!
        status.style.color = '#00ff88';
        status.textContent = '✅ Avatar uploaded successfully!';
        uploadBtn.innerHTML = '<i class="fas fa-check"></i> Upload Complete';
        uploadBtn.style.background = 'linear-gradient(135deg, rgba(0,255,136,0.3), rgba(0,255,136,0.2))';
        uploadBtn.style.borderColor = 'rgba(0,255,136,0.5)';
        uploadBtn.style.color = '#00ff88';

        // Call success callback
        if (onUploadSuccess) {
          onUploadSuccess(result.url);
        }

        // Reset button after 2 seconds
        setTimeout(() => {
          uploadBtn.disabled = false;
          uploadBtn.innerHTML = '<i class="fas fa-upload"></i> Upload Avatar';
          uploadBtn.style.background = 'linear-gradient(135deg, rgba(0,224,255,0.3), rgba(0,224,255,0.2))';
          uploadBtn.style.borderColor = 'rgba(0,224,255,0.5)';
          uploadBtn.style.color = '#00e0ff';
          status.style.color = 'rgba(255,255,255,0.6)';
          status.textContent = 'JPEG, PNG, or WebP (max 5MB)';
        }, 2000);

      } catch (err) {
        console.error('Upload error:', err);
        status.style.color = '#ff6b6b';
        status.textContent = `❌ ${err.message}`;
        uploadBtn.disabled = false;
        uploadBtn.innerHTML = '<i class="fas fa-upload"></i> Upload Avatar';
      }

      // Clear file input
      fileInput.value = '';
    });

    container.appendChild(preview);
    container.appendChild(uploadBtn);
    container.appendChild(status);
    container.appendChild(fileInput);

    return container;
  }

  // ================================================================
  // PUBLIC API
  // ================================================================

  window.AvatarUpload = {
    upload: uploadAvatar,
    deleteOld: deleteOldAvatar,
    validate: validateFile,
    createUI: createUploadUI
  };

  console.log('✅ Avatar upload module loaded');

})();
