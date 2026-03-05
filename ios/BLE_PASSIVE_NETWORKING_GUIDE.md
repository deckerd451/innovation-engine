# BLE Passive Networking - Implementation Guide

## Overview

This implementation provides BLE-based passive networking for CharlestonHacks Innovation Engine using iBeacon scanning and Supabase backend integration.

## Architecture

### Components

1. **BeaconRegistryService** - Manages beacon cache and registry
2. **BLEService** - Handles iBeacon scanning, RSSI tracking, and presence uploads
3. **SuggestedConnectionsService** - Manages inference and connection promotion
4. **EventModeView** - UI for toggling Event Mode and viewing beacon status
5. **SuggestedConnectionsView** - UI for managing suggested connections

### Data Flow

```
iBeacon Detection → RSSI History → Energy Calculation → Debounced Upload → Supabase
                                                                              ↓
User Generates Suggestions ← Inference RPC ← presence_sessions overlap analysis
                ↓
Accept/Ignore/Block → promote_edge_to_connection RPC → connections table
```

## Database Schema (Non-Negotiable)

### Existing Tables

**public.presence_sessions**
- `id` (uuid)
- `user_id` (uuid) - **REFERENCES public.community(id)** (NOT auth.uid)
- `context_type` (text)
- `context_id` (uuid)
- `energy` (numeric) - **CONSTRAINT: BETWEEN 0 AND 1**
- `expires_at` (timestamptz)
- `created_at` (timestamptz)
- `updated_at` (timestamptz)
- `is_active` (boolean)
- `last_seen` (timestamptz)

**CRITICAL**: 
- `user_id` is a foreign key to `community.id` (NOT `auth.uid()`)
- Client must NEVER insert directly into this table
- Client must ONLY call `upsert_presence_ping()` RPC
- RPC handles `auth.uid() → community.id` mapping

**public.connections**
- `id` (uuid)
- `from_user_id` (uuid) - **REFERENCES public.community(id)**
- `to_user_id` (uuid) - **REFERENCES public.community(id)**
- `created_at` (timestamptz)
- `status` (text)
- `type` (text)

### New Tables (Must Exist)

**public.beacons**
- `id` (uuid)
- `beacon_key` (text, unique) - Format: `uuid:<UUID>|major:<MAJOR>|minor:<MINOR>`
- `label` (text)
- `kind` (text)
- `group_id` (uuid, nullable)
- `is_active` (boolean)
- `meta` (jsonb)
- `created_at` (timestamptz)

**public.interaction_edges**
- `id` (uuid)
- `from_user_id` (uuid)
- `to_user_id` (uuid)
- `created_at` (timestamptz)
- `status` (text) - 'suggested', 'ignored', 'blocked', 'accepted'
- `type` (text)
- `beacon_id` (uuid)
- `overlap_seconds` (int)
- `confidence` (numeric)
- `meta` (jsonb)

## RPC Functions (Must Exist)

### upsert_presence_ping

```sql
CREATE OR REPLACE FUNCTION upsert_presence_ping(
    p_context_type text,
    p_context_id uuid,
    p_energy numeric,
    p_ttl_seconds int DEFAULT 25
) RETURNS void AS $$
BEGIN
    INSERT INTO presence_sessions (
        id,
        user_id,
        context_type,
        context_id,
        energy,
        expires_at,
        created_at,
        updated_at,
        is_active,
        last_seen
    ) VALUES (
        gen_random_uuid(),
        auth.uid(),
        p_context_type,
        p_context_id,
        p_energy,
        now() + (p_ttl_seconds || ' seconds')::interval,
        now(),
        now(),
        true,
        now()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### infer_ble_edges

```sql
CREATE OR REPLACE FUNCTION infer_ble_edges(
    p_group_id uuid DEFAULT NULL,
    p_min_overlap_seconds int DEFAULT 120,
    p_lookback_minutes int DEFAULT 240
) RETURNS int AS $$
DECLARE
    v_count int;
BEGIN
    -- Implementation: Analyze presence_sessions for overlaps
    -- Create interaction_edges with status='suggested'
    -- Return count of new edges created
    
    -- Example logic:
    WITH overlaps AS (
        SELECT 
            p1.user_id as from_user_id,
            p2.user_id as to_user_id,
            p1.context_id as beacon_id,
            COUNT(*) as overlap_count,
            SUM(LEAST(
                EXTRACT(EPOCH FROM p1.expires_at),
                EXTRACT(EPOCH FROM p2.expires_at)
            ) - GREATEST(
                EXTRACT(EPOCH FROM p1.created_at),
                EXTRACT(EPOCH FROM p2.created_at)
            )) as overlap_seconds
        FROM presence_sessions p1
        JOIN presence_sessions p2 
            ON p1.context_id = p2.context_id 
            AND p1.context_type = 'beacon'
            AND p2.context_type = 'beacon'
            AND p1.user_id < p2.user_id
        WHERE p1.created_at > now() - (p_lookback_minutes || ' minutes')::interval
        GROUP BY p1.user_id, p2.user_id, p1.context_id
        HAVING SUM(...) >= p_min_overlap_seconds
    )
    INSERT INTO interaction_edges (
        id, from_user_id, to_user_id, beacon_id, 
        overlap_seconds, confidence, status, type, created_at
    )
    SELECT 
        gen_random_uuid(), from_user_id, to_user_id, beacon_id,
        overlap_seconds, 
        LEAST(overlap_seconds / 600.0, 1.0) as confidence,
        'suggested', 'ble_proximity', now()
    FROM overlaps
    ON CONFLICT DO NOTHING;
    
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### promote_edge_to_connection

```sql
CREATE OR REPLACE FUNCTION promote_edge_to_connection(
    p_edge_id uuid
) RETURNS void AS $$
DECLARE
    v_edge interaction_edges;
BEGIN
    SELECT * INTO v_edge FROM interaction_edges WHERE id = p_edge_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Edge not found';
    END IF;
    
    -- Insert into connections
    INSERT INTO connections (
        id, from_user_id, to_user_id, status, type, created_at
    ) VALUES (
        gen_random_uuid(),
        v_edge.from_user_id,
        v_edge.to_user_id,
        'accepted',
        'ble_proximity',
        now()
    );
    
    -- Update edge status
    UPDATE interaction_edges 
    SET status = 'accepted' 
    WHERE id = p_edge_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

## Beacon Configuration

### Beacon Key Format

The app expects beacons in the format:
```
uuid:<UUID>|major:<MAJOR>|minor:<MINOR>
```

Example:
```
uuid:E2C56DB5-DFFB-48D2-B060-D0F5A71096E0|major:100|minor:1
```

### Setting Up Beacons

1. **Physical Setup**: Deploy iBeacon hardware at event venue
2. **Database Registration**: Insert into `public.beacons` table

```sql
INSERT INTO public.beacons (
    id,
    beacon_key,
    label,
    kind,
    group_id,
    is_active,
    meta,
    created_at
) VALUES (
    gen_random_uuid(),
    'uuid:E2C56DB5-DFFB-48D2-B060-D0F5A71096E0|major:100|minor:1',
    'Main Hall Entrance',
    'event',
    '<event-group-uuid>',
    true,
    '{"location": "Building A, Floor 1"}',
    now()
);
```

3. **App Cache**: The app will automatically fetch and cache active beacons

## Energy Calculation Algorithm

The app calculates energy scores from RSSI values in the range [0, 1] (database constraint):

```swift
// 1. Collect last 10 RSSI samples per beacon
// 2. Calculate median RSSI
let median = sorted[count / 2]

// 3. Normalize RSSI to [0, 1]
// RSSI ranges: -90 (far) to -40 (very close)
let normalizedRSSI = (median + 90) / 50.0  // Map -90→0, -40→1

// 4. Scale to energy range [0.4, 0.9]
var energy = 0.4 + (normalizedRSSI * 0.5)

// 5. Apply stability penalty
let stddev = sqrt(variance)
let stabilityFactor = max(0, 1 - (stddev / 20.0))
energy *= stabilityFactor

// 6. Clamp to [0, 1] per database constraint
energy = max(0, min(1, energy))
```

**Energy Scale**:
- `0.4` = tab hidden / baseline
- `0.6` = normal presence
- `0.75` = active interaction
- `0.9` = very active / very close

**Examples:**
- RSSI -90 → energy ~0.4
- RSSI -70 → energy ~0.6
- RSSI -50 → energy ~0.8
- RSSI -40 → energy ~0.9

## Debouncing Rules

Presence pings are debounced to avoid spam:

1. **Time-based**: Max 1 ping per beacon every 5 seconds
2. **Energy-based**: OR if energy change >= 1.5

This ensures:
- Stable signals don't flood the database
- Significant changes are captured immediately
- TTL of 25 seconds keeps presence fresh

## Usage Flow

### 1. App Launch
```swift
// Beacon cache loads from UserDefaults
// If cache is stale (>6 hours), refresh from Supabase
```

### 2. Start Event Mode
```swift
// User taps "Start Event Mode"
// → Request location permission
// → Refresh beacon registry
// → Start CoreLocation ranging for all cached beacons
// → Start scan timer (1.5s interval)
// → Start retry timer (2s interval for queued pings)
```

### 3. Scanning
```swift
// Every 1.5 seconds:
// → Process RSSI history for all detected beacons
// → Calculate energy scores
// → Update UI with closest beacon
// → Queue pings for top 3 beacons (if debounce allows)

// Every 2 seconds:
// → Upload queued pings via upsert_presence_ping RPC
```

### 4. Generate Suggestions
```swift
// User taps "Generate Suggestions"
// → Call infer_ble_edges(group_id, 120, 240)
// → Fetch interaction_edges where status='suggested'
// → Resolve display names from community table
// → Display in list sorted by confidence/overlap
```

### 5. Accept/Ignore/Block
```swift
// User taps action button
// → Accept: call promote_edge_to_connection RPC
// → Ignore: update edge status='ignored'
// → Block: update edge status='blocked'
// → Remove from UI list
```

## Testing Guide

### Local Testing (1 Beacon)

1. **Setup Test Beacon**
   - Use a physical iBeacon or iOS simulator app (e.g., "Beacon Simulator")
   - Configure UUID, major, minor
   - Register in database

2. **Test App**
   ```
   - Launch app and sign in
   - Navigate to Event Mode tab
   - Tap "Start Event Mode"
   - Verify location permission prompt
   - Check "Closest Beacon" card shows your beacon
   - Verify signal strength indicator updates
   ```

3. **Verify Database**
   ```sql
   SELECT * FROM presence_sessions 
   WHERE user_id = '<your-user-id>' 
   ORDER BY created_at DESC 
   LIMIT 10;
   ```

### Event Testing (3-5 Devices)

1. **Setup Multiple Beacons**
   - Deploy 3-5 beacons in different locations
   - Register all in database with same group_id

2. **Coordinate Test**
   - Have 3-5 users install app
   - All users start Event Mode
   - Users move between beacon locations
   - Spend 2-3 minutes near each beacon
   - Some users should overlap at same beacons

3. **Generate Suggestions**
   - After 5-10 minutes, users tap "Generate Suggestions"
   - Verify suggestions appear for users who overlapped
   - Check overlap minutes and confidence scores

4. **Test Actions**
   - Accept: verify connection appears in Network tab
   - Ignore: verify suggestion disappears
   - Block: verify suggestion disappears

5. **Verify Database**
   ```sql
   -- Check presence pings
   SELECT user_id, context_id, energy, created_at 
   FROM presence_sessions 
   WHERE context_type = 'beacon' 
   ORDER BY created_at DESC;
   
   -- Check inferred edges
   SELECT * FROM interaction_edges 
   WHERE status = 'suggested' 
   ORDER BY confidence DESC;
   
   -- Check promoted connections
   SELECT * FROM connections 
   WHERE type = 'ble_proximity';
   ```

## Privacy & UX

### Privacy Notice
The app displays a clear privacy notice before Event Mode:
- "We record anonymous proximity signals as presence pings"
- "You decide whether to connect with people you were near"
- Detailed privacy sheet available via "Learn More"

### User Control
- Event Mode is opt-in (toggle ON/OFF)
- Stop button immediately halts scanning
- Suggestions are opt-in (accept/ignore/block)
- No raw RSSI or location data shown in UI

### Offline Handling
- Pings queue in memory if network fails
- Retry timer attempts upload every 2 seconds
- Simple queue (no persistent storage for MVP)

## Configuration

### AppEnvironment.swift
Update with your Supabase credentials:

```swift
let supabaseURL = URL(string: "https://your-project.supabase.co")!
let supabaseKey = "your-anon-key"
```

### Beacon Registry
Beacons are fetched from Supabase on:
- App launch
- Event Mode toggle ON
- Every 6 hours while app is running
- Manual refresh via `BeaconRegistryService.shared.refreshBeacons()`

## Troubleshooting

### No Beacons Detected
- Check location permission granted
- Verify beacons are powered on and broadcasting
- Confirm beacon_key format matches exactly
- Check beacons are marked `is_active=true` in database

### Pings Not Uploading
- Check network connectivity
- Verify Supabase credentials in AppEnvironment
- Check RLS policies allow insert on presence_sessions
- Review console logs for error messages

### No Suggestions Generated
- Verify users had Event Mode ON during overlap
- Check minimum overlap threshold (default 120 seconds)
- Verify lookback window (default 240 minutes)
- Ensure users were near same beacon(s)

### Display Names Show UUIDs
- Check if community table exists and has data
- Verify user_id matches between tables
- Fallback to shortened UUID is expected if no profile found

## Performance Considerations

### Battery Impact
- Foreground scanning only (no background for MVP)
- 1.5s scan interval is reasonable for battery life
- Users should stop Event Mode when not at event

### Network Usage
- Debouncing limits pings to ~1 per beacon per 5 seconds
- With 3 active beacons: ~36 pings/minute
- Each ping is small (~100 bytes)
- Total: ~3.6 KB/minute

### Database Load
- Insert-only presence_sessions (no updates)
- Consider TTL-based cleanup job for old sessions
- Inference RPC should have reasonable lookback window

## Future Enhancements

### Background Scanning
- Requires significant battery optimization
- iOS background beacon monitoring is limited
- Consider region monitoring + ranging on entry

### Multi-Event Support
- Filter beacons by group_id
- Allow user to select active event
- Separate suggestion lists per event

### Enhanced Privacy
- Differential privacy for presence data
- Encrypted beacon identifiers
- User-controlled data retention

### Advanced Features
- Real-time "who's here now" view
- Heatmaps of popular areas
- Time-based analytics
- Integration with event schedule

## Support

For issues or questions:
1. Check console logs for error messages
2. Verify database schema matches exactly
3. Test RPC functions directly in Supabase SQL editor
4. Review this guide's troubleshooting section
