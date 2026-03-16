# Attendee UI Cleanup

## Problem

The attendee profile presentation was inconsistent across different surfaces:

1. **Network graph nodes** showed long bio/mission statements as single lines, making them unreadable
2. **Profile images** weren't being displayed in the most useful places
3. **No clear separation** between compact graph view and detailed profile view
4. **My QR screen** was at risk of being repurposed for viewing other attendees

## Solution

Separated attendee presentation into three distinct surfaces with appropriate detail levels:

### 1. Network Graph Nodes (Compact)
- Minimal, visually clean presentation
- Shows initials, name, and short subtitle only
- Never shows full bio/mission statements
- Uses `graphSubtitleText` helper

### 2. FindAttendeeView (Detailed)
- Rich attendee profile detail view
- Shows profile image or initials placeholder
- Displays name, subtitle, bio snippet, and tags
- Uses `detailSubtitleText` and `bioSnippet` helpers
- Maintains existing proximity guidance

### 3. My QR Screen (Current User Only)
- Remains focused on current user's identity
- Shows QR code, name, email, IDs
- Not repurposed for viewing other attendees

## Changes Made

### EventAttendeesService.swift - EventAttendee Model

Added separate display helpers for different contexts:

**`graphSubtitleText`** - Compact subtitle for network graph
- Shows first 1-2 skills: "Swift • React"
- Falls back to first 1-2 interests: "Music • Art"
- Never shows bio text
- Fallback: "Attending now"

**`detailSubtitleText`** - Richer subtitle for detail views
- Prefers short bio (<= 60 chars)
- Truncates long bio to 57 chars + "..."
- Falls back to skills (first 3): "Swift • React • Node.js"
- Falls back to interests (first 3)
- Fallback: "Attending now"

**`bioSnippet`** - Short bio for detail views
- Returns bio if <= 120 chars
- Truncates to 117 chars + "..." if longer
- Returns nil if no bio
- Limited to 2-3 lines max

**Enhanced logging:**
```
[Attendees]    ✓ Doug Hamilton (uuid)
[Attendees]       Avatar: yes, Bio: yes, Skills: 3, Interests: 2
[Attendees]       Graph subtitle: "Swift • Product Design"
[Attendees]       Detail subtitle: "Human centered design • AI • Founder"
```

### NetworkView.swift - Graph Visualization

**Updated attendee nodes:**
- Changed from `attendee.subtitleText` to `attendee.graphSubtitleText`
- Added `.truncationMode(.tail)` for clean truncation
- Maintains `.lineLimit(1)` for single-line display
- Shows initials in avatar circle
- Compact 9pt font for subtitle

**Result:** Graph nodes are now visually clean and readable, never showing long bio text.

### AttendeeCardView.swift - List Cards

**Updated card subtitle:**
- Changed from `attendee.subtitleText` to `attendee.detailSubtitleText`
- Shows richer information appropriate for list context
- Maintains compact horizontal layout
- Shows avatar image or initials placeholder

### FindAttendeeView.swift - Detail View

**Enhanced header section:**
- Added 80pt avatar with AsyncImage support
- Shows profile image if `avatarUrl` exists
- Falls back to initials placeholder with signal color
- Added `detailSubtitleText` below name
- Added `bioSnippet` (3 lines max) if available
- Added `topTags` chips if available

**Avatar implementation:**
- AsyncImage with loading states
- Graceful fallback to initials
- Uses signal color for visual consistency
- 80pt size for prominence

**Layout:**
```
Find Attendee (header)
[Avatar - 80pt circle]
Name (title, bold)
Subtitle (subheadline, gray)
Bio snippet (caption, 3 lines, gray)
[Tag] [Tag] [Tag] (chips)

[Radar visualization]
[Signal details]
```

### MyQRView.swift - No Changes

Remains focused on current user:
- QR code generation
- User's own name and profile
- Identity information
- Event status
- Not used for viewing other attendees

## Responsibility Separation

### Network Graph Mode
**Purpose:** Spatial visualization of attendees
**Shows:** Initials, name, compact subtitle (skills/interests only)
**Interaction:** Tap to open FindAttendeeView

### FindAttendeeView
**Purpose:** Detailed attendee profile + proximity guidance
**Shows:** Avatar, name, subtitle, bio snippet, tags, RSSI, proximity
**Interaction:** Main detail view for other attendees

### My QR Screen
**Purpose:** Current user's identity and QR sharing
**Shows:** QR code, user's own profile, event status
**Interaction:** Self-presentation, not for viewing others

## Data Flow

```
Supabase community table
  ↓ (SELECT id, name, image_url, bio, skills, interests)
AttendeeCommunityRow (flexible decoding)
  ↓
EventAttendee model
  ├─ graphSubtitleText → NetworkView nodes
  ├─ detailSubtitleText → AttendeeCardView, FindAttendeeView
  ├─ bioSnippet → FindAttendeeView
  ├─ topTags → FindAttendeeView, AttendeeCardView
  └─ initials → All views (avatar fallback)
```

## Test Plan

### Test Case 1: Graph Node with Skills
**Setup:** Attendee with skills: ["Swift", "React", "Node.js"]
**Expected:**
- Graph node shows: "Swift • React"
- No bio text visible
- Single line, cleanly truncated
- Logs: `Graph subtitle: "Swift • React"`

### Test Case 2: Graph Node with Interests Only
**Setup:** Attendee with interests: ["Music", "Art", "Coffee"], no skills
**Expected:**
- Graph node shows: "Music • Art"
- No bio text visible
- Logs: `Graph subtitle: "Music • Art"`

### Test Case 3: Graph Node with Long Bio
**Setup:** Attendee with bio: "Passionate software engineer with 10+ years..."
**Expected:**
- Graph node shows: "Attending now" (no skills/interests)
- Bio NOT shown in graph
- Logs: `Graph subtitle: "Attending now"`

### Test Case 4: FindAttendeeView with Full Profile
**Setup:** Attendee with image, bio, skills, interests
**Expected:**
- 80pt profile image displayed
- Name prominently shown
- Detail subtitle: short bio or skills
- Bio snippet: 2-3 lines max
- Tags: up to 3 chips
- Logs: `Avatar: yes, Detail subtitle: "Human centered design..."`

### Test Case 5: FindAttendeeView with No Image
**Setup:** Attendee without avatarUrl
**Expected:**
- 80pt initials placeholder (colored by signal strength)
- Initials: "DH" for "Doug Hamilton"
- Rest of profile shown normally
- Logs: `Avatar: no`

### Test Case 6: FindAttendeeView with Long Bio
**Setup:** Attendee with 200-char bio
**Expected:**
- Bio snippet truncated to ~120 chars
- Shows "..." at end
- Limited to 3 lines
- Detail subtitle may show truncated version

### Test Case 7: My QR Screen
**Setup:** Current user signed in
**Expected:**
- Shows current user's QR code
- Shows current user's name
- Shows current user's identity info
- Does NOT show other attendees
- Remains self-focused

## Benefits

1. **Readable graph** - No more long bio text cluttering nodes
2. **Clear hierarchy** - Compact graph → detailed FindAttendeeView
3. **Appropriate detail** - Each surface shows right amount of info
4. **Visual consistency** - Initials and avatars used appropriately
5. **Preserved functionality** - Event mode, presence, proximity all work
6. **Clear separation** - My QR stays focused on current user
7. **Better UX** - Users can scan graph quickly, tap for details

## Future Enhancements

- Add "Connect" button in FindAttendeeView
- Show mutual skills/interests highlighting
- Add profile edit flow from My QR
- Show connection history in FindAttendeeView
- Add filtering by skills/interests in graph view
