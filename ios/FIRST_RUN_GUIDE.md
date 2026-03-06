# iOS App - First Successful Run on Real iPhone

Complete beginner's guide to running the Innovation Engine iOS app on your physical iPhone.

**Sources**: This guide is based on `ios/README.md`, `ios/SETUP_INSTRUCTIONS.md`, `ios/SETUP_CHECKLIST.md`, `ios/GETTING_STARTED.md`, `ios/InnovationEngine/App/AppEnvironment.swift`, `ios/InnovationEngine/Supporting/Info.plist`, and `.env.example`.

---

## Prerequisites

- macOS computer (required for iOS development)
- Xcode 15.0+ installed (full app from Mac App Store, not just command-line tools)
- Apple ID (free account works for device testing)
- Physical iPhone running iOS 16.0 or later
- USB cable to connect iPhone to Mac
- Active Supabase project (same one used by your web app)
- Supabase project URL and anon key

---

## Step-by-Step Setup

### 1. Clone/Locate the Repository

```bash
# If not already cloned
git clone <your-repo-url>
cd innovation-engine
```

### 2. Create Xcode Project

The repository contains source files but no `.xcodeproj` file. You need to create one:

**Open Xcode** → File → New → Project

Configure:
- Platform: iOS
- Template: App
- Product Name: `InnovationEngine`
- Team: Select your Apple ID
- Organization Identifier: `com.yourname` (or any reverse domain)
- Interface: SwiftUI
- Language: Swift
- Storage: None
- Uncheck "Include Tests"

Click **Create** and save outside the repo folder initially.

### 3. Copy Source Files into Xcode Project

```bash
# Navigate to your new Xcode project directory
cd /path/to/InnovationEngine

# Copy all source files from the repo
cp -r /path/to/innovation-engine/ios/InnovationEngine/* InnovationEngine/
```

### 4. Add Files to Xcode

In Xcode:
- Delete the auto-generated `ContentView.swift` and `InnovationEngineApp.swift` files
- Right-click on the `InnovationEngine` folder in the Project Navigator
- Select "Add Files to InnovationEngine"
- Navigate to the copied folders: `App/`, `Models/`, `Services/`, `Views/`, `Supporting/`
- Check "Create groups" (not "Create folder references")
- Ensure "InnovationEngine" target is checked
- Click **Add**

### 5. Add Supabase Swift Package

File → Add Package Dependencies

- Search: `https://github.com/supabase/supabase-swift`
- Dependency Rule: "Up to Next Major Version" starting from `2.0.0`
- Add to Target: InnovationEngine
- Click **Add Package**

Wait for package resolution to complete.

### 6. Configure Supabase Credentials

Open `InnovationEngine/App/AppEnvironment.swift` in Xcode.

Replace the placeholder values:

```swift
let supabaseURL = URL(string: "https://your-project.supabase.co")!
let supabaseKey = "your-anon-key"
```

**Get these values**:
1. Go to [app.supabase.com](https://app.supabase.com)
2. Open your project
3. Settings → API
4. Copy "Project URL" and "anon public" key

### 7. Set Up Code Signing

In Xcode:
- Select the project in the navigator (top-level "InnovationEngine")
- Select the "InnovationEngine" target
- Go to "Signing & Capabilities" tab
- Check "Automatically manage signing"
- Select your Team (your Apple ID)
- Xcode will generate a unique Bundle Identifier like `com.yourname.InnovationEngine`

### 8. Connect Your iPhone

- Connect iPhone to Mac via USB
- On iPhone: Tap "Trust This Computer" if prompted
- Enter iPhone passcode
- In Xcode: Select your iPhone from the device dropdown (top toolbar, next to the scheme)

### 9. Enable Developer Mode on iPhone

iOS 16+ requires Developer Mode:
- On iPhone: Settings → Privacy & Security → Developer Mode
- Toggle ON
- Restart iPhone when prompted
- Confirm "Turn On" after restart

### 10. Build and Run

In Xcode:
- Ensure your iPhone is selected as the destination
- Press **Cmd+R** or click the Play button
- First build may take 2-3 minutes

Xcode will:
- Compile the app
- Install it on your iPhone
- Launch it automatically

### 11. Grant Permissions on iPhone

When the app launches, it will request permissions:
- **Camera**: Tap "Allow" (needed for QR code scanning)
- **Location**: Tap "Allow While Using App" (needed for BLE beacon scanning)
- **Bluetooth**: Tap "Allow" (needed for BLE beacon detection)

### 12. Sign In

Use existing Supabase credentials:
- Email: An account that exists in your Supabase `auth.users` table
- Password: The password for that account

**Note**: The user must also exist in the `community` table with a matching `user_id` field.

---

## Supabase Connection Checklist

### Web App Configuration

Your web app likely has Supabase credentials in:
- `assets/js/supabaseClient.js` (if it exists)
- Or hardcoded in HTML/JS files

The iOS app must use the **same Supabase project**.

### Required Supabase Tables

The iOS app expects these tables to exist:

**Existing tables** (from web app):
- `public.community` - User profiles with `user_id`, `name`, `email`
- `public.connections` - User connections
- `public.presence_sessions` - Presence tracking

**New tables** (for BLE features, optional for basic QR functionality):
- `public.beacons` - iBeacon registry
- `public.interaction_edges` - Suggested connections

### Database Setup for BLE Features (Optional)

If you want Event Mode (BLE passive networking) to work:

```bash
cd ios/migrations

# Run these in order via Supabase Dashboard → SQL Editor
# 1. Copy/paste 001_create_beacons_table.sql
# 2. Copy/paste 002_create_interaction_edges_table.sql
# 3. Copy/paste 003_create_rpc_functions.sql
# 4. (Optional) Copy/paste 004_example_beacon_data.sql
```

Or use `psql`:
```bash
psql -h db.your-project.supabase.co -U postgres -d postgres -f 001_create_beacons_table.sql
# Enter your database password when prompted
```

### Supabase RLS Policies

Ensure Row Level Security policies allow:
- Authenticated users can read from `community`
- Authenticated users can insert/read their own `connections`
- Authenticated users can insert their own `presence_sessions`

### No Redirect URLs Needed

Unlike web OAuth, the iOS app uses email/password authentication directly. No redirect URL configuration is required in Supabase.

---

## Troubleshooting

### 1. "Failed to verify code signature"

**Cause**: Code signing issue with your Apple ID.

**Fix**:
- Xcode → Settings → Accounts → Select your Apple ID → Download Manual Profiles
- Clean build folder: Product → Clean Build Folder (Cmd+Shift+K)
- Rebuild: Cmd+R

### 2. "Untrusted Developer" on iPhone

**Cause**: First time running apps from your Apple ID on this device.

**Fix**:
- On iPhone: Settings → General → VPN & Device Management
- Tap your Apple ID under "Developer App"
- Tap "Trust [Your Apple ID]"
- Confirm "Trust"
- Return to app and launch again

### 3. "Could not find module 'Supabase'"

**Cause**: Swift package not properly added or resolved.

**Fix**:
- File → Packages → Reset Package Caches
- File → Packages → Resolve Package Versions
- Clean build folder (Cmd+Shift+K)
- Rebuild

### 4. "Missing Info.plist"

**Cause**: Info.plist not properly added to target.

**Fix**:
- Select `Info.plist` in Project Navigator
- File Inspector (right panel) → Target Membership
- Check "InnovationEngine"
- Rebuild

### 5. Camera/Location Not Working

**Cause**: Permissions not granted or Info.plist missing usage descriptions.

**Fix**:
- Verify `Info.plist` contains:
  - `NSCameraUsageDescription`
  - `NSLocationWhenInUseUsageDescription`
  - `NSBluetoothAlwaysUsageDescription`
- Delete app from iPhone
- Rebuild and reinstall
- Grant permissions when prompted

### 6. "Error loading user" / Login Fails

**Cause**: User doesn't exist in `community` table or Supabase credentials wrong.

**Fix**:
- Verify Supabase URL and key in `AppEnvironment.swift`
- Check user exists in Supabase:
  ```sql
  SELECT * FROM auth.users WHERE email = 'your-email@example.com';
  SELECT * FROM community WHERE user_id = '<uuid-from-above>';
  ```
- If user missing from `community`, insert:
  ```sql
  INSERT INTO community (user_id, name, email)
  VALUES ('<auth-user-id>', 'Your Name', 'your-email@example.com');
  ```

### 7. "Cannot connect to Supabase"

**Cause**: Network issue or wrong Supabase URL.

**Fix**:
- Verify Supabase URL is correct (no trailing slash)
- Test URL in browser: `https://your-project.supabase.co`
- Check iPhone has internet connection
- Try on WiFi instead of cellular

### 8. App Crashes on Launch

**Cause**: Missing required files or build configuration issue.

**Fix**:
- Check Xcode console for error messages
- Verify all files in `App/`, `Models/`, `Services/`, `Views/` are added to target
- Product → Clean Build Folder
- Delete app from iPhone
- Rebuild

### 9. "Bundle identifier already in use"

**Cause**: Another app with same bundle ID exists.

**Fix**:
- Target → Signing & Capabilities
- Change Bundle Identifier to something unique: `com.yourname.InnovationEngine2`

### 10. QR Scanner Shows Black Screen

**Cause**: Camera permission denied or simulator being used.

**Fix**:
- Camera only works on physical devices (not simulator)
- Settings → Innovation Engine → Camera → Enable
- Restart app

---

## Testing the App

### Basic Functionality Test

1. **Login**: Sign in with Supabase credentials
2. **My QR Tab**: View your personal QR code
3. **Scan Tab**: Point camera at another user's QR code (test with another device)
4. **Network Tab**: View your connections as a 2D constellation
5. **Event Mode Tab**: Toggle Event Mode (requires BLE database setup)

### Two-Device Test

1. Install app on two iPhones
2. Sign in with different accounts on each
3. Device A: Go to "My QR" tab
4. Device B: Go to "Scan" tab
5. Device B: Scan Device A's QR code
6. Both devices: Check "Network" tab for new connection

### BLE Test (Optional)

Requires:
- BLE database migrations run (see Supabase Connection Checklist)
- Physical iBeacon device or beacon simulator app
- Beacon registered in `public.beacons` table

1. Go to "Event Mode" tab
2. Tap "Start Event Mode"
3. Grant location permission
4. Verify beacon appears in "Closest Beacon" section
5. Check Supabase for presence pings:
   ```sql
   SELECT * FROM presence_sessions 
   WHERE context_type = 'beacon' 
   ORDER BY created_at DESC LIMIT 10;
   ```

---

## What Works Without Additional Setup

- ✅ Login/authentication
- ✅ My QR code display
- ✅ QR code scanning
- ✅ Connection creation
- ✅ Network constellation view

## What Requires Database Setup

- ⚠️ Event Mode (BLE beacon scanning) - requires `ios/migrations/` SQL scripts
- ⚠️ Suggested Connections - requires BLE database setup
- ⚠️ "People You Were Near" - requires BLE database setup

---

## Next Steps

Once the app is running:

1. **Test core features**: QR generation, scanning, network view
2. **Set up BLE** (optional): Run database migrations from `ios/migrations/`
3. **Deploy beacons** (optional): Register physical iBeacons in database
4. **Invite users**: Share the app with your community

---

## Additional Resources

- **Complete BLE Guide**: `ios/BLE_PASSIVE_NETWORKING_GUIDE.md`
- **Setup Checklist**: `ios/SETUP_CHECKLIST.md`
- **Architecture**: `ios/README.md`
- **Quick Reference**: `ios/QUICK_REFERENCE.md`

---

## Support

If you encounter issues not covered here:
1. Check Xcode console for error messages
2. Review relevant documentation in `ios/` folder
3. Verify Supabase credentials and database schema
4. Test with a fresh Xcode project if problems persist
