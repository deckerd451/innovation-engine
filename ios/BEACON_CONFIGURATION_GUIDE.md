# Beacon Configuration Guide

## Overview

This guide explains how to configure iBeacons for CharlestonHacks Innovation Engine BLE Passive Networking.

## Beacon Key Format

The app expects beacons registered with this exact format:

```
uuid:<UUID>|major:<MAJOR>|minor:<MINOR>
```

### Components

- **UUID**: 128-bit identifier (same for all beacons in your deployment)
- **Major**: 16-bit number (typically same for all beacons at one event)
- **Minor**: 16-bit number (unique per beacon location)

### Example

```
uuid:E2C56DB5-DFFB-48D2-B060-D0F5A71096E0|major:100|minor:1
```

## Choosing Your UUID

### Option 1: Use Standard UUID (Recommended)

Use a well-known UUID for easier testing:

```
E2C56DB5-DFFB-48D2-B060-D0F5A71096E0
```

This is Apple's example UUID and works with most beacon simulators.

### Option 2: Generate Custom UUID

For production, generate your own:

```bash
# macOS/Linux
uuidgen

# Or use online generator
# https://www.uuidgenerator.net/
```

Keep this UUID consistent across all your beacons.

## Major/Minor Numbering Scheme

### Recommended Scheme

```
Major: Event ID (100-999)
Minor: Location ID (1-999)
```

### Example: CharlestonHacks 2024

```
Event: CharlestonHacks 2024 (Major: 100)

Locations:
- Main Hall Entrance    → Minor: 1
- Workshop Room A       → Minor: 2
- Workshop Room B       → Minor: 3
- Networking Lounge     → Minor: 4
- Food Court            → Minor: 5
- Hacker Space          → Minor: 6
```

### Example: Multiple Events

```
CharlestonHacks 2024 Spring → Major: 100
CharlestonHacks 2024 Fall   → Major: 101
CharlestonHacks 2025 Spring → Major: 102
```

## Database Registration

### Single Beacon

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
    'event-charlestohacks-2024-spring'::uuid,
    true,
    jsonb_build_object(
        'location', 'Building A, Floor 1',
        'capacity', 200,
        'description', 'Primary entrance and registration area'
    ),
    now()
);
```

### Bulk Registration

```sql
-- Create event group ID first
DO $$
DECLARE
    event_group_id uuid := 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d'::uuid;
BEGIN
    INSERT INTO public.beacons (id, beacon_key, label, kind, group_id, is_active, meta, created_at)
    VALUES
        (gen_random_uuid(), 'uuid:E2C56DB5-DFFB-48D2-B060-D0F5A71096E0|major:100|minor:1', 'Main Hall Entrance', 'event', event_group_id, true, '{"location": "Building A, Floor 1"}', now()),
        (gen_random_uuid(), 'uuid:E2C56DB5-DFFB-48D2-B060-D0F5A71096E0|major:100|minor:2', 'Workshop Room A', 'event', event_group_id, true, '{"location": "Building A, Floor 2"}', now()),
        (gen_random_uuid(), 'uuid:E2C56DB5-DFFB-48D2-B060-D0F5A71096E0|major:100|minor:3', 'Workshop Room B', 'event', event_group_id, true, '{"location": "Building A, Floor 2"}', now()),
        (gen_random_uuid(), 'uuid:E2C56DB5-DFFB-48D2-B060-D0F5A71096E0|major:100|minor:4', 'Networking Lounge', 'event', event_group_id, true, '{"location": "Building A, Floor 1"}', now()),
        (gen_random_uuid(), 'uuid:E2C56DB5-DFFB-48D2-B060-D0F5A71096E0|major:100|minor:5', 'Food Court', 'event', event_group_id, true, '{"location": "Building B, Floor 1"}', now()),
        (gen_random_uuid(), 'uuid:E2C56DB5-DFFB-48D2-B060-D0F5A71096E0|major:100|minor:6', 'Hacker Space', 'event', event_group_id, true, '{"location": "Building B, Floor 2"}', now())
    ON CONFLICT (beacon_key) DO NOTHING;
END $$;
```

## Physical Beacon Setup

### Hardware Options

1. **Estimote Beacons** - Popular, easy to configure
2. **Kontakt.io Beacons** - Enterprise-grade
3. **RadBeacon** - Affordable option
4. **DIY Raspberry Pi** - Custom solution

### Configuration Steps

1. **Power on beacon**
2. **Connect via manufacturer app**
3. **Set UUID**: `E2C56DB5-DFFB-48D2-B060-D0F5A71096E0`
4. **Set Major**: `100` (or your event ID)
5. **Set Minor**: `1` (or your location ID)
6. **Set TX Power**: -12 dBm to -4 dBm (medium range)
7. **Set Advertising Interval**: 100-200ms
8. **Save and deploy**

### Placement Guidelines

- **Height**: 4-5 feet (chest height)
- **Spacing**: 10-30 feet apart
- **Avoid**: Metal surfaces, microwaves, Wi-Fi routers
- **Mount**: Secure with adhesive or bracket
- **Label**: Physical label with location name

## Testing Beacons

### iOS Beacon Scanner Apps

1. **Locate Beacon** (Free)
2. **BeaconScope** (Free)
3. **iBeacon Detector** (Free)

### Verify Configuration

1. Open scanner app
2. Look for your UUID
3. Verify Major/Minor match
4. Check RSSI values (-90 to -40 typical)
5. Test range (should detect 10-30 feet)

### Test with Innovation Engine App

1. Register beacon in database
2. Launch app and sign in
3. Navigate to Event Mode
4. Tap "Start Event Mode"
5. Verify beacon appears in "Closest Beacon" card
6. Check signal strength indicator

## Beacon Simulator (for Development)

### iOS Simulator App

Use "Beacon Simulator" app to test without hardware:

1. Download from App Store
2. Create new beacon
3. Set UUID, Major, Minor
4. Start broadcasting
5. Test with Innovation Engine app

### macOS Beacon Simulator

```bash
# Install beacon-simulator
npm install -g beacon-simulator

# Start broadcasting
beacon-simulator -u E2C56DB5-DFFB-48D2-B060-D0F5A71096E0 -M 100 -m 1
```

## Metadata Schema

The `meta` JSONB field can store additional information:

```json
{
  "location": "Building A, Floor 1",
  "capacity": 200,
  "description": "Main entrance and registration",
  "coordinates": {
    "lat": 32.7765,
    "lng": -79.9311
  },
  "floor_plan_url": "https://example.com/floor1.pdf",
  "contact": "venue@example.com"
}
```

## Managing Beacons

### Activate/Deactivate

```sql
-- Deactivate beacon (app will stop monitoring)
UPDATE public.beacons 
SET is_active = false 
WHERE beacon_key = 'uuid:...|major:100|minor:1';

-- Reactivate
UPDATE public.beacons 
SET is_active = true 
WHERE beacon_key = 'uuid:...|major:100|minor:1';
```

### Update Label

```sql
UPDATE public.beacons 
SET label = 'New Label' 
WHERE beacon_key = 'uuid:...|major:100|minor:1';
```

### Update Metadata

```sql
UPDATE public.beacons 
SET meta = meta || '{"new_field": "value"}'::jsonb
WHERE beacon_key = 'uuid:...|major:100|minor:1';
```

### Delete Beacon

```sql
-- Soft delete (recommended)
UPDATE public.beacons 
SET is_active = false 
WHERE beacon_key = 'uuid:...|major:100|minor:1';

-- Hard delete (use with caution)
DELETE FROM public.beacons 
WHERE beacon_key = 'uuid:...|major:100|minor:1';
```

## Event Workflow

### Before Event

1. Deploy physical beacons
2. Test each beacon with scanner app
3. Register all beacons in database
4. Verify app detects all beacons
5. Test with 2-3 devices

### During Event

1. Monitor beacon battery levels
2. Check app logs for issues
3. Have backup beacons ready
4. Verify presence pings uploading

### After Event

1. Deactivate beacons in database
2. Collect physical beacons
3. Run inference to generate suggestions
4. Archive presence data if needed

## Troubleshooting

### Beacon not detected

- Check battery level
- Verify UUID/Major/Minor exact match
- Test with scanner app first
- Check beacon is broadcasting (LED indicator)
- Move closer (within 10 feet)

### Weak signal

- Check TX power setting
- Avoid metal surfaces
- Check for interference
- Replace battery
- Adjust placement height

### Wrong beacon detected

- Verify beacon_key format exact
- Check for duplicate Major/Minor
- Ensure is_active = true
- Clear app cache and restart

### Database mismatch

```sql
-- Verify beacon exists
SELECT * FROM public.beacons 
WHERE beacon_key = 'uuid:...|major:100|minor:1';

-- Check active beacons
SELECT beacon_key, label, is_active 
FROM public.beacons 
WHERE is_active = true;
```

## Best Practices

1. **Use consistent UUID** across all beacons
2. **Document Major/Minor scheme** before deployment
3. **Label physical beacons** with location
4. **Test before event** with multiple devices
5. **Have backup beacons** ready
6. **Monitor battery levels** during event
7. **Archive data** after event
8. **Update database** when moving beacons

## Security Considerations

### UUID Privacy

- UUIDs are broadcast publicly
- Anyone can detect your beacons
- Use random UUIDs for privacy
- Rotate UUIDs periodically if needed

### Database Security

- Restrict beacon insert/update to admins
- Allow public read for active beacons only
- Use RLS policies
- Audit beacon changes

### Physical Security

- Secure beacon mounting
- Use tamper-evident seals
- Monitor for unauthorized beacons
- Have beacon recovery plan

## Cost Estimation

### Hardware Costs

- **Estimote**: $20-30 per beacon
- **Kontakt.io**: $15-25 per beacon
- **RadBeacon**: $10-20 per beacon
- **DIY Raspberry Pi**: $35+ per beacon

### Recommended Quantities

- Small event (50-100 people): 3-5 beacons
- Medium event (100-500 people): 5-10 beacons
- Large event (500+ people): 10-20 beacons

### Battery Life

- Typical: 1-2 years (depends on settings)
- High-frequency: 6-12 months
- Replaceable batteries: CR2032 or AA

## Support

For beacon configuration issues:
1. Check manufacturer documentation
2. Test with scanner app first
3. Verify database registration
4. Review app console logs
5. See `BLE_PASSIVE_NETWORKING_GUIDE.md` for app-side troubleshooting
