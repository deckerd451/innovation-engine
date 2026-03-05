# Event Mode Gravity - Quick Start Guide

## What is Event Mode Gravity?

A real-time visualization overlay for the desktop Synapse graph that shows:
- **Beacon** at center (event location)
- **Attendees** clustering around beacon
- **Suggested connections** based on proximity
- **One-click promotion** to real connections

## Quick Start

### 1. Enable Event Mode

Click the **satellite dish icon** (🛰️) in the top-right header.

The graph will transform:
- Beacon appears at center
- Active attendees cluster around it
- Dashed lines show suggested connections

### 2. View Attendees

Attendees appear as nodes orbiting the beacon:
- **Glow intensity** = presence energy (how active they are)
- **Pulsing effect** = "here now" indicator
- Nodes disappear when presence expires

### 3. Promote Connections

Click any **dashed line** between attendees:
- Confirms you want to connect
- Promotes to real connection
- Line becomes solid

### 4. Disable Event Mode

Click the **satellite dish icon** again.

The graph returns to normal:
- Beacon removed
- Original layout restored
- Suggested edges hidden

## Visual Guide

### Normal Mode
```
    👤 ─── 👤
   /         \
  👤    👤    👤
   \         /
    👤 ─── 👤
```

### Event Mode Active
```
        🛰️ (Beacon)
       /  |  \
      /   |   \
    👤   👤   👤  (Attendees)
     \   |   /
      \ ┊┊ /     (┊┊ = Suggested edges)
       👤👤
```

### After Promotion
```
        🛰️ (Beacon)
       /  |  \
      /   |   \
    👤   👤   👤  (Attendees)
     \   |   /
      \ ── /     (── = Real connections)
       👤👤
```

## Button States

### Inactive (Purple)
```
┌────────┐
│   🛰️   │  Click to enable
└────────┘
```

### Active (Pulsing Purple)
```
┌────────┐
│  ✨🛰️✨ │  Click to disable
└────────┘  (pulsing animation)
```

## Data Flow

```
1. Enable Event Mode
   ↓
2. Load beacon from database
   ↓
3. Start polling:
   - Active presence (5s)
   - Suggested edges (10s)
   - Edge inference (20s)
   ↓
4. Display attendees + suggestions
   ↓
5. User clicks dashed edge
   ↓
6. Promote to connection
   ↓
7. Edge becomes solid
```

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| Click satellite icon | Toggle Event Mode |
| Click dashed edge | Promote connection |
| Esc | Close any modal |

## Troubleshooting

### "Event Mode Gravity not available"
- Refresh the page
- Check console for errors
- Ensure script loaded: `assets/js/eventModeGravity.js`

### No attendees showing
- Verify people are at the event
- Check they have Event Mode enabled (mobile or web)
- Wait 5 seconds for first refresh

### No suggested edges
- Attendees need 2+ minutes overlap
- Wait 20 seconds for inference to run
- Check if attendees are actually near each other

### Can't promote edge
- Check you're logged in
- Verify edge still exists (may have expired)
- Try refreshing the page

## API Reference

### Enable
```javascript
await window.EventModeGravity.enableEventMode({
  beaconId: '3a4f2cfe-eb2e-4d17-abc3-a075f38b713b',
  groupId: 'f270cbe4-fbef-457c-a685-48f83b5492b8'
});
```

### Disable
```javascript
window.EventModeGravity.disableEventMode();
```

### Check State
```javascript
const isActive = window.EventModeGravity.isActive();
```

### Get Details
```javascript
const state = window.EventModeGravity.getState();
console.log(state);
// {
//   isActive: true,
//   beacon: { id, label, group_id },
//   attendeeCount: 5,
//   suggestedEdgeCount: 3,
//   attendees: [...],
//   suggestedEdges: [...]
// }
```

### Promote Edge
```javascript
await window.EventModeGravity.promoteSuggestedEdge(edgeId);
```

## Configuration

Default beacon (hardcoded for now):
```javascript
beaconId: '3a4f2cfe-eb2e-4d17-abc3-a075f38b713b'
groupId: 'f270cbe4-fbef-457c-a685-48f83b5492b8'
```

To use different beacon, edit `assets/js/ble-ui.js`:
```javascript
function toggleEventModeGravity() {
  // Change these values
  const beaconId = 'your-beacon-id';
  const groupId = 'your-group-id';
  
  await window.EventModeGravity.enableEventMode({ beaconId, groupId });
}
```

## Best Practices

### For Event Organizers
1. Deploy beacons at venue
2. Register beacons in database
3. Share beacon ID with attendees
4. Enable Event Mode on main display
5. Monitor attendance in real-time

### For Attendees
1. Enable Event Mode on mobile or web
2. Keep app open during event
3. Review suggested connections after event
4. Accept connections you'd like to follow up with

### For Developers
1. Check console for debug logs
2. Monitor polling intervals
3. Verify RPC calls succeed
4. Test with multiple users
5. Profile performance with large events

## Performance Tips

### For Large Events (100+ attendees)
- Increase polling intervals
- Reduce cluster distance
- Disable debug mode
- Use WebGL rendering (future)

### For Small Events (<20 attendees)
- Decrease polling intervals
- Increase cluster distance
- Enable debug mode
- Use detailed tooltips

## Security Notes

- All data queries use RLS (Row Level Security)
- Presence data expires automatically (25s TTL)
- Suggestions require mutual overlap
- Promotions require authentication
- No PII exposed in graph

## Privacy

- Presence is opt-in (Event Mode must be enabled)
- Energy values are anonymous (0-1 scale)
- Suggestions are private until accepted
- Users control who they connect with
- Data deleted after event (7 days)

## Support

### Need Help?
- Check full docs: `docs/EVENT_MODE_GRAVITY.md`
- Review console logs (F12)
- Contact event organizer
- Report bugs via GitHub

### Feedback
- What worked well?
- What was confusing?
- What features would you like?
- Any bugs or issues?

---

**Quick Start Version**: 1.0  
**Last Updated**: March 5, 2026  
**For Full Documentation**: See `EVENT_MODE_GRAVITY.md`
