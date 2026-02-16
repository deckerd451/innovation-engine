# Innovation Engine - iOS App

Minimal iOS implementation following the V1 architecture.

## Structure

```
InnovationEngine/
├── App/
│   ├── InnovationEngineApp.swift          # Entry point + login
│   └── AppEnvironment.swift               # Supabase client singleton
├── Models/
│   ├── User.swift                         # User model
│   └── Connection.swift                   # Connection model
├── Services/
│   ├── AuthService.swift                  # Authentication
│   ├── ConnectionService.swift            # Connection management
│   └── QRService.swift                    # QR code generation/parsing
├── Views/
│   ├── MainTabView.swift                  # 3-tab container
│   ├── MyQRView.swift                     # Display personal QR
│   ├── ScanView.swift                     # Camera scanner
│   └── NetworkView.swift                  # 2D constellation
└── Supporting/
    └── Info.plist                         # Camera permissions
```

## Setup

1. Open Xcode
2. Create new iOS App project named "InnovationEngine"
3. Replace generated files with the files in this directory
4. Add Supabase Swift package dependency:
   - File > Add Packages
   - URL: `https://github.com/supabase/supabase-swift`
   - Version: Latest
5. Update `AppEnvironment.swift` with your Supabase credentials:
   ```swift
   let supabaseURL = URL(string: "YOUR_SUPABASE_URL")!
   let supabaseKey = "YOUR_SUPABASE_ANON_KEY"
   ```

## Dependencies

- **Supabase Swift**: Authentication and database
- **Native frameworks only**: AVFoundation, CoreImage, SwiftUI

## Features

1. **My QR** - Display personal QR code
2. **Scan** - Scan QR codes to create connections
3. **Network** - View connections as 2D constellation

## Database Tables Used

- `community` (read only) - User profiles
- `connections` (insert + read) - User connections

## No Feature Expansion

This app intentionally does NOT include:
- Messaging
- Notifications
- Profile editing
- Organizations
- Projects
- Gamification
- Analytics
- Settings

## Build & Run

1. Open project in Xcode
2. Select iOS Simulator or device
3. Build and run (Cmd+R)

## Requirements

- iOS 16.0+
- Swift 5.9+
- Xcode 15.0+

## Architecture Documentation

See `/docs/IOS_V1_ARCHITECTURE.md` for complete architecture details.
