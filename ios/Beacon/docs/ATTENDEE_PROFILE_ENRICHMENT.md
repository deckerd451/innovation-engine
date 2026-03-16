# Attendee Profile Enrichment

## Problem

Event attendees were only showing minimal information:
- Name only
- No bio, skills, or interests
- No visual distinction beyond initials

The database contained rich profile data (bio, skills, interests, image_url), but:
1. EventAttendeesService only fetched `id`, `name`, `image_url`
2. EventAttendee model didn't include bio/skills/interests fields
3. UI only rendered name and single initial

## Solution

Upgraded the entire attendee pipeline to fetch and display richer community profile information.

### 1. Expanded Community Profile Query

**EventAttendeesService.swift** - `fetchCommunityProfiles()`
- Added `bio`, `skills`, `interests` to SELECT query
- Implemented flexible decoding for skills/interests (handles both string and array types)
- Added logging to show profile richness for each attendee

### 2. Enhanced EventAttendee Model

**EventAttendeesService.swift** - `EventAttendee` struct
- Added fields: `bio`, `skills`, `interests`
- Added computed properties:
  - `subtitleText`: Returns concise subtitle from bio/skills/interests
  - `topTags`: Returns up to 3 tags for display
  - `initials`: Returns proper initials (e.g., "DH" for "Doug Hamilton")

**Subtitle Logic:**
1. Prefer bio if short (<= 60 chars)
2. Truncate long bio to 57 chars + "..."
3. Fall back to skills (first 3, joined with " • ")
4. Fall back to interests (first 3, joined with " • ")
5. Default to "Attending now"

### 3. Flexible String/Array Decoding

**AttendeeCommunityRow** - Custom `init(from:)` decoder
- Handles database schema mismatch where skills/interests may be stored as:
  - Proper arrays: `["Swift", "React"]`
  - Comma-separated strings: `"Swift, React"`
  - Empty strings: `""`
  - NULL values
- Automatically converts strings to arrays by splitting on commas
- Never fails - defaults to empty array or nil

### 4. Updated UI Components

**NetworkView.swift** - Visualization mode
- Shows attendee initials (not just first letter)
- Shows name + subtitle below avatar
- Subtitle displays bio/skills/interests

**AttendeeCardView.swift** - NEW compact horizontal card
- 44pt circular avatar with image or initials placeholder
- Name (semibold)
- Subtitle from bio/skills/interests
- Up to 3 small tag chips from interests or skills
- Active status indicator
- Last seen timestamp

**NetworkView.swift** - Added list view mode
- Toggle between visualization and list modes
- List mode shows AttendeeCardView for each attendee
- Tappable cards open FindAttendeeView

### 5. Enhanced Logging

Added detailed logging in `fetchCommunityProfiles()` and attendee building:
```
[Attendees] ✓ Doug Hamilton (uuid)
[Attendees]    Bio: yes, Skills: 3, Interests: 2
[Attendees]    Image: yes, Bio: yes, Skills: 3, Interests: 2
[Attendees]    Subtitle: "Human centered design • AI • Founder"
```

## Files Changed

1. **ios/Beacon/Beacon/Services/EventAttendeesService.swift**
   - Expanded EventAttendee model with bio/skills/interests
   - Added computed properties for display helpers
   - Updated fetchCommunityProfiles() to fetch more fields
   - Added flexible decoding for AttendeeCommunityRow
   - Enhanced logging to show profile richness

2. **ios/Beacon/Beacon/Views/NetworkView.swift**
   - Added viewMode state (visualization vs list)
   - Added view mode picker in toolbar
   - Updated attendee nodes to show initials + subtitle
   - Added attendeeListView implementation

3. **ios/Beacon/Beacon/Views/AttendeeCardView.swift** (NEW)
   - Compact horizontal card component
   - Avatar with image loading or initials placeholder
   - Name, subtitle, and optional tags
   - Status indicator and last seen time
   - Reusable across different views

## How Profile Data Flows

```
Supabase community table
  ↓ (SELECT with bio, skills, interests)
AttendeeCommunityRow (flexible decoding)
  ↓ (convert to CommunityProfileInfo)
EventAttendee model (with computed properties)
  ↓ (render in UI)
NetworkView (visualization or list)
  ↓ (uses)
AttendeeCardView (compact card)
```

## Fallback Behavior

### No image_url
- Shows circular placeholder with initials
- Blue background with blue text

### No bio
- Builds subtitle from skills: "Swift • React • Node.js"
- Falls back to interests if no skills

### No skills
- Builds subtitle from interests: "Music • Art • Coffee"

### No useful fields
- Shows "Attending now" as subtitle
- No tags displayed

### String vs Array in Database
- Automatically converts comma-separated strings to arrays
- Handles empty strings gracefully
- Never fails on type mismatch

## Test Plan

### Test Case 1: Full Profile
**Setup:** Attendee with all fields populated
- Name: "Doug Hamilton"
- Bio: "Human centered design • AI • Founder"
- Skills: ["Swift", "Product Design", "AI"]
- Interests: ["Technology", "Design", "Innovation"]
- Image URL: valid URL

**Expected:**
- Avatar shows profile image
- Name: "Doug Hamilton"
- Subtitle: "Human centered design • AI • Founder"
- Tags: "Technology", "Design", "Innovation"
- Logs show: Image: yes, Bio: yes, Skills: 3, Interests: 3

### Test Case 2: No Image
**Setup:** Attendee without image_url
- Name: "Jane Smith"
- Bio: nil
- Skills: ["React", "TypeScript", "Node.js"]
- Image URL: nil

**Expected:**
- Avatar shows "JS" initials in blue circle
- Name: "Jane Smith"
- Subtitle: "React • TypeScript • Node.js"
- Tags: "React", "TypeScript", "Node.js"
- Logs show: Image: no, Bio: no, Skills: 3

### Test Case 3: No Bio, Has Interests
**Setup:** Attendee with interests but no bio or skills
- Name: "Alex Chen"
- Bio: nil
- Skills: nil
- Interests: ["Music", "Art", "Coffee"]

**Expected:**
- Avatar shows "AC" initials
- Name: "Alex Chen"
- Subtitle: "Music • Art • Coffee"
- Tags: "Music", "Art", "Coffee"
- Logs show: Bio: no, Skills: 0, Interests: 3

### Test Case 4: Minimal Data
**Setup:** Attendee with only name
- Name: "Sam Wilson"
- Bio: nil
- Skills: nil
- Interests: nil

**Expected:**
- Avatar shows "SW" initials
- Name: "Sam Wilson"
- Subtitle: "Attending now"
- No tags
- Logs show: Bio: no, Skills: 0, Interests: 0

### Test Case 5: Long Bio
**Setup:** Attendee with bio > 60 characters
- Bio: "Passionate software engineer with 10+ years of experience building scalable systems"

**Expected:**
- Subtitle: "Passionate software engineer with 10+ years of experie..."
- Truncated to 57 chars + "..."

### Test Case 6: Database String Format
**Setup:** Database has skills as comma-separated string
- Skills column: "Swift, React, Node.js" (string, not array)

**Expected:**
- Flexible decoder converts to ["Swift", "React", "Node.js"]
- Subtitle: "Swift • React • Node.js"
- No decode errors

## Benefits

1. **Richer attendee context** - Users see who people are, not just names
2. **Better networking decisions** - Skills/interests help identify relevant connections
3. **Professional presentation** - Bios and tags make profiles feel complete
4. **Flexible data handling** - Works with both string and array database formats
5. **Graceful degradation** - Missing fields don't break the UI
6. **Dual view modes** - Visualization for spatial context, list for detailed scanning
7. **Reusable components** - AttendeeCardView can be used in other contexts

## Future Enhancements

- Add profile detail sheet on card tap
- Show mutual interests/skills highlighting
- Add filtering by skills or interests
- Show connection strength or mutual connections
- Add "Connect" button directly on card
