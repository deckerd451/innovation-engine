-- Example beacon data for testing
-- Replace UUIDs and values with your actual beacon hardware

-- Create an example event group
INSERT INTO public.beacons (
    id,
    beacon_key,
    label,
    kind,
    group_id,
    is_active,
    meta,
    created_at
) VALUES 
(
    'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d'::uuid,
    'uuid:E2C56DB5-DFFB-48D2-B060-D0F5A71096E0|major:100|minor:1',
    'Main Hall Entrance',
    'event',
    'event-001'::uuid,
    true,
    '{"location": "Building A, Floor 1", "capacity": 200}',
    now()
),
(
    'b2c3d4e5-f6a7-4b5c-9d0e-1f2a3b4c5d6e'::uuid,
    'uuid:E2C56DB5-DFFB-48D2-B060-D0F5A71096E0|major:100|minor:2',
    'Workshop Room A',
    'event',
    'event-001'::uuid,
    true,
    '{"location": "Building A, Floor 2", "capacity": 50}',
    now()
),
(
    'c3d4e5f6-a7b8-4c5d-0e1f-2a3b4c5d6e7f'::uuid,
    'uuid:E2C56DB5-DFFB-48D2-B060-D0F5A71096E0|major:100|minor:3',
    'Networking Lounge',
    'event',
    'event-001'::uuid,
    true,
    '{"location": "Building A, Floor 1", "capacity": 100}',
    now()
),
(
    'd4e5f6a7-b8c9-4d5e-1f2a-3b4c5d6e7f8a'::uuid,
    'uuid:E2C56DB5-DFFB-48D2-B060-D0F5A71096E0|major:100|minor:4',
    'Food Court',
    'event',
    'event-001'::uuid,
    true,
    '{"location": "Building B, Floor 1", "capacity": 150}',
    now()
),
(
    'e5f6a7b8-c9d0-4e5f-2a3b-4c5d6e7f8a9b'::uuid,
    'uuid:E2C56DB5-DFFB-48D2-B060-D0F5A71096E0|major:100|minor:5',
    'Hacker Space',
    'event',
    'event-001'::uuid,
    true,
    '{"location": "Building B, Floor 2", "capacity": 75}',
    now()
)
ON CONFLICT (beacon_key) DO NOTHING;

-- Verify insertion
SELECT 
    label,
    beacon_key,
    kind,
    is_active
FROM public.beacons
WHERE is_active = true
ORDER BY label;

COMMENT ON TABLE public.beacons IS 'Example beacons for CharlestonHacks event';
