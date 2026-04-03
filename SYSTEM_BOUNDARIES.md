Innovation Engine

Persistent network and intelligence layer

Nearify Web

Event acquisition and app handoff layer

Nearify iOS

Live event interaction layer

Shared backend

Supabase is the system of record for identity, events, attendees, connections, and derived data

auth.users.id = used for login/session/RLS checks
profiles.id = used for app-facing relationships, graph, social identity
event_attendees.profile_id = references profiles.id
connections.profile_a / profile_b = references profiles.id
