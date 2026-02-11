# Unified Network Discovery - User Guide

## Welcome to Your Intelligent Network

The Unified Network Discovery system transforms how you explore and connect with your community. Instead of manually switching between "My Network" and "Discovery" modes, the system intelligently surfaces relevant connections when you need them.

## Core Concept

**Your network is always alive.** The visualization responds to:
- **Your activity** - What you're working on right now
- **Real-time presence** - Who's actively online
- **Relevance** - How connected people are to your interests
- **Temporal opportunities** - Upcoming deadlines and events

## Getting Started

### Enabling Unified Network

1. Press `Ctrl+Shift+U` (or `Cmd+Shift+U` on Mac) to open the admin panel
2. Check "Enable Unified Network"
3. Click "Reload Page"
4. Your network will now use the intelligent discovery system

### First Time Experience

When you first load the dashboard:

1. **Your network appears** - You'll see yourself at the center with your connections
2. **Nodes settle** - The physics simulation positions everyone naturally
3. **Discovery activates** - After a moment of calm, relevant suggestions appear

## Understanding the Visualization

### Node Types

**People (Circles with avatars)**
- Your connections and potential connections
- Size indicates connection strength
- Glow indicates real-time presence

**Projects (Hexagons)**
- Active projects in your themes
- Connected to participants
- Size indicates activity level

**Themes (Large circles)**
- Your interest areas
- Contain related projects and people
- Positioned around you

**Organizations (Squares)**
- Companies and institutions
- Connected to members

### Visual Indicators

**Node Size**
- Larger = More relevant to you
- Based on shared interests, projects, and interactions

**Glow Effect**
- Bright glow = Person is actively online
- Dim glow = Recent activity
- No glow = Offline

**Opacity**
- Full opacity = Highly relevant
- Faded = Less relevant or distant connection

**Position**
- Closer to you = Stronger connection
- Grouped by themes = Shared interests

## Discovery Mode

### How Discovery Works

Discovery activates automatically when:

1. **Network is calm** - No recent interactions for 5 seconds
2. **No strong actions** - No highly relevant nodes (effectivePull > 0.7)
3. **Relevant presence** - Someone interesting is online
4. **Temporal opportunity** - Upcoming deadline or event
5. **User preference** - Based on your discovery frequency setting

### Discovery Nodes

When discovery activates, you'll see 1-3 new nodes appear:

**Guided Nodes** (Thumb-reachable zone)
- Positioned within easy reach on mobile
- Maximum 3 at a time
- Maximum 1 presence-amplified node

**What Makes a Node Appear**
- High relevance score (shared interests, projects, themes)
- Real-time presence (they're online now)
- Temporal urgency (deadline approaching)
- Collaborative opportunity (working on similar things)

### Interacting with Discovery

**Tap/Click a Discovery Node**
- See available actions (Connect, Join Project, Explore Theme)
- Choose an action to engage
- Node becomes part of your network

**Dismiss a Node**
- Swipe or click dismiss
- Node fades away
- Won't reappear for 24 hours (unless relevance increases significantly)

**Ignore a Node**
- Don't interact with it
- After 30 seconds, it starts to fade
- Decays naturally over time

## Actions

### Connect with Someone

1. Tap/click a person node
2. Select "Connect"
3. Connection request sent
4. Node updates to show pending status

### Join a Project

1. Tap/click a project node
2. Select "Join Project"
3. You're added as a participant
4. Project moves closer to you

### Explore a Theme

1. Tap/click a theme node
2. Select "Explore Theme"
3. Theme added to your interests
4. Related projects and people become more visible

## Navigation

### Focus on a Node

**Tap/click any node** to:
- Center the view on that node
- Dim distant nodes
- Highlight connections

**Return to your position:**
- Tap the background
- Press `Ctrl+H` (or `Cmd+H` on Mac)
- Click your own node

### Search

1. Use the search bar at the top
2. Type a name, skill, or interest
3. Select a result
4. View focuses on that node

### Keyboard Shortcuts

- `Ctrl/Cmd + D` - Trigger discovery manually
- `Ctrl/Cmd + H` - Return to your network (home)
- `Ctrl/Cmd + P` - Open discovery preferences
- `Ctrl/Cmd + K` - Open search

## Preferences

### Discovery Frequency

Control how often discovery activates:

**Never** - Discovery disabled, manual only
**Rarely** - Every 10+ minutes
**Sometimes** - Every 5-10 minutes (default)
**Often** - Every 2-5 minutes
**Always** - Continuous discovery

### Reduced Motion

If you have motion sensitivity:
1. Enable "Reduced Motion" in preferences
2. Animations become instant
3. Physics still works, just faster

## Tips & Best Practices

### Maximize Discovery Value

1. **Keep your profile updated** - Accurate skills and interests improve relevance
2. **Join themes** - More themes = better discovery matches
3. **Be active** - Recent activity improves your visibility to others
4. **Engage with suggestions** - The system learns from your actions

### Mobile Usage

- **One-handed operation** - Discovery nodes appear in thumb-reachable zone
- **Haptic feedback** - Feel interactions on supported devices
- **Swipe to dismiss** - Quick gesture to remove suggestions
- **Pinch to zoom** - Explore your network at any scale

### Performance Tips

- **Close other tabs** - Frees up resources for smooth animation
- **Disable debug mode** - Reduces console logging overhead
- **Use modern browser** - Chrome, Firefox, Safari, or Edge (latest versions)

## Troubleshooting

### Discovery Not Appearing

**Check your settings:**
- Discovery frequency not set to "Never"
- Feature is enabled (Ctrl+Shift+U to check)

**Network conditions:**
- You have connections and themes
- There are potential matches in the community
- System has had time to calculate relevance

### Slow Performance

**Try these steps:**
1. Close other browser tabs
2. Disable debug mode
3. Reduce discovery frequency
4. Clear browser cache
5. Update your browser

### Nodes Not Responding

**Refresh the page:**
- Press F5 or Ctrl+R
- System will reinitialize

**Check your connection:**
- Ensure stable internet
- Real-time features require active connection

### Visual Issues

**Nodes overlapping:**
- Give the physics time to settle (15 seconds)
- Zoom out to see the full network
- Refresh if nodes are stuck

**Missing nodes:**
- Check if you're in "My Network" or "Discovery" mode
- Some nodes may be filtered by category
- Search for specific people/projects

## Privacy & Data

### What's Tracked

- **Your interactions** - Connections, projects, themes
- **Presence** - When you're actively using the platform
- **Relevance scores** - Calculated from your profile and activity

### What's NOT Tracked

- **Private messages** - Never used for discovery
- **Browsing history** - Only in-app activity
- **Location** - Unless you explicitly share it

### Controlling Your Visibility

- **Go offline** - Close the dashboard to stop presence tracking
- **Adjust profile** - Control what information is visible
- **Dismiss suggestions** - They won't see you were suggested

## Getting Help

### In-App Help

- **Hover over nodes** - See tooltips with information
- **First-time tooltips** - Appear once to guide you
- **Admin panel** - Press Ctrl+Shift+U for system info

### Support Resources

- **Documentation** - Check the docs folder
- **System diagnostics** - Run health check in admin panel
- **Error logs** - Check browser console (F12)

### Reporting Issues

If you encounter problems:

1. Open admin panel (Ctrl+Shift+U)
2. Click "Check System Health"
3. Note any errors in console (F12)
4. Contact support with details

## Advanced Features

### Manual Discovery Trigger

Press `Ctrl/Cmd + D` to manually trigger discovery:
- Useful when you want fresh suggestions
- Bypasses timing restrictions
- Shows up to 3 relevant nodes

### Debug Mode

Enable debug mode for detailed information:

1. Open admin panel (Ctrl+Shift+U)
2. Check "Debug Mode"
3. Console shows detailed logs
4. Performance metrics displayed

### System Health

Check system health anytime:

1. Open admin panel (Ctrl+Shift+U)
2. Click "Check System Health"
3. View error statistics
4. See performance metrics

## Frequently Asked Questions

**Q: Why don't I see any discovery suggestions?**
A: Discovery requires calm network activity, relevant matches in the community, and appropriate settings. Try manually triggering with Ctrl+D.

**Q: Can I disable discovery completely?**
A: Yes, set discovery frequency to "Never" in preferences. You can still manually trigger with Ctrl+D.

**Q: How is relevance calculated?**
A: Based on shared themes (20%), shared projects (30%), connection history (15%), interaction frequency (15%), and temporal opportunities (20%).

**Q: What does the glow mean?**
A: Glow indicates real-time presence. Bright glow = actively online, dim glow = recent activity, no glow = offline.

**Q: Why do nodes fade away?**
A: Discovery nodes decay over time if you don't interact with them. This keeps your network focused on active opportunities.

**Q: Can I see who suggested me to others?**
A: No, discovery is private. You won't know if you were suggested to someone unless they connect with you.

**Q: Does this work on mobile?**
A: Yes! The system is optimized for mobile with thumb-reachable positioning, haptic feedback, and touch gestures.

**Q: What happens if I dismiss someone?**
A: They won't reappear for 24 hours unless your relevance score increases significantly (>0.3).

**Q: Can I go back to the old view?**
A: Yes, disable "Unified Network" in the admin panel (Ctrl+Shift+U) and reload. The legacy synapse view will be used.

**Q: Is my data private?**
A: Yes, only your public profile information and in-app activity are used. Private messages and external browsing are never tracked.

## Feedback

We're constantly improving the unified network system. Your feedback helps us make it better:

- **What works well?** - Let us know what you love
- **What's confusing?** - Help us improve clarity
- **What's missing?** - Suggest new features
- **What's broken?** - Report bugs and issues

Thank you for being part of our intelligent community network!

---

**Version:** 1.0  
**Last Updated:** February 2026  
**For Developers:** See `UNIFIED_NETWORK_PROJECT_SUMMARY.md`
