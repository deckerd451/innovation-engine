# Profile Photo Debug Guide

## Current Status

The profile photo feature has been fully wired with comprehensive debug logging. If the feature is not working, the logs will show exactly where the chain breaks.

## Debug Log Flow

### Expected Log Sequence for Add/Change Photo

```
[EditProfilePhoto] 🎯 Avatar tapped
[EditProfilePhoto]    Current imageUrl: <url or nil>
[EditProfilePhoto] 🔄 selectedPhotoItem onChange triggered (outer)
[EditProfilePhoto]    Old: nil
[EditProfilePhoto]    New: exists
[EditProfilePhoto] ✅ Starting upload task
[EditProfilePhoto] 📤 uploadPhoto() called
[EditProfilePhoto]    User ID: <uuid>
[EditProfilePhoto] 📥 Loading raw image data from picker...
[EditProfilePhoto] ✅ Raw data loaded: <bytes> bytes
[EditProfilePhoto] 🔄 Processing image...
[ProfileImage] 📸 Processing selected image
[ProfileImage]    Original size: <bytes> bytes
[ProfileImage]    Processed size: <bytes> bytes
[ProfileImage]    Dimensions: <width>x<height>
[EditProfilePhoto] ✅ Image processed: <bytes> bytes
[EditProfilePhoto] ⬆️ Uploading to storage...
[ProfileImage] ⬆️ Uploading profile image
[ProfileImage]    Community ID: <uuid>
[ProfileImage]    Storage path: avatars/<uuid>/<timestamp>.jpg
[ProfileImage] ✅ Upload successful
[ProfileImage]    Public URL: <url>
[ProfileImage] ✅ Community profile updated
[EditProfilePhoto] ✅ Upload successful!
[EditProfilePhoto]    Image URL: <url>
[EditProfilePhoto]    Image Path: avatars/<uuid>/<timestamp>.jpg
[EditProfilePhoto] 🔄 Refreshing profile...
[Profile] 🔍 Starting profile resolution
[Profile]    Auth user ID: <uuid>
[Profile] ✅ Profile found: <uuid>
[EditProfilePhoto] ✅ Profile refresh complete
[EditProfilePhoto] ✅ Upload flow complete - UI updated
```

### Expected Log Sequence for Remove Photo

```
[EditProfilePhoto] 🎯 Avatar tapped
[EditProfilePhoto]    Current imageUrl: <url>
[EditProfilePhoto] 🗑️ Remove Photo tapped
[EditProfilePhoto] 🗑️ removePhoto() called
[EditProfilePhoto]    User ID: <uuid>
[EditProfilePhoto]    Current imagePath: avatars/<uuid>/<timestamp>.jpg
[EditProfilePhoto] 🔄 Calling removeProfileImage service...
[ProfileImage] 🗑️ Removing profile image
[ProfileImage]    Community ID: <uuid>
[ProfileImage] ✅ Database fields cleared
[ProfileImage] ✅ Storage file deleted: avatars/<uuid>/<timestamp>.jpg
[EditProfilePhoto] ✅ Remove successful!
[EditProfilePhoto] 🔄 Refreshing profile...
[Profile] 🔍 Starting profile resolution
[Profile]    Auth user ID: <uuid>
[Profile] ✅ Profile found: <uuid>
[EditProfilePhoto] ✅ Profile refresh complete
[EditProfilePhoto] ✅ Remove flow complete - UI updated
```

## Troubleshooting

### Issue: Avatar tap does nothing

**Check logs for:**
```
[EditProfilePhoto] 🎯 Avatar tapped
```

**If missing:**
- Button action not firing
- Check if button is disabled (isUploadingPhoto = true)
- Check if view is properly rendered

**If present but dialog doesn't show:**
- Check `showingPhotoOptions` state
- Check confirmationDialog modifier

### Issue: PhotosPicker doesn't open

**Check logs for:**
```
[EditProfilePhoto] 📸 PhotosPicker selection changed
```

**If missing:**
- PhotosPicker not properly embedded in confirmationDialog
- Check PhotosUI import
- Check device photo permissions

### Issue: Photo selection doesn't trigger upload

**Check logs for:**
```
[EditProfilePhoto] 🔄 selectedPhotoItem onChange triggered (outer)
[EditProfilePhoto]    New: exists
[EditProfilePhoto] ✅ Starting upload task
```

**If missing:**
- onChange not firing
- Check if selectedPhotoItem is actually changing
- Check if Task is being created

**If "New: nil":**
- PhotosPicker returned nil selection
- User may have cancelled
- Check picker configuration

### Issue: Upload starts but fails

**Check logs for error:**
```
[EditProfilePhoto] ❌ Upload error: <error>
```

**Common errors:**

**"Failed to load transferable data"**
- PhotosPickerItem.loadTransferable failed
- Check photo permissions
- Check photo format compatibility

**"Invalid image data"**
- UIImage(data:) returned nil
- Corrupted or unsupported image format

**"Compression failed"**
- jpegData(compressionQuality:) returned nil
- Rare, usually indicates memory issue

**Storage upload errors:**
- Check Supabase connection
- Check storage bucket permissions
- Check network connectivity

**Database update errors:**
- Check RLS policies on community table
- Check user has permission to update their row

### Issue: Upload succeeds but UI doesn't update

**Check logs for:**
```
[EditProfilePhoto] ✅ Upload successful!
[EditProfilePhoto] 🔄 Refreshing profile...
[EditProfilePhoto] ✅ Profile refresh complete
```

**If refresh doesn't complete:**
- AuthService.refreshProfile() failed
- Check profile resolution logs
- Check if currentUser is being updated

**If refresh completes but UI doesn't change:**
- displayUser computed property not updating
- AsyncImage not reloading
- Check if imageUrl actually changed in database

### Issue: Remove doesn't work

**Check logs for:**
```
[EditProfilePhoto] 🗑️ Remove Photo tapped
[EditProfilePhoto] 🗑️ removePhoto() called
```

**If missing:**
- Button not wired correctly
- Check if button appears (only when imageUrl exists)

**If error occurs:**
```
[EditProfilePhoto] ❌ Remove error: <error>
```

**Common errors:**
- Database update failed (check RLS)
- Storage deletion failed (non-fatal, should still clear DB)

## Manual Testing Checklist

### Test 1: Add Photo (New User)
1. Tap avatar (should show camera icon)
2. Verify confirmation dialog appears
3. Tap "Add Photo"
4. Verify PhotosPicker opens
5. Select an image
6. Watch logs for complete flow
7. Verify avatar updates to show image
8. Verify badge changes to pencil icon

### Test 2: Change Photo (Existing Photo)
1. Tap avatar (should show pencil icon)
2. Verify confirmation dialog shows "Change Photo" and "Remove Photo"
3. Tap "Change Photo"
4. Select different image
5. Watch logs for complete flow
6. Verify avatar updates to new image

### Test 3: Remove Photo
1. Tap avatar (must have existing photo)
2. Tap "Remove Photo"
3. Watch logs for complete flow
4. Verify avatar changes to initials placeholder
5. Verify badge changes to camera icon

### Test 4: Cancel Operations
1. Tap avatar
2. Tap "Cancel"
3. Verify dialog dismisses
4. Verify no upload triggered

### Test 5: Error Handling
1. Turn off network
2. Try to upload photo
3. Verify error message appears below avatar
4. Verify avatar remains unchanged
5. Turn on network
6. Retry upload
7. Verify success

### Test 6: Upload Progress
1. Start photo upload
2. Verify "Uploading..." appears below avatar
3. Verify avatar button is disabled
4. Verify progress completes
5. Verify button re-enables

## Quick Fixes

### If PhotosPicker never opens:
- Check Info.plist for photo library usage description
- Check device photo permissions in Settings
- Try on real device (simulator sometimes has issues)

### If upload always fails:
- Check Supabase URL and anon key
- Check storage bucket exists and is named "hacksbucket"
- Check RLS policies allow INSERT on storage.objects
- Check RLS policies allow UPDATE on community table

### If UI never updates:
- Check AuthService.refreshProfile() implementation
- Check if @ObservedObject authService is properly connected
- Check if displayUser computed property is correct
- Try force-refreshing by leaving and returning to screen

## Success Criteria

✅ Avatar tap opens confirmation dialog
✅ Add/Change Photo opens PhotosPicker
✅ Photo selection triggers upload
✅ Upload progress shows
✅ Upload completes successfully
✅ Avatar updates immediately
✅ Remove Photo clears avatar
✅ Errors are visible to user
✅ All steps logged clearly
✅ No silent failures
