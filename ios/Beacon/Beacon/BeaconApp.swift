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

    init() {
        _ = BLEScannerService.shared
        _ = EventPresenceService.shared
        _ = EventAttendeesService.shared
    }

    var body: some Scene {
        WindowGroup {
            Group {
                if authService.isAuthenticated, let currentUser = authService.currentUser {
                    MainTabView(currentUser: currentUser)
                } else {
                    LoginView()
                }
            }
            .onOpenURL { url in
                Task {
                    await authService.handleOAuthCallback(url: url)
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
