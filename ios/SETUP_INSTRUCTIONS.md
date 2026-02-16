# iOS Setup Instructions

## Quick Start

### Option 1: Create Xcode Project Manually (Recommended)

1. **Open Xcode**
2. **Create New Project**:
   - File > New > Project
   - iOS > App
   - Product Name: `InnovationEngine`
   - Interface: SwiftUI
   - Language: Swift
   - Click Create

3. **Copy Source Files**:
   ```bash
   # Navigate to your Xcode project directory
   cd /path/to/InnovationEngine

   # Copy all source files from this repo
   cp -r /path/to/innovation-engine/ios/InnovationEngine/* InnovationEngine/
   ```

4. **Add Files to Xcode**:
   - Delete auto-generated `ContentView.swift` and `InnovationEngineApp.swift`
   - Right-click on project in navigator
   - Add Files to "InnovationEngine"
   - Select all folders from the copied directory
   - Check "Create groups"
   - Click Add

5. **Add Supabase Package**:
   - File > Add Packages
   - Search: `https://github.com/supabase/supabase-swift`
   - Dependency Rule: Up to Next Major Version (2.0.0)
   - Add to Target: InnovationEngine
   - Click Add Package

6. **Configure Info.plist**:
   - Select `Info.plist` in Supporting folder
   - Ensure camera usage description is present

7. **Update Supabase Credentials**:
   - Open `App/AppEnvironment.swift`
   - Replace placeholder URL and key with your Supabase project credentials:
     ```swift
     let supabaseURL = URL(string: "https://your-project.supabase.co")!
     let supabaseKey = "your-anon-key"
     ```

8. **Build and Run**:
   - Select simulator or device
   - Press Cmd+R

---

## Option 2: Using SPM (Swift Package Manager)

If you prefer working with SPM:

```bash
cd ios
swift build
```

Note: This creates a library, not a runnable app. You'll still need Xcode for iOS app development.

---

## Getting Supabase Credentials

1. Go to [supabase.com](https://supabase.com)
2. Open your project
3. Go to Settings > API
4. Copy:
   - Project URL (e.g., `https://abcdefgh.supabase.co`)
   - `anon` `public` key

---

## Troubleshooting

### Camera not working in simulator
- Camera scanning only works on physical devices
- Use a real iPhone/iPad for testing QR scanning

### Build fails with Supabase errors
- Ensure Supabase Swift package is added correctly
- Try cleaning build folder: Product > Clean Build Folder
- Delete derived data: Xcode > Preferences > Locations > Derived Data

### Auth errors
- Verify Supabase URL and key are correct
- Check that user exists in `community` table with matching `user_id`

### Connection creation fails
- Ensure `connections` table exists
- Check RLS policies allow authenticated users to insert
- Verify foreign key constraints on `user_id` and `connected_user_id`

---

## File Structure in Xcode

After setup, your Xcode project should look like:

```
InnovationEngine/
├── InnovationEngine/
│   ├── App/
│   │   ├── InnovationEngineApp.swift
│   │   └── AppEnvironment.swift
│   ├── Models/
│   │   ├── User.swift
│   │   └── Connection.swift
│   ├── Services/
│   │   ├── AuthService.swift
│   │   ├── ConnectionService.swift
│   │   └── QRService.swift
│   ├── Views/
│   │   ├── MainTabView.swift
│   │   ├── MyQRView.swift
│   │   ├── ScanView.swift
│   │   └── NetworkView.swift
│   └── Supporting/
│       └── Info.plist
└── InnovationEngine.xcodeproj
```

---

## Next Steps

1. **Test on device** - Connect iPhone via USB
2. **Sign in** - Use existing Supabase credentials
3. **Generate QR** - View your personal QR code
4. **Scan** - Test with another device
5. **View network** - Check constellation view

---

## No Additional Setup Required

This is the entire app. No:
- CocoaPods
- Carthage
- Firebase
- Analytics SDKs
- Push notification setup
- Deep linking
- App Store Connect configuration (until ready to ship)

Just Supabase Swift client and native iOS frameworks.
