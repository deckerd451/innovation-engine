# Phase 3 — Beacon Confidence Detection

## ✅ COMPLETE

### What Was Built

A beacon confidence layer that promotes BLE detections into trustworthy event beacon state through continuous monitoring and qualification.

### Files Created

1. **Services/BeaconConfidenceService.swift** (NEW)
   - Confidence state machine
   - Beacon qualification logic
   - Continuous monitoring
   - Promotion to stable state

### Files Modified

1. **Views/EventModeView.swift**
   - Integrated confidence service
   - Updated "Closest Beacon" card to "Event Beacon"
   - Shows confidence states (Searching/Candidate/Stable)
   - Real-time confidence progress

### Confidence State Machine

```
┌─────────────┐
│  SEARCHING  │ ← No qualifying beacon
└──────┬──────┘
       │ Known beacon detected
       │ RSSI ≥ -80 dBm
       │ Fresh (< 5s old)
       ▼
┌─────────────┐
│  CANDIDATE  │ ← Building confidence
└──────┬──────┘   (0-3 seconds)
       │ Continuous detection
       │ for 3 seconds
       ▼
┌─────────────┐
│   STABLE    │ ← Confident beacon
└─────────────┘   Promoted to active
```

### Qualification Criteria

A beacon qualifies as a candidate if:
1. ✅ **Known beacon** - Matches known beacon list (MOONSIDE-S1)
2. ✅ **Strong signal** - RSSI ≥ -80 dBm
3. ✅ **Fresh detection** - Last seen < 5 seconds ago
4. ✅ **Strongest** - Highest RSSI among qualifying beacons

### Confidence Building

**Candidate → Stable:**
- Beacon must be detected continuously for 3 seconds
- RSSI must stay above threshold
- Detection must remain fresh
- If beacon disappears or weakens, restart from searching

### Configuration

```swift
private let rssiThreshold: Int = -80           // Minimum RSSI
private let confidenceWindow: TimeInterval = 3.0  // Confidence duration
private let freshnessWindow: TimeInterval = 5.0   // Max detection age
```

**Adjustable for different scenarios:**
- Stricter: -70 dBm, 5 seconds
- Looser: -85 dBm, 2 seconds

### UI States

#### Searching State
```
┌─────────────────────────────────┐
│ 🔍 Event Beacon      [Searching]│
│                                 │
│ 🔄 Searching for event beacons..│
└─────────────────────────────────┘
```

#### Candidate State
```
┌─────────────────────────────────┐
│ 📍 Event Beacon      [Candidate]│
│                                 │
│ MOONSIDE-S1                     │
│ Building confidence...  -68 dBm │
└─────────────────────────────────┘
```

#### Stable State
```
┌─────────────────────────────────┐
│ 📍 Event Beacon         [Stable]│
│                                 │
│ MOONSIDE-S1                     │
│ 📡 -68 dBm • Near  Stable for 5s│
└─────────────────────────────────┘
```

### Debug Output

**Candidate detected:**
```
[CONFIDENCE] New candidate: MOONSIDE-S1 at -68 dBm
```

**Confidence building:**
```
[CONFIDENCE] MOONSIDE-S1: 0.5s / 3.0s (17%)
[CONFIDENCE] MOONSIDE-S1: 1.0s / 3.0s (33%)
[CONFIDENCE] MOONSIDE-S1: 1.5s / 3.0s (50%)
[CONFIDENCE] MOONSIDE-S1: 2.0s / 3.0s (67%)
[CONFIDENCE] MOONSIDE-S1: 2.5s / 3.0s (83%)
[CONFIDENCE] MOONSIDE-S1: 3.0s / 3.0s (100%)
```

**Stable achieved:**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[CONFIDENCE] ✅ STABLE BEACON ACHIEVED
  Name: MOONSIDE-S1
  RSSI: -68 dBm
  Signal: Near
  Confidence Duration: 3.1s
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Lost beacon:**
```
[CONFIDENCE] No qualifying beacon, returning to searching
```

### Features Implemented

#### 1. Beacon Qualification ✅
- Filters known beacons only
- RSSI threshold enforcement
- Freshness check
- Strongest beacon selection

#### 2. Confidence Tracking ✅
- Continuous monitoring (0.5s intervals)
- Duration tracking
- Progress logging
- State transitions

#### 3. Stable Beacon Promotion ✅
- 3-second continuous detection
- Promoted to active beacon
- Published for UI observation
- Debug output on promotion

#### 4. UI Integration ✅
- Real-time state display
- Color-coded states:
  - Gray: Searching
  - Orange: Candidate
  - Green: Stable
- Confidence badges
- Signal strength labels

#### 5. Automatic Reset ✅
- Returns to searching if beacon lost
- Clears candidate on signal drop
- Restarts confidence on new beacon

### Public API

**BeaconConfidenceService:**

```swift
// Published properties
@Published private(set) var activeBeacon: ConfidentBeacon?
@Published private(set) var candidateBeacon: ConfidentBeacon?
@Published private(set) var confidenceState: BeaconConfidenceState

// Methods
func getActiveBeaconInfo() -> String?  // "MOONSIDE-S1 • -68 dBm • Near"
func reset()  // Manual reset
```

**ConfidentBeacon:**

```swift
struct ConfidentBeacon {
    let id: UUID
    let name: String
    let rssi: Int
    let confidenceState: BeaconConfidenceState
    let firstSeen: Date
    let lastSeen: Date
    
    var signalLabel: String  // "Very Close" / "Near" / "Nearby" / "Far"
    var confidenceDuration: TimeInterval  // Seconds since first seen
}
```

### What Was NOT Modified

✅ QR flow - Untouched
✅ Suggested connections - Untouched
✅ Supabase writes - No presence writes yet
✅ BLEService - Untouched
✅ Connection logic - Untouched
✅ Nearby Signals panel - Preserved

**Read-only with respect to backend!**

### Beacon Signature Preparation

**Current implementation:**
- Name matching as fallback: `MOONSIDE-S1`
- Structured for easy replacement

**Future enhancement:**
```swift
private func isKnownBeacon(
    name: String,
    serviceUUIDs: [CBUUID]?,
    manufacturerData: Data?
) -> Bool {
    // TODO: Replace with signature matching
    // Check service UUIDs
    // Check manufacturer data patterns
    // Fall back to name if needed
    return knownBeaconNames.contains(where: { name.contains($0) })
}
```

### Testing Scenarios

#### Scenario 1: Clean Detection
1. Start app
2. MOONSIDE-S1 detected at -68 dBm
3. State: Searching → Candidate
4. Wait 3 seconds
5. State: Candidate → Stable
6. UI shows stable beacon

#### Scenario 2: Weak Signal
1. MOONSIDE-S1 detected at -85 dBm
2. Below threshold (-80 dBm)
3. State remains: Searching
4. Not promoted to candidate

#### Scenario 3: Signal Loss
1. Stable beacon active
2. Signal drops or device moves away
3. Detection becomes stale (>5s)
4. State: Stable → Searching
5. UI shows "Searching..."

#### Scenario 4: Beacon Switch
1. MOONSIDE-S1 stable at -70 dBm
2. Move closer to different beacon
3. New beacon stronger
4. Confidence restarts with new beacon
5. Old beacon replaced when new stable

### Performance

**CPU Impact:**
- Evaluation every 0.5 seconds
- Lightweight filtering and comparison
- Minimal overhead

**Memory:**
- Single active beacon tracked
- Single candidate tracked
- No historical data stored

**Battery:**
- Piggybacks on existing BLE scanning
- No additional scanning overhead
- Timer-based evaluation only

### Integration Points

**For Future Phases:**

```swift
// When stable beacon achieved, can trigger:
if confidence.confidenceState == .stable,
   let beacon = confidence.activeBeacon {
    // Phase 4: Write presence to Supabase
    // Phase 5: Update Event Mode backend
    // Phase 6: Generate connection suggestions
}
```

### Configuration Tuning

**For different environments:**

**Indoor event (close proximity):**
```swift
private let rssiThreshold: Int = -70
private let confidenceWindow: TimeInterval = 2.0
```

**Outdoor event (longer range):**
```swift
private let rssiThreshold: Int = -85
private let confidenceWindow: TimeInterval = 5.0
```

**High-traffic area (avoid false positives):**
```swift
private let rssiThreshold: Int = -65
private let confidenceWindow: TimeInterval = 5.0
```

### Files Summary

| File | Status | Purpose |
|------|--------|---------|
| `Services/BeaconConfidenceService.swift` | NEW | Confidence state machine |
| `Views/EventModeView.swift` | MODIFIED | Integrated confidence UI |

**Total:** 1 new file, 1 modified file

### Architecture

```
BLEScannerService
       ↓ (publishes discovered devices)
BeaconConfidenceService
       ↓ (evaluates & promotes)
EventModeView
       ↓ (displays state)
User sees: Searching / Candidate / Stable
```

**Clean separation of concerns:**
- Scanner: Raw BLE detection
- Confidence: Qualification & promotion
- UI: State display

### Next Steps (Phase 4)

**Supabase Integration:**
1. Write presence when stable beacon achieved
2. Update presence on RSSI changes
3. Clear presence when beacon lost
4. Debounce writes (max 1 per 5 seconds)

**Enhanced Matching:**
1. Analyze MOONSIDE debug output
2. Identify service UUIDs
3. Identify manufacturer data patterns
4. Implement signature-based matching
5. Remove name-based fallback

---

## Status: ✅ BEACON CONFIDENCE LAYER COMPLETE

Trustworthy event beacon state now available for the rest of the app to use.

