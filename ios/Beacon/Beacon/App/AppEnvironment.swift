import Foundation
import Supabase

final class AppEnvironment {

    static let shared = AppEnvironment()

    let supabaseClient: SupabaseClient

    private init() {

        let supabaseURL = URL(string: "https://unndeygygkgodmmdnlup.supabase.co")!

        let supabaseKey = "sb_publishable_G0KAfCFTovYCWDeEEKWBfg_8UpPHWWZ"


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
