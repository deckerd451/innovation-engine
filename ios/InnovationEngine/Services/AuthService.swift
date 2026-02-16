import Foundation
import Supabase
import Combine

final class AuthService: ObservableObject {
    static let shared = AuthService()

    @Published var isAuthenticated = false
    @Published var currentUser: User?

    private let supabase = AppEnvironment.shared.supabaseClient
    private var cancellables = Set<AnyCancellable>()

    private init() {
        observeAuthState()
    }

    private func observeAuthState() {
        supabase.auth.onAuthStateChange { [weak self] event, session in
            Task {
                await self?.handleAuthStateChange(session: session)
            }
        }
        .store(in: &cancellables)

        Task {
            await checkInitialSession()
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
        guard session != nil else {
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

    private func loadCurrentUser() async {
        do {
            let session = try await supabase.auth.session
            let userId = session.user.id

            let response: User = try await supabase
                .from("community")
                .select()
                .eq("user_id", value: userId.uuidString)
                .single()
                .execute()
                .value

            await MainActor.run {
                self.currentUser = response
                self.isAuthenticated = true
            }
        } catch {
            print("Error loading user: \(error)")
            await MainActor.run {
                self.isAuthenticated = false
                self.currentUser = nil
            }
        }
    }
}
