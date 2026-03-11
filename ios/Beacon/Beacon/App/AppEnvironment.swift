import Foundation
import Supabase

final class AppEnvironment {

    static let shared = AppEnvironment()

    let supabaseClient: SupabaseClient

    private init() {

        let supabaseURL = URL(string: "https://mqbsjlgnsirqsmfnreqd.supabase.co")!

        let supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1xYnNqbGduc2lycXNtZm5yZXFkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1ODQyNzIsImV4cCI6MjA4NjE2MDI3Mn0.fF4_q0Di_1irDzTiuTRbuit61jclGyZw7ff2Q928QXc"


        supabaseClient = SupabaseClient(
            supabaseURL: supabaseURL,
            supabaseKey: supabaseKey,
            options: .init(
                auth: .init(
                    emitLocalSessionAsInitialSession: true
                )
            )
        )
    }
}
