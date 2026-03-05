# 🚀 Getting Started with BLE Passive Networking

## Quick Start (5 Minutes)

### Step 1: Verify Files (30 seconds)
```bash
cd ios
./VERIFICATION_SCRIPT.sh
```

This checks that all files are in place.

### Step 2: Setup Database (2 minutes)
```bash
./DATABASE_SETUP.sh
```

Or manually via Supabase Dashboard:
1. Go to SQL Editor
2. Copy/paste each file from `migrations/` folder
3. Execute in order: 001, 002, 003, 004

### Step 3: Configure App (1 minute)
Edit `InnovationEngine/App/AppEnvironment.swift`:
```swift
let supabaseURL = URL(string: "https://YOUR-PROJECT.supabase.co")!
let supabaseKey = "YOUR-ANON-KEY"
```

Get credentials from: Supabase Dashboard → Settings → API

### Step 4: Register Test Beacon (1 minute)
```sql
INSERT INTO beacons (beacon_key, label, kind, group_id, is_active)
VALUES (
    'uuid:E2C56DB5-DFFB-48D2-B060-D0F5A71096E0|major:100|minor:1',
    'Test Beacon',
    'event',
    gen_random_uuid(),
    true
);
```

### Step 5: Build & Test (30 seconds)
```bash
swift build
# Or open in Xcode and run
```

## What You Get

### 📱 New Features in App
- **Event Mode Tab**: Toggle BLE scanning on/off
- **Beacon Detection**: See closest beacon in real-time
- **Suggested Connections**: "People you were near" list
- **Privacy Controls**: Clear disclosure, opt-in only

### 🗄️ New Database Tables
- `beacons` - Registry of iBeacons
- `interaction_edges` - Suggested connections

### 🔧 New RPC Functions
- `upsert_presence_ping()` - Record proximity
- `infer_ble_edges()` - Generate suggestions
- `promote_edge_to_connection()` - Accept suggestion

## Testing Flow

### Local Test (1 Beacon)
1. Use beacon simulator app or physical beacon
2. Start Event Mode in app
3. Verify beacon appears in "Closest Beacon" card
4. Check database for presence pings:
   ```sql
   SELECT * FROM presence_sessions 
   WHERE context_type = 'beacon' 
   ORDER BY created_at DESC LIMIT 10;
   ```

### Event Test (Multiple Users)
1. Deploy 3-5 beacons at venue
2. Have 3-5 users start Event Mode
3. Users move between beacons (2-3 min each)
4. After 5-10 minutes, tap "Generate Suggestions"
5. Verify suggestions appear
6. Test Accept/Ignore/Block

## How It Works

### 1. Beacon Scanning
```
Physical iBeacon → CoreLocation → BLEService → Energy Calculation → Presence Ping
```

### 2. Energy Score
```
RSSI samples → Median → Base energy → Stability penalty → Final [0-10]
```

### 3. Debouncing
```
Max 1 ping per beacon every 5 seconds
OR if energy change >= 1.5
```

### 4. Inference
```
Presence overlaps → Calculate confidence → Create suggestions → Display in UI
```

### 5. Accept
```
User taps Accept → promote_edge_to_connection() → Insert into connections
```

## Key Concepts

### Beacon Key Format
```
uuid:<UUID>|major:<MAJOR>|minor:<MINOR>

Example:
uuid:E2C56DB5-DFFB-48D2-B060-D0F5A71096E0|major:100|minor:1
```

### Energy Calculation
```swift
energy = (medianRSSI + 90) / 4  // Base [0, 10]
energy -= min(stddev, 10) / 2   // Stability penalty
```

### Overlap Detection
```sql
-- Find users near same beacon at same time
-- Minimum 120 seconds overlap
-- Within 240 minutes lookback
```

## Documentation Map

### 📖 Complete Guide
**BLE_PASSIVE_NETWORKING_GUIDE.md** - Everything you need to know
- Architecture overview
- Database schema details
- RPC function implementations
- Energy calculation algorithm
- Testing procedures
- Troubleshooting

### ✅ Setup Steps
**SETUP_CHECKLIST.md** - Step-by-step instructions
- Database setup
- App configuration
- Beacon registration
- Testing procedures
- Production checklist

### 🔧 Hardware Setup
**BEACON_CONFIGURATION_GUIDE.md** - Physical beacon setup
- Beacon key format
- Hardware options
- Configuration steps
- Placement guidelines
- Testing beacons

### ⚡ Quick Lookups
**QUICK_REFERENCE.md** - Developer cheat sheet
- Database schemas
- RPC signatures
- Swift APIs
- Common queries

### 🏗️ Architecture
**ARCHITECTURE_DIAGRAM.md** - Visual diagrams
- System overview
- Data flow
- Service architecture
- State machines

### 📊 System Flow
**SYSTEM_FLOW_DIAGRAM.md** - Complete flow diagrams
- User journey
- Component interactions
- State transitions
- Performance metrics

## Common Commands

### Check Active Beacons
```sql
SELECT beacon_key, label, is_active 
FROM beacons 
WHERE is_active = true;
```

### View Recent Pings
```sql
SELECT 
    u.name,
    b.label,
    ps.energy,
    ps.created_at
FROM presence_sessions ps
JOIN community u ON u.id = ps.user_id
JOIN beacons b ON b.id = ps.context_id
WHERE ps.context_type = 'beacon'
ORDER BY ps.created_at DESC
LIMIT 20;
```

### Check Suggestions
```sql
SELECT 
    u1.name as user1,
    u2.name as user2,
    ie.overlap_seconds / 60 as overlap_minutes,
    ie.confidence
FROM interaction_edges ie
JOIN community u1 ON u1.id = ie.from_user_id
JOIN community u2 ON u2.id = ie.to_user_id
WHERE ie.status = 'suggested'
ORDER BY ie.confidence DESC;
```

## Troubleshooting

### No beacons detected
- ✓ Location permission granted?
- ✓ Beacons powered on?
- ✓ beacon_key format exact?
- ✓ Beacons marked is_active=true?

### Pings not uploading
- ✓ Network connectivity?
- ✓ Supabase credentials correct?
- ✓ RLS policies allow insert?
- ✓ Check console logs?

### No suggestions
- ✓ Event Mode was ON?
- ✓ Minimum 2 minutes overlap?
- ✓ Within 4-hour lookback?
- ✓ Users near same beacon?

## Performance

- **Battery**: ~6-12% per hour (foreground only)
- **Network**: ~3.6 KB/minute (3 beacons)
- **Scan Rate**: Every 1.5 seconds
- **Upload Rate**: ~36 pings/minute

## Privacy

- ✅ Event Mode is opt-in
- ✅ Clear privacy disclosure
- ✅ No raw RSSI shown
- ✅ User controls all suggestions
- ✅ Stop button immediately halts

## Next Steps

1. ✅ Run verification script
2. ✅ Setup database
3. ✅ Configure app
4. ✅ Register beacons
5. ✅ Build and test
6. 🚀 Deploy at event!

## Support

- **Questions?** See documentation in `ios/` directory
- **Issues?** Check console logs and troubleshooting guide
- **Testing?** Follow procedures in SETUP_CHECKLIST.md

## Ready to Go! 🎉

You now have a complete BLE passive networking system. Start with the verification script and follow the steps above.

Good luck with your event!
