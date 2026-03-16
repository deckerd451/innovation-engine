# BLE Device Identification Fix

## Problem Diagnosis

The app was scanning successfully and discovering many BLE devices, but BeaconConfidenceService never detected any event anchors. All confidence evaluations showed:
- Event anchors: 0
- Peer devices: 0  
- Other known beacons: 0

### Root Causes Identified

1. **Wrong name priority**: BLEScannerService prioritized `peripheral.name` (often nil or generic) over the advertised local name from advertisement data
2. **Too strict matching**: Event anchor detection required exact match `name == "MOONSIDE-S1"` which failed if the name had any variation
3. **Insufficient debug info**: First detection logging only showed known beacons, not all devices, making diagnosis difficult
4. **Missing name sources**: The model didn't separately track advertised local name vs peripheral name

## Solution Implemented

### 1. Enhanced Device Model

Added separate fields for both name sources:

```swift
struct DiscoveredBLEDevice: Identifiable {
    let id: UUID
    let identifier: UUID
    var name: String // Display name (prioritizes advertised local name)
    var rssi: Int
    var lastSeen: Date
    var isKnownBeacon: Bool

    // Advertisement metadata
    var advertisedLocalName: String? // CBAdvertisementDataLocalNameKey
    var peripheralName: String? // peripheral.name
    var serviceUUIDs: [CBUUID]?
    var manufacturerData: Data?
    var isConnectable: Bool?
    // ...
}
```

Now we capture:
- `advertisedLocalName`: From CBAdvertisementDataLocalNameKey (most reliable)
- `peripheralName`: From peripheral.name (often nil)
- `name`: Display name using priority logic

### 2. Corrected Name Priority

Changed from:
```swift
let name = peripheral.name
    ?? advertisementData[CBAdvertisementDataLocalNameKey] as? String
    ?? "Unknown"
```

To:
```swift
let peripheralName = peripheral.name
let advertisedLocalName = advertisementData[CBAdvertisementDataLocalNameKey] as? String

// Build display name with priority: advertised local name > peripheral name > "Unknown"
let displayName = advertisedLocalName ?? peripheralName ?? "Unknown"
```

This ensures the advertised local name (which contains "MOONSIDE-S1") is used as the display name.

### 3. Improved Beacon Matching

Updated `isKnownBeacon()` to check multiple sources in priority order:

```swift
nonisolated private static func isKnownBeacon(
    advertisedLocalName: String?,
    peripheralName: String?,
    serviceUUIDs: [CBUUID]?,
    isConnectable: Bool?
) -> Bool {
    let moonsideServiceUUID = CBUUID(string: "6E400001-B5A3-F393-E0A9-E50E24DCCA9E")

    // Check service UUID first (most reliable)
    if let uuids = serviceUUIDs,
       uuids.contains(moonsideServiceUUID) {
        return true
    }

    // Check advertised local name (second most reliable)
    if let localName = advertisedLocalName {
        if localName.contains("BEACON-") {
            return true
        }
        if localName.contains("MOONSIDE-S1") || localName.contains("MOONSIDE") {
            return true
        }
    }

    // Check peripheral name (least reliable, often nil)
    if let pName = peripheralName {
        if pName.contains("BEACON-") {
            return true
        }
        if pName.contains("MOONSIDE-S1") || pName.contains("MOONSIDE") {
            return true
        }
    }

    return false
}
```

Priority order:
1. Service UUID (most reliable, hardware-level identifier)
2. Advertised local name (reliable, set by device firmware)
3. Peripheral name (least reliable, often nil or generic)

### 4. Enhanced Debug Logging

Added comprehensive first-detection logging for ALL devices:

```swift
private func debugDeviceDiscovery(
    displayName: String,
    advertisedLocalName: String?,
    peripheralName: String?,
    peripheralUUID: UUID,
    rssi: Int,
    serviceUUIDs: [CBUUID]?,
    manufacturerData: Data?,
    isConnectable: Bool?,
    isKnown: Bool
) {
    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    print("[BLE] Device discovered (first time)")
    print("  Display Name: \(displayName)")
    print("  Advertised Local Name: \(advertisedLocalName ?? "nil")")
    print("  Peripheral Name: \(peripheralName ?? "nil")")
    print("  Peripheral UUID: \(peripheralUUID.uuidString)")
    print("  RSSI: \(rssi) dBm")
    print("  Connectable: \(isConnectable?.description ?? "unknown")")
    print("  Known Beacon: \(isKnown ? "YES" : "NO")")
    // ... service UUIDs and manufacturer data ...
}
```

Now logs every device on first detection, showing:
- Display name (what the app uses)
- Advertised local name (from advertisement)
- Peripheral name (from CoreBluetooth)
- Peripheral UUID
- RSSI
- Service UUIDs
- Manufacturer data
- Whether it's recognized as a known beacon

### 5. Flexible Event Anchor Matching

Updated BeaconConfidenceService to use more flexible matching:

```swift
private func isEventAnchor(_ name: String) -> Bool {
    // Match MOONSIDE beacons (more flexible than exact match)
    if name.contains("MOONSIDE-S1") || name.contains("MOONSIDE") {
        return true
    }
    
    // Exact match for backward compatibility
    if name == "MOONSIDE-S1" {
        return true
    }
    
    return false
}
```

This handles:
- Exact match: "MOONSIDE-S1"
- Partial match: "MOONSIDE-S1-ABC"
- Generic match: "MOONSIDE"

## How Event Anchor is Now Identified

### Multi-Layer Identification Strategy

1. **Service UUID (Primary)**
   - Most reliable hardware-level identifier
   - MOONSIDE beacon advertises: `6E400001-B5A3-F393-E0A9-E50E24DCCA9E`
   - Checked first in `isKnownBeacon()`

2. **Advertised Local Name (Secondary)**
   - Set by device firmware in advertisement packet
   - Usually contains "MOONSIDE-S1" or "MOONSIDE"
   - Now prioritized for display name
   - Checked second in `isKnownBeacon()`

3. **Peripheral Name (Fallback)**
   - From CoreBluetooth peripheral object
   - Often nil or generic
   - Checked last in `isKnownBeacon()`

4. **Flexible String Matching**
   - Uses `contains()` instead of exact `==`
   - Handles name variations
   - More robust to firmware changes

### Identification Flow

```
BLE Advertisement Received
    ↓
Extract service UUIDs → Contains MOONSIDE UUID? → Known Beacon ✓
    ↓ (if no match)
Extract advertised local name → Contains "MOONSIDE"? → Known Beacon ✓
    ↓ (if no match)
Extract peripheral name → Contains "MOONSIDE"? → Known Beacon ✓
    ↓ (if no match)
Not a known beacon
```

## Expected Log Output

### Event Anchor Detected
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[BLE] Device discovered (first time)
  Display Name: MOONSIDE-S1
  Advertised Local Name: MOONSIDE-S1
  Peripheral Name: nil
  Peripheral UUID: 8b7c40b1-0c94-497a-8f4e-a815f570cc25
  RSSI: -62 dBm
  Connectable: true
  Known Beacon: YES
  Service UUIDs:
    - 6E400001-B5A3-F393-E0A9-E50E24DCCA9E
  Manufacturer Data: none
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[BLE] device discovered: MOONSIDE-S1 -62 dBm [KNOWN BEACON]

[CONFIDENCE-EVAL] Trigger: scanner update
[CONFIDENCE-EVAL] Found 1 qualifying beacon(s)
[CONFIDENCE-EVAL]   Event anchors: 1
[CONFIDENCE-EVAL]   Peer devices: 0
[CONFIDENCE-EVAL]   Other known beacons: 0
[CONFIDENCE-EVAL] Selected beacon: MOONSIDE-S1 (ID: 8b7c40b1-...)
[CONFIDENCE] 🔍 NEW CANDIDATE DETECTED
  Name: MOONSIDE-S1
```

### Peer Device Detected
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[BLE] Device discovered (first time)
  Display Name: BEACON-ABC123
  Advertised Local Name: BEACON-ABC123
  Peripheral Name: nil
  Peripheral UUID: 12345678-1234-1234-1234-123456789abc
  RSSI: -55 dBm
  Connectable: true
  Known Beacon: YES
  Service UUIDs:
    - 6E400001-B5A3-F393-E0A9-E50E24DCCA9E
  Manufacturer Data: none
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[BLE] device discovered: BEACON-ABC123 -55 dBm [KNOWN BEACON]

[CONFIDENCE-EVAL]   Peer devices: 1
[CONFIDENCE-EVAL] ℹ️ Peer devices present but no event anchor - not eligible for activeBeacon
```

### Unknown Device Detected
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[BLE] Device discovered (first time)
  Display Name: iPhone
  Advertised Local Name: iPhone
  Peripheral Name: nil
  Peripheral UUID: abcdef12-3456-7890-abcd-ef1234567890
  RSSI: -70 dBm
  Connectable: true
  Known Beacon: NO
  Service UUIDs: none
  Manufacturer Data: 4c 00 10 05 03 18 a1 b2 c3
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[BLE] device discovered: iPhone -70 dBm
```

## Files Modified

### ios/Beacon/Beacon/Services/BLEScannerService.swift

1. **DiscoveredBLEDevice model**:
   - Added `advertisedLocalName: String?`
   - Added `peripheralName: String?`
   - Updated `name` documentation

2. **centralManager(_:didDiscover:advertisementData:rssi:)**:
   - Capture both name sources separately
   - Build display name with correct priority
   - Pass both names to `isKnownBeacon()`
   - Store both names in device model
   - Log all first detections (not just known beacons)

3. **isKnownBeacon()**:
   - Changed signature to accept separate name sources
   - Check service UUID first (most reliable)
   - Check advertised local name second
   - Check peripheral name last
   - Use `contains()` for flexible matching

4. **debugDeviceDiscovery()** (renamed from debugKnownBeacon):
   - Show all name sources
   - Show peripheral UUID
   - Show known beacon status
   - Log all devices, not just known beacons

### ios/Beacon/Beacon/Services/BeaconConfidenceService.swift

1. **isEventAnchor()**:
   - Use `contains()` instead of exact `==`
   - Match "MOONSIDE-S1" or "MOONSIDE"
   - Keep exact match for backward compatibility

## Testing Recommendations

1. Check logs for first detection of MOONSIDE beacon
2. Verify "Display Name" shows "MOONSIDE-S1"
3. Verify "Advertised Local Name" is populated
4. Verify "Known Beacon: YES"
5. Confirm confidence service detects event anchor
6. Test with peer devices (BEACON-*)
7. Test with unknown devices
8. Verify service UUID detection works
9. Test name variations (MOONSIDE-S1-ABC, etc.)

## Backward Compatibility

All changes are backward compatible:
- Existing code using `device.name` still works
- New fields are optional additions
- Matching is more flexible, not more strict
- No breaking changes to public API

## Future Improvements

1. **Configuration-based matching**: Move beacon identifiers to config file
2. **Multiple service UUIDs**: Support different beacon hardware
3. **Manufacturer data parsing**: Extract additional metadata
4. **Name normalization**: Standardize name formats
5. **Beacon registry**: Central list of known beacon identifiers
