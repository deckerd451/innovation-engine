import Foundation
import Combine
import Supabase
import UIKit

final class AuthService: ObservableObject {
    static let shared = AuthService()

    @Published var isAuthenticated = false
    @Published var currentUser: User?

    private let supabase = AppEnvironment.shared.supabaseClient
    private var authStateTask: Task<Void, Never>?

    private init() {
        observeAuthState()
    }

    deinit {
        authStateTask?.cancel()
    }

    private func observeAuthState() {
        authStateTask?.cancel()

        authStateTask = Task { [weak self] in
            guard let self else { return }

            await self.checkInitialSession()

            for await (_, session) in supabase.auth.authStateChanges {
                await self.handleAuthStateChange(session: session)
            }
        }
    }

    private func checkInitialSession() async {
        do {
            let session = try await supabase.auth.session
            await handleAuthStateChange(session: session)
        } catch {
            await MainActor.run {
                self.isAuthenticated = false
                self.currentUser = nil
            }
        }
    }

    private func handleAuthStateChange(session: Session?) async {
        guard let session = session, !session.isExpired else {
            await MainActor.run {
                self.isAuthenticated = false
                self.currentUser = nil
            }
            return
        }

        await loadCurrentUser()
    }

    func signIn(email: String, password: String) async throws {
        try await supabase.auth.signIn(email: email, password: password)
        await loadCurrentUser()
    }

    func signOut() async throws {
        try await supabase.auth.signOut()

        await MainActor.run {
            self.isAuthenticated = false
            self.currentUser = nil
        }
    }

    // MARK: - OAuth

    @MainActor
    func signInWithOAuth(provider: Provider) async throws {
        let url = try supabase.auth.getOAuthSignInURL(
            provider: provider,
            redirectTo: URL(string: "beacon://callback")
        )

        await UIApplication.shared.open(url)
    }

    @MainActor
    func handleOAuthCallback(url: URL) async {
        do {
            _ = try await supabase.auth.session(from: url)
            await loadCurrentUser()
        } catch {
            print("OAuth callback error: \(error)")
            self.isAuthenticated = false
            self.currentUser = nil
        }
    }

    private func loadCurrentUser() async {
        do {
            let session = try await supabase.auth.session
            
            // Use CommunityIdentityService for robust profile resolution
            let result = try await CommunityIdentityService.shared.resolveOrCreateProfile(for: session)
            
            switch result {
            case .resolved(let profile):
                await MainActor.run {
                    self.currentUser = profile
                    self.isAuthenticated = true
                }
                
            case .ambiguous(let candidates):
                // For now, auto-select first candidate
                // TODO: Show user choice UI in future
                print("[Auth] ⚠️ Ambiguous profiles found, auto-selecting first")
                let selected = candidates[0]
                try await CommunityIdentityService.shared.linkProfile(
                    communityId: selected.id,
                    to: session.user.id
                )
                
                let linkedProfile = try await CommunityIdentityService.shared.loadProfile(
                    communityId: selected.id
                )
                
                await MainActor.run {
                    self.currentUser = linkedProfile
                    self.isAuthenticated = true
                }
            }
        } catch {
            print("[Auth] ❌ Error loading user: \(error)")
            
            await MainActor.run {
                self.currentUser = nil
                self.isAuthenticated = false
            }
        }
    }
}
