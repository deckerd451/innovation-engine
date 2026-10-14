// Contract excerpt, not the real file; see EventJoinService.swift here.

let result: LiveEventPresenceResult = try await client
    .rpc("set_nearify_event_live_presence", params: params)
    .execute()
    .value
