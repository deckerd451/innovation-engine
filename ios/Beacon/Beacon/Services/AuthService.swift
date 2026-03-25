import Foundation
import Combine
import Supabase
import UIKit

final class AuthService: ObservableObject {
    static let shared = AuthService()

    @Published var isAuthenticated = false
    @Published var currentUser: User?
    @Published var profileState: ProfileState = .missing

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
                self.profileState = .missing
            }
        }
    }

    private func handleAuthStateChange(session: Session?) async {
        guard let session = session, !session.isExpired else {
            await MainActor.run {
                self.isAuthenticated = false
                self.currentUser = nil
                self.profileState = .missing
            }
            return
        }

        await loadCurrentUser()
    }

    func signOut() async throws {
        try await supabase.auth.signOut()

        await MainActor.run {
            self.isAuthenticated = false
            self.currentUser = nil
            self.profileState = .missing
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
        guard url.absoluteString.hasPrefix("beacon://callback") else {
            print("[Auth] ⚠️ handleOAuthCallback called with non-OAuth URL — rejected: \(url.absoluteString)")
            return
        }
        do {
            _ = try await supabase.auth.session(from: url)
            await loadCurrentUser()
        } catch {
            print("[Auth] ❌ OAuth callback error: \(error)")
            self.isAuthenticated = false
            self.currentUser = nil
            self.profileState = .missing
        }
    }

    private func loadCurrentUser() async {
        do {
            // Use ProfileService for deterministic profile resolution
            let result = try await ProfileService.shared.resolveCurrentProfile()
            
            await MainActor.run {
                self.currentUser = result.profile
                self.profileState = result.state
                self.isAuthenticated = true
            }
            
            #if DEBUG
            print("[Auth] ✅ Profile loaded")
            print("[Auth]    State: \(result.state.rawValue)")
            print("[Auth]    Name: \(result.profile.name)")
            #endif
            
        } catch {
            print("[Auth] ❌ Error loading user: \(error)")
            
            await MainActor.run {
                self.currentUser = nil
                self.profileState = .missing
                self.isAuthenticated = false
            }
        }
    }
    
    // MARK: - Profile Refresh
    
    /// Refreshes the current user profile after updates
    func refreshProfile() async {
        await loadCurrentUser()
    }
}
