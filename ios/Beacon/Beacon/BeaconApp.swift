//
//  BeaconApp.swift
//  Beacon
//
//  Created by Douglas Hamilton on 3/6/26.
//

import SwiftUI
import Supabase

@main
struct BeaconApp: App {
    @StateObject private var authService = AuthService.shared
    @State private var selectedTab: AppTab = .home

    init() {
        _ = BLEAdvertiserService.shared
        _ = BLEScannerService.shared
        _ = BeaconConfidenceService.shared  // Diagnostic-only anchor monitor; must init before EventPresenceService
        _ = EventPresenceService.shared
        _ = EventAttendeesService.shared
    }

    var body: some Scene {
        WindowGroup {
            Group {
                if authService.isAuthenticated, let currentUser = authService.currentUser {
                    // Route based on profile state
                    switch authService.profileState {
                    case .ready:
                        // Profile complete - enter main app
                        MainTabView(currentUser: currentUser, selectedTab: $selectedTab)

                    case .incomplete, .missing:
                        // Profile needs completion
                        ProfileCompletionView(profile: currentUser) {
                            Task {
                                await authService.refreshProfile()
                            }
                        }
                    }
                } else {
                    LoginView()
                }
            }
            .onOpenURL { url in
                let urlString = url.absoluteString
                #if DEBUG
                print("[DeepLink] 🔗 Received URL: \(urlString)")
                #endif

                // ── Gate 1: OAuth callback ───────────────────────────────────
                // ONLY beacon://callback reaches AuthService. Nothing else does.
                if urlString.hasPrefix("beacon://callback") {
                    #if DEBUG
                    print("[DeepLink] 🔐 Routing to OAuth")
                    #endif
                    Task { await authService.handleOAuthCallback(url: url) }
                    return
                }

                // ── Gate 2: QR-scheme URLs ───────────────────────────────────
                // beacon://event/<id> and beacon://profile/<id> are handled here.
                // AuthService is NOT involved below this line.
                guard let payload = QRService.parse(from: urlString) else {
                    #if DEBUG
                    print("[DeepLink] ❓ Unknown or unsupported URL: \(urlString)")
                    #endif
                    return
                }

                switch payload {
                case .event(let eventId):
                    #if DEBUG
                    print("[DeepLink] 🎫 Event: '\(eventId)'")
                    print("[DeepLink] 📱 Switching to Network tab (UI signal)")
                    #endif
                    // Switch tab immediately — visible proof the deep link landed.
                    selectedTab = .network
                    Task {
                        #if DEBUG
                        print("[DeepLink] 🎫 Routing to EventJoinService")
                        #endif
                        await EventJoinService.shared.joinEvent(eventID: eventId)
                        #if DEBUG
                        if EventJoinService.shared.isEventJoined {
                            print("[DeepLink] ✅ Join succeeded: '\(eventId)'")
                        } else {
                            let err = EventJoinService.shared.joinError ?? "unknown error"
                            print("[DeepLink] ❌ Join failed for '\(eventId)': \(err)")
                        }
                        #endif
                    }

                case .profile(let communityId):
                    #if DEBUG
                    print("[DeepLink] 👤 Profile: \(communityId)")
                    #endif
                    // TODO: Navigate to profile view for communityId.
                    // No deep-link profile navigation exists yet — requires a
                    // sheet/navigation path accessible from BeaconApp.
                    _ = communityId
                }
            }
        }
    }
}

struct LoginView: View {
    @State private var isLoading = false
    @State private var errorMessage: String?

    var body: some View {
        VStack(spacing: 20) {
            Text("Innovation Engine")
                .font(.largeTitle)
                .fontWeight(.bold)

            VStack(spacing: 12) {
                Button {
                    Task {
                        await signInWithOAuth(provider: .google)
                    }
                } label: {
                    HStack {
                        Image(systemName: "globe")
                        Text("Continue with Google")
                    }
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .disabled(isLoading)

                Button {
                    Task {
                        await signInWithOAuth(provider: .github)
                    }
                } label: {
                    HStack {
                        Image(systemName: "chevron.left.forwardslash.chevron.right")
                        Text("Continue with GitHub")
                    }
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .disabled(isLoading)
            }

            if let errorMessage {
                Text(errorMessage)
                    .foregroundColor(.red)
                    .font(.caption)
            }
        }
        .padding()
    }

    private func signInWithOAuth(provider: Provider) async {
        isLoading = true
        errorMessage = nil

        do {
            try await AuthService.shared.signInWithOAuth(provider: provider)
        } catch {
            errorMessage = error.localizedDescription
            isLoading = false
        }

        // isLoading stays true until the OAuth callback completes
        // or the user exits the browser flow
    }
}
