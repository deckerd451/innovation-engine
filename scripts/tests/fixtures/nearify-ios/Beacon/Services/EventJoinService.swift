// Contract excerpt, not the real file. nearify-ios is a separate, private
// repository, so clean checkouts of this repository (including CI) cannot
// read it. These are the call shapes Innovation Engine's live-presence
// boundary relies on; test-nearify-live-presence-boundary.js asserts the
// same patterns against the real file whenever nearify-ios is available
// (NEARIFY_IOS_ROOT, or a ../nearify-ios sibling checkout).

// Check-in: the only path that makes presence live.
await InnovationEngineBridgeService.shared.setEventLivePresence(
    nearifyEventId: targetEventID,
    eventName: eventName,
    eventStartsAt: nil,
    isLive: true
)

// Check-out and leave: presence stops being live.
await InnovationEngineBridgeService.shared.setEventLivePresence(
    nearifyEventId: eventId,
    eventName: eventName,
    eventStartsAt: nil,
    isLive: false
)
