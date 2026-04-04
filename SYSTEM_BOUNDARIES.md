Nearify Web
Authentication, event acquisition, app handoff, organizer dashboard, and event intelligence

Nearify iOS
Live event participation, nearby discovery, identity confirmation, and connection capture

Shared Backend (Supabase)
System of record for identity, events, attendees, interactions, connections, and derived intelligence

Identity model
auth.users.id = authentication / session / RLS identity
profiles.id = product-facing identity
event_attendees.profile_id = references profiles.id
connections.profile_a / profile_b = references profiles.id
