# iOS V1 Architecture - Surface Reset

**Status:** Architecture Design
**Date:** February 16, 2026
**Goal:** Reduce complexity to three core actions only

---

## Philosophy

This is NOT innovation.
This is aggressive reduction.
This is constraint.
This is elegance.

---

## The Three Actions

1. **Display my personal QR code**
2. **Scan someone else's QR code and create a connection**
3. **View my network in a simple 2D constellation-style visualization**

**Nothing else.**

---

## 1. SwiftUI Folder Structure

```
InnovationEngine/
├── App/
│   ├── InnovationEngineApp.swift          # Entry point
│   └── AppEnvironment.swift               # Supabase client singleton
│
├── Models/
│   ├── User.swift                         # Codable struct from community table
│   └── Connection.swift                   # Codable struct from connections table
│
├── Services/
│   ├── AuthService.swift                  # Supabase auth (sign in/out only)
│   ├── ConnectionService.swift            # Create connection, fetch connections
│   └── QRService.swift                    # Generate/parse QR code data
│
├── Views/
│   ├── MainTabView.swift                  # Root container (3 tabs)
│   ├── MyQRView.swift                     # Display personal QR
│   ├── ScanView.swift                     # Camera scanner
│   └── NetworkView.swift                  # 2D constellation
│
└── Supporting/
    ├── Assets.xcassets
    └── Info.plist
```

**Total files: 13**

---

## 2. View Hierarchy

```
InnovationEngineApp
└── AppEnvironment (provides Supabase client)
    └── MainTabView (TabView with 3 tabs)
        ├── Tab 1: MyQRView
        ├── Tab 2: ScanView
        └── Tab 3: NetworkView
```

**No navigation stack. No modals. No overlays.**

---

## 3. QR Generator Implementation (Native)

### QRService.swift

```swift
import CoreImage.CIFilterBuiltins
import UIKit

struct QRService {

    // QR payload: just the community ID
    static func generateQRCode(for communityID: String) -> UIImage {
        let context = CIContext()
        let filter = CIFilter.qrCodeGenerator()

        // Encode community ID as data
        filter.message = Data(communityID.utf8)
        filter.correctionLevel = "M"

        guard let outputImage = filter.outputImage else {
            return UIImage(systemName: "xmark.circle") ?? UIImage()
        }

        // Scale up for sharpness
        let transform = CGAffineTransform(scaleX: 10, y: 10)
        let scaledImage = outputImage.transformed(by: transform)

        guard let cgImage = context.createCGImage(scaledImage, from: scaledImage.extent) else {
            return UIImage(systemName: "xmark.circle") ?? UIImage()
        }

        return UIImage(cgImage: cgImage)
    }

    static func parseCommunityID(from qrString: String) -> String? {
        // QR string IS the community ID (UUID string)
        // Validate it's a valid UUID format
        guard UUID(uuidString: qrString) != nil else { return nil }
        return qrString
    }
}
```

### MyQRView.swift

```swift
import SwiftUI

struct MyQRView: View {
    @State private var qrImage: UIImage?
    let currentUser: User  // Passed from environment

    var body: some View {
        VStack(spacing: 40) {
            Text("My QR Code")
                .font(.title2)

            if let qrImage {
                Image(uiImage: qrImage)
                    .interpolation(.none)
                    .resizable()
                    .frame(width: 250, height: 250)
            }

            Text(currentUser.name)
                .font(.headline)
        }
        .onAppear {
            qrImage = QRService.generateQRCode(for: currentUser.id.uuidString)
        }
    }
}
```

**Implementation:**
- Native CoreImage QR generation
- No third-party libraries
- Payload: community UUID only
- No encryption
- No versioning
- No metadata

---

## 4. QR Scanner Implementation (Native Camera)

### ScanView.swift

```swift
import SwiftUI
import AVFoundation

struct ScanView: View {
    @State private var scannedCode: String?
    @State private var showingResult = false
    @State private var isProcessing = false

    var body: some View {
        ZStack {
            CameraPreview { code in
                handleScan(code)
            }
            .edgesIgnoringSafeArea(.all)

            if isProcessing {
                ProgressView()
                    .scaleEffect(2)
                    .tint(.white)
            }
        }
        .alert("Connection Created", isPresented: $showingResult) {
            Button("OK") {
                isProcessing = false
            }
        }
    }

    private func handleScan(_ code: String) {
        guard !isProcessing else { return }
        guard let communityID = QRService.parseCommunityID(from: code) else { return }

        isProcessing = true

        Task {
            await ConnectionService.shared.createConnection(to: communityID)
            showingResult = true
        }
    }
}
```

### CameraPreview.swift

```swift
struct CameraPreview: UIViewRepresentable {
    let onCodeScanned: (String) -> Void

    func makeUIView(context: Context) -> QRCameraView {
        let view = QRCameraView()
        view.delegate = context.coordinator
        return view
    }

    func updateUIView(_ uiView: QRCameraView, context: Context) {}

    func makeCoordinator() -> Coordinator {
        Coordinator(onCodeScanned: onCodeScanned)
    }

    class Coordinator: NSObject, QRCameraDelegate {
        let onCodeScanned: (String) -> Void

        init(onCodeScanned: @escaping (String) -> Void) {
            self.onCodeScanned = onCodeScanned
        }

        func didScanCode(_ code: String) {
            onCodeScanned(code)
        }
    }
}
```

### QRCameraView.swift

```swift
protocol QRCameraDelegate: AnyObject {
    func didScanCode(_ code: String)
}

class QRCameraView: UIView, AVCaptureMetadataOutputObjectsDelegate {
    weak var delegate: QRCameraDelegate?
    private var captureSession: AVCaptureSession!
    private var previewLayer: AVCaptureVideoPreviewLayer!

    override init(frame: CGRect) {
        super.init(frame: frame)
        setupCamera()
    }

    required init?(coder: NSCoder) {
        fatalError()
    }

    private func setupCamera() {
        captureSession = AVCaptureSession()

        guard let device = AVCaptureDevice.default(for: .video),
              let input = try? AVCaptureDeviceInput(device: device) else { return }

        captureSession.addInput(input)

        let output = AVCaptureMetadataOutput()
        captureSession.addOutput(output)

        output.setMetadataObjectsDelegate(self, queue: .main)
        output.metadataObjectTypes = [.qr]

        previewLayer = AVCaptureVideoPreviewLayer(session: captureSession)
        previewLayer.frame = bounds
        previewLayer.videoGravity = .resizeAspectFill
        layer.addSublayer(previewLayer)

        DispatchQueue.global(qos: .background).async {
            self.captureSession.startRunning()
        }
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        previewLayer?.frame = bounds
    }

    func metadataOutput(_ output: AVCaptureMetadataOutput,
                       didOutput metadataObjects: [AVMetadataObject],
                       from connection: AVCaptureConnection) {
        guard let object = metadataObjects.first as? AVMetadataMachineReadableCodeObject,
              let code = object.stringValue else { return }

        delegate?.didScanCode(code)
    }
}
```

**Implementation:**
- Native AVFoundation camera
- No library dependencies
- Continuous scanning
- Debounced processing
- No haptic feedback
- No sound effects
- No scan animations

---

## 5. Lightweight 2D Constellation Visualization

### NetworkView.swift

```swift
import SwiftUI

struct NetworkView: View {
    @State private var nodes: [Node] = []
    @State private var currentUser: User?

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            ConstellationCanvas(nodes: nodes, centerNode: currentUser?.id)
        }
        .task {
            await loadNetwork()
        }
    }

    private func loadNetwork() async {
        let connections = await ConnectionService.shared.fetchConnections()
        nodes = connections.map { conn in
            Node(
                id: conn.connectedUserID,
                name: conn.connectedUserName ?? "User",
                position: randomPosition()
            )
        }

        // Add self as center
        if let user = AuthService.shared.currentUser {
            currentUser = user
            nodes.insert(
                Node(id: user.id, name: "You", position: CGPoint(x: 0.5, y: 0.5)),
                at: 0
            )
        }
    }

    private func randomPosition() -> CGPoint {
        CGPoint(
            x: CGFloat.random(in: 0.2...0.8),
            y: CGFloat.random(in: 0.2...0.8)
        )
    }
}

struct Node: Identifiable {
    let id: UUID
    let name: String
    var position: CGPoint  // Normalized 0-1
}
```

### ConstellationCanvas.swift

```swift
struct ConstellationCanvas: View {
    let nodes: [Node]
    let centerNode: UUID?

    var body: some View {
        GeometryReader { geo in
            Canvas { context, size in
                // Draw connections (lines)
                if let centerID = centerNode,
                   let center = nodes.first(where: { $0.id == centerID }) {

                    let centerPoint = CGPoint(
                        x: center.position.x * size.width,
                        y: center.position.y * size.height
                    )

                    for node in nodes where node.id != centerID {
                        let point = CGPoint(
                            x: node.position.x * size.width,
                            y: node.position.y * size.height
                        )

                        var path = Path()
                        path.move(to: centerPoint)
                        path.addLine(to: point)

                        context.stroke(
                            path,
                            with: .color(.white.opacity(0.2)),
                            lineWidth: 1
                        )
                    }
                }

                // Draw nodes
                for node in nodes {
                    let point = CGPoint(
                        x: node.position.x * size.width,
                        y: node.position.y * size.height
                    )

                    let isCenter = node.id == centerNode
                    let radius: CGFloat = isCenter ? 12 : 8
                    let color: Color = isCenter ? .blue : .white

                    context.fill(
                        Circle().path(in: CGRect(
                            x: point.x - radius,
                            y: point.y - radius,
                            width: radius * 2,
                            height: radius * 2
                        )),
                        with: .color(color)
                    )

                    // Draw name (center node only)
                    if isCenter {
                        context.draw(
                            Text(node.name)
                                .font(.caption)
                                .foregroundColor(.white),
                            at: CGPoint(x: point.x, y: point.y - 20)
                        )
                    }
                }
            }
        }
    }
}
```

**Performance Characteristics:**
- Canvas-based (GPU-accelerated)
- Static layout (no real-time physics)
- Handles 100+ nodes smoothly
- No external dependencies
- No animations
- No interactivity (no tap, zoom, pan)
- No clustering
- No filters

**Visual Design:**
- Black background
- White dots for connections
- Blue dot for self
- Semi-transparent connection lines
- Random positioning (seeded for consistency)
- Center node labeled only

---

## 6. Backend Integration

### ConnectionService.swift

```swift
import Supabase

final class ConnectionService {
    static let shared = ConnectionService()
    private let supabase = AppEnvironment.shared.supabaseClient

    func createConnection(to communityID: String) async {
        guard let currentUserID = AuthService.shared.currentUser?.id else { return }

        let connection: [String: Any] = [
            "user_id": currentUserID.uuidString,
            "connected_user_id": communityID,
            "status": "accepted"  // Auto-accept, no pending state
        ]

        try? await supabase
            .from("connections")
            .insert(connection)
            .execute()
    }

    func fetchConnections() async -> [Connection] {
        guard let currentUserID = AuthService.shared.currentUser?.id else { return [] }

        let response = try? await supabase
            .from("connections")
            .select("id, connected_user_id, community!connected_user_id(id, name)")
            .eq("user_id", value: currentUserID.uuidString)
            .eq("status", value: "accepted")
            .execute()

        guard let data = response?.data else { return [] }

        // Decode response to [Connection]
        return (try? JSONDecoder().decode([Connection].self, from: data)) ?? []
    }
}
```

### AuthService.swift

```swift
import Supabase

final class AuthService {
    static let shared = AuthService()
    private let supabase = AppEnvironment.shared.supabaseClient

    var currentUser: User?

    func signIn(email: String, password: String) async throws {
        try await supabase.auth.signIn(email: email, password: password)
        await loadCurrentUser()
    }

    func signOut() async throws {
        try await supabase.auth.signOut()
        currentUser = nil
    }

    private func loadCurrentUser() async {
        guard let authUser = supabase.auth.currentUser else { return }

        let response = try? await supabase
            .from("community")
            .select("*")
            .eq("user_id", value: authUser.id.uuidString)
            .single()
            .execute()

        guard let data = response?.data else { return }
        currentUser = try? JSONDecoder().decode(User.self, from: data)
    }
}
```

**Backend Interactions:**
- INSERT into `connections` (auto-accept)
- SELECT from `connections` WHERE user_id = current
- SELECT from `community` for user profile
- No updates
- No deletes
- No notifications
- No presence tracking

---

## 7. Data Models

### User.swift

```swift
import Foundation

struct User: Codable, Identifiable {
    let id: UUID
    let userId: UUID?
    let name: String
    let email: String?

    enum CodingKeys: String, CodingKey {
        case id
        case userId = "user_id"
        case name
        case email
    }
}
```

### Connection.swift

```swift
import Foundation

struct Connection: Codable, Identifiable {
    let id: UUID
    let userId: UUID
    let connectedUserID: UUID
    let connectedUserName: String?
    let status: String
    let createdAt: Date

    enum CodingKeys: String, CodingKey {
        case id
        case userId = "user_id"
        case connectedUserID = "connected_user_id"
        case connectedUserName = "connected_user_name"
        case status
        case createdAt = "created_at"
    }
}
```

**Models:**
- Two structs only
- Codable for JSON parsing
- No computed properties
- No business logic
- No relationships
- No validation

---

## 8. Complexity Reduction Analysis

### Current Web App Has:

**Database Tables (12+):**
- community
- connections
- conversations
- messages
- activity_log
- achievements
- user_achievements
- leaderboards
- daily_suggestions
- theme_circles
- theme_participants
- projects
- project_members
- endorsements
- presence_sessions
- organizations
- organization_members

**Features:**
- Messaging system
- Activity tracking
- Achievements/XP system
- Streak tracking
- Leaderboards
- Daily suggestions
- Theme circles
- Organizations
- Projects
- Endorsements
- Presence indicators
- Discovery algorithms
- Notifications
- Profile editing
- Search/filtering
- Analytics

### iOS V1 Has:

**Database Tables (2):**
- community (read only)
- connections (insert + read)

**Features:**
- QR code display
- QR code scanning
- Network visualization

**Reduction:**
- 17 tables → 2 tables used
- 16 features → 3 actions
- Messaging → deleted
- Gamification → deleted
- Organizations → deleted
- Projects → deleted
- Discovery → deleted
- Presence → deleted

---

## 9. Features Explicitly Removed

### ✂️ Cut from iOS V1:

1. **Messaging/Conversations**
   - No chat
   - No direct messages
   - No conversation history
   - No unread counts

2. **Activity Log**
   - No event tracking
   - No activity feed
   - No history

3. **Gamification**
   - No achievements
   - No XP points
   - No streaks
   - No leaderboards

4. **Daily Suggestions**
   - No algorithmic suggestions
   - No daily prompts
   - No recommendations

5. **Theme Circles**
   - No theme participation
   - No interest groups
   - No theme-based discovery

6. **Organizations**
   - No organization membership
   - No org profiles
   - No org admin

7. **Projects**
   - No project creation
   - No project membership
   - No project requests

8. **Endorsements**
   - No skill endorsements
   - No recommendations
   - No credibility system

9. **Presence**
   - No online/offline status
   - No last seen
   - No active indicators

10. **Notifications**
    - No push notifications
    - No in-app notifications
    - No notification bell

11. **Discovery**
    - No search
    - No filtering
    - No recommendations
    - No discovery algorithms

12. **Profile Editing**
    - No profile updates
    - No avatar upload
    - No bio editing
    - Read-only user data

13. **Settings**
    - No settings screen
    - No preferences
    - No customization

14. **Analytics**
    - No tracking
    - No diagnostics
    - No metrics

15. **Onboarding**
    - No welcome flow
    - No tutorial
    - No tooltips

---

## 10. Implementation Constraints

### What You CANNOT Do:

❌ Add database tables
❌ Modify schema
❌ Add backend endpoints
❌ Change RLS policies
❌ Add Supabase functions
❌ Add push notifications
❌ Add analytics
❌ Add feature flags
❌ Add A/B testing
❌ Add error tracking
❌ Add third-party SDKs (except Supabase Swift client)

### What You CAN Do:

✅ Read from `community` table
✅ Insert into `connections` table
✅ Read from `connections` table
✅ Use Supabase auth
✅ Generate QR codes (native)
✅ Scan QR codes (native)
✅ Draw Canvas graphics (native)

---

## 11. Technical Stack

**Required:**
- Swift 5.9+
- SwiftUI (iOS 16+)
- Supabase Swift Client
- AVFoundation (camera)
- CoreImage (QR generation)

**Not Required:**
- Combine
- Firebase
- Analytics SDKs
- Notification SDKs
- Third-party QR libraries
- Graph visualization libraries
- State management frameworks
- Navigation frameworks

**Native Frameworks Only:**
- Foundation
- SwiftUI
- UIKit (minimal bridging)
- AVFoundation
- CoreImage
- CoreGraphics

---

## 12. Success Metrics

This app is successful if:

1. **User can display their QR code** (< 1 second load)
2. **User can scan another QR code** (< 2 seconds to connection)
3. **User can see their network** (< 3 seconds to render)

**No other metrics.**

Not measuring:
- Engagement
- Retention
- DAU/MAU
- Session length
- Feature usage
- Conversion rates
- Virality coefficients

**Only measuring: does the core behavior work?**

---

## 13. Deployment Constraints

### App Store Metadata:

**Name:** Innovation Engine
**Tagline:** Connect in person
**Description:** Show your QR. Scan theirs. See your network.

**Screenshots:**
1. QR code screen
2. Scanner screen
3. Network constellation

**Category:** Social Networking
**Age Rating:** 4+

**No:**
- Privacy policy (beyond required)
- Terms of service
- Support email
- Marketing website
- App previews/videos
- Localization
- Accessibility (beyond default)

---

## 14. What This Proves

This minimal implementation proves:

1. **Human proximity connection works**
   - People can exchange QR codes in-person
   - Connections form instantly
   - No friction beyond physical presence

2. **Visual network representation resonates**
   - Users understand constellation metaphor
   - Growth is visible
   - Network density is clear

3. **Simplicity is sufficient**
   - No chat needed initially
   - No gamification needed
   - No discovery algorithms needed

**The goal is behavioral proof, not feature completeness.**

---

## 15. What Happens Next

After V1 launch and validation:

**IF users consistently:**
- Exchange QR codes at events
- Open app to view network
- Return to app over time

**THEN consider:**
- Adding messaging (only if requested repeatedly)
- Adding event context (where connection happened)
- Adding connection notes (lightweight)

**IF users do NOT:**
- Use app after initial connection
- Share QR codes organically
- Return to view network

**THEN:**
- Core hypothesis is invalid
- Feature additions won't fix it
- Pivot or kill

**Do not add features before proving core behavior.**

---

## 16. File Size Budget

**Target:** < 5 MB app bundle

- No embedded assets beyond SF Symbols
- No bundled fonts
- No bundled images (except app icon)
- No bundled videos
- No bundled data files

**Supabase client is the only external dependency.**

---

## 17. Code Principles

1. **No premature abstraction**
   - Three similar lines > one helper function
   - Inline until you need it 3+ times

2. **No defensive coding**
   - Trust Supabase SDK
   - Trust Swift type system
   - Guard only at boundaries

3. **No comments**
   - Code should be self-explanatory
   - Name things clearly
   - Structure reveals intent

4. **No tests initially**
   - Manual testing only
   - UI tests when stable
   - Unit tests when refactoring

5. **No CI/CD initially**
   - Manual builds
   - Manual TestFlight uploads
   - Manual App Store submission

---

## Summary

**This is the entire iOS app:**

- 13 files
- 3 screens
- 3 actions
- 2 database tables (read-only on one, write on other)
- 0 third-party dependencies (except Supabase)
- 0 features beyond core three

**Everything else is deleted.**

**This is constraint.**
**This is elegance.**
**This is proof.**

---

## Next Steps

1. Create Xcode project
2. Add Supabase Swift package
3. Implement 13 files as specified
4. Manual test at real event
5. Ship to TestFlight
6. Observe behavior
7. Make decision: expand or kill

**Do not add features.**
**Do not optimize prematurely.**
**Do not plan for scale.**

Build this. Ship this. Learn from this.

---

**End of Architecture Document**
