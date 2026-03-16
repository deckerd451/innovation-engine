# Profile Photo Picker Fix

## Problem

The PhotosPicker was embedded inside the confirmationDialog, which prevented it from working properly. When users selected "Add Photo" or "Change Photo", the picker would not launch.

## Root Cause

SwiftUI's PhotosPicker cannot be reliably presented from within a confirmationDialog. The dialog would show the button, but tapping it would not trigger the system photo picker.

## Solution

Refactored the photo picker flow to use the proper SwiftUI pattern:

### 1. Added New State
```swift
@State private var showingPhotoPicker = false
```

### 2. Moved PhotosPicker to Main View
Attached `.photosPicker()` modifier to the NavigationView level:
```swift
.photosPicker(
    isPresented: $showingPhotoPicker,
    selection: $selectedPhotoItem,
    matching: .images
)
```

### 3. Updated Confirmation Dialog
Changed from embedding PhotosPicker to using plain buttons:

**Before:**
```swift
.confirmationDialog("Profile Photo", isPresented: $showingPhotoOptions) {
    PhotosPicker(selection: $selectedPhotoItem, matching: .images) {
        Text(displayUser.imageUrl != nil ? "Change Photo" : "Add Photo")
    }
    // ...
}
```

**After:**
```swift
.confirmationDialog("Profile Photo", isPresented: $showingPhotoOptions) {
    Button(displayUser.imageUrl != nil ? "Change Photo" : "Add Photo") {
        showingPhotoPicker = true
    }
    // ...
}
```

### 4. Preserved Upload Flow
The `.onChange(of: selectedPhotoItem)` handler remains at the main view level and triggers the existing upload pipeline:
1. Load raw data from PhotosPickerItem
2. Process image (resize/compress)
3. Upload to Supabase Storage
4. Update database
5. Refresh profile

## Flow Diagram

### New Flow
```
User taps avatar
  ↓
showingPhotoOptions = true
  ↓
Confirmation dialog appears
  ↓
User taps "Add/Change Photo"
  ↓
showingPhotoPicker = true
  ↓
System photo picker launches (photosPicker modifier)
  ↓
User selects photo
  ↓
selectedPhotoItem changes
  ↓
onChange handler triggers
  ↓
uploadPhoto() called
  ↓
Upload pipeline executes
  ↓
Profile refreshes
  ↓
Avatar updates
```

## Debug Logs

The flow now produces these logs:

```
[EditProfilePhoto] 🎯 Avatar tapped
[EditProfilePhoto]    Current imageUrl: nil
[EditProfilePhoto] 📸 Add Photo selected
[EditProfilePhoto] 🔄 Setting showingPhotoPicker = true
[EditProfilePhoto] 🔄 selectedPhotoItem onChange triggered
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
[EditProfilePhoto] ✅ Image processed: <bytes> bytes
[EditProfilePhoto] ⬆️ Uploading to storage...
[ProfileImage] ⬆️ Uploading profile image
[ProfileImage] ✅ Upload successful
[EditProfilePhoto] ✅ Upload successful!
[EditProfilePhoto] 🔄 Refreshing profile...
[EditProfilePhoto] ✅ Profile refresh complete
[EditProfilePhoto] ✅ Upload flow complete - UI updated
```

## Changes Made

### MyQRView.swift

1. **Added state:**
   - `@State private var showingPhotoPicker = false`

2. **Moved photosPicker modifier:**
   - From: Inside confirmationDialog (broken)
   - To: NavigationView level (working)

3. **Updated confirmationDialog:**
   - Replaced PhotosPicker with plain Button
   - Button sets `showingPhotoPicker = true`

4. **Moved onChange handler:**
   - From: Attached to confirmationDialog
   - To: Attached to NavigationView (after photosPicker)

5. **Preserved:**
   - All upload logic
   - All remove logic
   - All error handling
   - All loading states
   - All debug logging

## Testing

### Test 1: Add Photo
1. Tap avatar (camera icon)
2. Confirmation dialog appears
3. Tap "Add Photo"
4. System photo picker launches ✅
5. Select photo
6. Upload completes
7. Avatar shows image

### Test 2: Change Photo
1. Tap avatar (pencil icon)
2. Confirmation dialog appears
3. Tap "Change Photo"
4. System photo picker launches ✅
5. Select different photo
6. Upload completes
7. Avatar updates

### Test 3: Remove Photo
1. Tap avatar (pencil icon)
2. Confirmation dialog appears
3. Tap "Remove Photo"
4. Photo removed
5. Avatar shows initials

### Test 4: Cancel
1. Tap avatar
2. Confirmation dialog appears
3. Tap "Cancel"
4. Dialog dismisses
5. No action taken

## Why This Works

SwiftUI's `.photosPicker()` modifier must be attached to a stable view in the hierarchy, not to a transient dialog. By moving it to the NavigationView level and controlling it with a boolean state, the picker can be properly presented by the system.

The confirmationDialog now acts as a simple menu to set the `showingPhotoPicker` state, which then triggers the actual picker presentation through the modifier.

## Benefits

✅ Photo picker actually launches
✅ Clean separation of concerns
✅ Follows SwiftUI best practices
✅ Maintains all existing functionality
✅ Preserves error handling
✅ Keeps comprehensive logging
✅ No breaking changes to other features
