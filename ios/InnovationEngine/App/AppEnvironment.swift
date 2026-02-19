import Foundation
import Supabase

final class AppEnvironment {
    static let shared = AppEnvironment()

    let supabaseClient: SupabaseClient

    private init() {
        // TODO: Replace with your Supabase URL and anon key
        let supabaseURL = URL(string: "https://your-project.supabase.co")!
        let supabaseKey = "your-anon-key"

        supabaseClient = SupabaseClient(
            supabaseURL: supabaseURL,
            supabaseKey: supabaseKey,
            options: SupabaseClientOptions(
                auth: SupabaseClientOptions.AuthOptions(
                    emitLocalSessionAsInitialSession: true
                )
            )
        )
    }
}
