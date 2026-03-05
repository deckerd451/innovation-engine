## BLE Passive Networking - Setup Checklist

Follow these steps to set up BLE Passive Networking for CharlestonHacks Innovation Engine.

### 1. Database Setup

Run migrations in order:

```bash
# 1. Create beacons table
psql -h your-db-host -U postgres -d your-db -f migrations/001_create_beacons_table.sql

# 2. Create interaction_edges table
psql -h your-db-host -U postgres -d your-db -f migrations/002_create_interaction_edges_table.sql

# 3. Create RPC functions
psql -h your-db-host -U postgres -d your-db -f migrations/003_create_rpc_functions.sql

# 4. (Optional) Insert example beacon data
psql -h your-db-host -U postgres -d your-db -f migrations/004_example_beacon_data.sql
```

Or via Supabase Dashboard:
1. Go to SQL Editor
2. Copy/paste each migration file
3. Execute in order

### 2. Verify Database Schema

```sql
-- Check tables exist
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('beacons', 'interaction_edges', 'presence_sessions', 'connections');

-- Check RPC functions exist
SELECT routine_name FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name IN ('upsert_presence_ping', 'infer_ble_edges', 'promote_edge_to_connection');

-- Check active beacons
SELECT COUNT(*) as active_beacons FROM public.beacons WHERE is_active = true;
```

### 3. Configure iOS App

Update `ios/InnovationEngine/App/AppEnvironment.swift`:

```swift
let supabaseURL = URL(string: "https://YOUR-PROJECT.supabase.co")!
let supabaseKey = "YOUR-ANON-KEY"
```

Get these values from:
- Supabase Dashboard → Settings → API
- Use the "anon/public" key (not service_role)

### 4. Register Your Beacons

For each physical iBeacon device:

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
    'uuid:<YOUR-BEACON-UUID>|major:<MAJOR>|minor:<MINOR>',
    'Descriptive Label',
    'event',
    '<event-group-uuid>',  -- Same for all beacons in one event
    true,
    '{"location": "Building/Room"}',
    now()
);
```

**Important:** 
- Use EXACT UUID from your beacon hardware
- Major/minor must match exactly
- Format: `uuid:XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX|major:NNN|minor:NNN`

### 5. Test RPC Functions

```sql
-- Test upsert_presence_ping (must be authenticated)
SELECT upsert_presence_ping(
    'beacon',
    '<beacon-id>'::uuid,
    7.5,
    25
);

-- Verify ping was inserted
SELECT * FROM presence_sessions 
WHERE context_type = 'beacon' 
ORDER BY created_at DESC 
LIMIT 5;

-- Test infer_ble_edges (requires presence data)
SELECT infer_ble_edges(
    '<event-group-uuid>'::uuid,
    120,
    240
);

-- Check generated edges
SELECT * FROM interaction_edges 
WHERE status = 'suggested' 
ORDER BY confidence DESC;
```

### 6. Configure Permissions

Verify Info.plist has required keys:

```xml
<key>NSLocationWhenInUseUsageDescription</key>
<string>Location access is required to scan for nearby event beacons and enable passive networking.</string>

<key>NSBluetoothAlwaysUsageDescription</key>
<string>Bluetooth access is required to detect nearby event beacons for passive networking.</string>
```

### 7. Build & Run

```bash
cd ios
swift build
# Or open in Xcode and build
```

### 8. Test Flow

#### Single Device Test
1. Launch app and sign in
2. Navigate to "Event Mode" tab
3. Tap "Start Event Mode"
4. Grant location permission
5. Verify beacon appears in "Closest Beacon" card
6. Check console logs for ping uploads
7. Query database to verify presence_sessions

#### Multi-Device Test
1. Deploy 3-5 physical beacons
2. Have 3-5 users install app
3. All users start Event Mode
4. Users move between beacon locations
5. Spend 2-3 minutes near each beacon
6. Some users overlap at same beacons
7. After 5-10 minutes, tap "Generate Suggestions"
8. Verify suggestions appear
9. Test Accept/Ignore/Block actions

### 9. Verify Database Activity

```sql
-- Check presence pings
SELECT 
    u.name,
    b.label as beacon,
    ps.energy,
    ps.created_at
FROM presence_sessions ps
JOIN community u ON u.id = ps.user_id
JOIN beacons b ON b.id = ps.context_id
WHERE ps.context_type = 'beacon'
ORDER BY ps.created_at DESC
LIMIT 20;

-- Check inferred edges
SELECT 
    u1.name as user1,
    u2.name as user2,
    ie.overlap_seconds / 60 as overlap_minutes,
    ie.confidence,
    ie.status
FROM interaction_edges ie
JOIN community u1 ON u1.id = ie.from_user_id
JOIN community u2 ON u2.id = ie.to_user_id
ORDER BY ie.confidence DESC;

-- Check promoted connections
SELECT 
    u1.name as from_user,
    u2.name as to_user,
    c.type,
    c.created_at
FROM connections c
JOIN community u1 ON u1.id = c.from_user_id
JOIN community u2 ON u2.id = c.to_user_id
WHERE c.type = 'ble_proximity'
ORDER BY c.created_at DESC;
```

### 10. Troubleshooting

#### No beacons detected
- [ ] Location permission granted?
- [ ] Beacons powered on and broadcasting?
- [ ] beacon_key format matches exactly?
- [ ] Beacons marked is_active=true?

#### Pings not uploading
- [ ] Network connectivity OK?
- [ ] Supabase credentials correct?
- [ ] RLS policies allow insert?
- [ ] Check console logs for errors

#### No suggestions generated
- [ ] Users had Event Mode ON?
- [ ] Minimum 2 minutes overlap?
- [ ] Within 4-hour lookback window?
- [ ] Users near same beacon(s)?

#### Display names show UUIDs
- [ ] community table exists?
- [ ] user_id matches between tables?
- [ ] This is expected fallback if no profile

### 11. Production Checklist

Before deploying to production:

- [ ] Update Supabase credentials in AppEnvironment
- [ ] Register all physical beacon hardware
- [ ] Test with real devices (not simulator)
- [ ] Verify RLS policies are secure
- [ ] Set up database cleanup job for old presence_sessions
- [ ] Configure monitoring/alerts for RPC errors
- [ ] Test offline queueing behavior
- [ ] Verify battery impact is acceptable
- [ ] Update privacy policy with BLE disclosure
- [ ] Train event staff on beacon placement

### 12. Beacon Placement Tips

For optimal results:
- Place beacons 10-30 feet apart
- Mount at chest height (4-5 feet)
- Avoid metal surfaces (signal interference)
- Test RSSI range before event
- Have backup batteries
- Label physical beacons with location

### Support

See `BLE_PASSIVE_NETWORKING_GUIDE.md` for detailed documentation.
