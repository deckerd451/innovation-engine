# BLE Passive Networking User Guide

## What is BLE Passive Networking?

BLE (Bluetooth Low Energy) Passive Networking helps you discover people you were physically near at events, without actively exchanging contact information.

## How It Works

1. **Event Setup**: Event organizers place Bluetooth beacons around the venue
2. **Event Mode**: You enable "Event Mode" in the app during the event
3. **Automatic Detection**: Your device detects nearby beacons and records anonymous presence
4. **Suggestions**: After the event, you see "People you were near" suggestions
5. **Connect**: You decide whether to connect with them

## Getting Started

### For iOS Users

1. Open the CharlestonHacks Innovation Engine iOS app
2. Tap the **Event Mode** button (broadcast tower icon)
3. Accept the privacy notice
4. Keep the app open during the event
5. After the event, tap **Suggestions** to see people you were near

### For Web Users (Chrome/Edge on Android/Desktop)

1. Open the web app in Chrome or Edge browser
2. Click the **Event Mode** button (broadcast tower icon) in the header
3. Accept the Bluetooth permission prompt
4. Accept the privacy notice
5. Keep the browser tab open during the event
6. After the event, click **Suggestions** to see people you were near

**Note**: Safari and Firefox don't support Web Bluetooth. iOS users should use the native app.

## Privacy & Control

### What We Record
- Anonymous proximity signals (which beacon you're near)
- Signal strength (how close you are)
- Timestamps (when you were there)

### What We DON'T Record
- Your exact location
- Who you're near (until you both accept the suggestion)
- Any personal information beyond what's in your profile

### Your Control
- **Opt-in**: Event Mode is completely optional
- **Stop Anytime**: Tap Event Mode again to stop scanning
- **Review Suggestions**: You see suggestions before connecting
- **Accept/Ignore/Block**: You decide who to connect with
- **No Obligation**: Ignoring a suggestion doesn't notify the other person

## Using Event Mode

### Starting Event Mode

**iOS**:
1. Tap the Event Mode button (broadcast tower icon)
2. Accept the privacy notice (first time only)
3. The button will glow green when active
4. You'll see the closest beacon name and signal strength

**Web**:
1. Click the Event Mode button (broadcast tower icon)
2. Accept the Bluetooth permission (first time only)
3. Accept the privacy notice (first time only)
4. The button will glow green when active
5. You'll see a status indicator at the bottom showing the closest beacon

### During the Event

- Keep the app/browser open
- Event Mode works in the foreground only
- You can minimize the app briefly, but it works best when active
- Battery usage is minimal (BLE is very efficient)

### Stopping Event Mode

- Tap/click the Event Mode button again
- The button will return to normal color
- Scanning stops immediately

## Viewing Suggestions

### Generating Suggestions

After the event (or anytime):

1. Tap/click the **Suggestions** button (people icon)
2. Tap/click **Generate New Suggestions**
3. Wait a few seconds while the system analyzes overlaps
4. Suggestions appear sorted by confidence and overlap time

### Understanding Suggestions

Each suggestion shows:
- **Name**: The person's display name
- **Overlap Time**: How many minutes you were near each other
- **Confidence**: How confident we are about the overlap (0-100%)

### Taking Action

For each suggestion, you can:

- **Accept**: Creates a connection and adds them to your network
- **Ignore**: Removes the suggestion (no notification sent)
- **Block**: Removes the suggestion and prevents future suggestions from this person

## Tips for Best Results

### Before the Event
- Charge your device
- Update the app to the latest version
- Test Event Mode briefly to ensure it works

### During the Event
- Enable Event Mode when you arrive
- Keep the app/browser open
- Move around the venue naturally
- Don't worry about the app - it works automatically

### After the Event
- Wait at least 2 hours before generating suggestions (gives time for data to sync)
- Generate suggestions within 24 hours for best results
- Review suggestions thoughtfully
- Accept connections you'd like to follow up with

## Troubleshooting

### Event Mode Won't Start

**iOS**:
- Check Bluetooth is enabled in Settings
- Check Location Services are enabled (required for BLE)
- Restart the app

**Web**:
- Use Chrome or Edge browser (Safari/Firefox not supported)
- Check Bluetooth is enabled on your device
- Grant Bluetooth permission when prompted
- Try refreshing the page

### No Suggestions Appearing

- Make sure Event Mode was active during the event
- Wait at least 2 hours after the event
- Check that other attendees also used Event Mode
- Try generating suggestions again

### Suggestions Seem Inaccurate

- Confidence scores below 50% may be less reliable
- Very short overlaps (< 5 minutes) may be coincidental
- Use your judgment - you can always ignore suggestions

### Battery Drain

- BLE is very efficient, but keeping the app open uses battery
- Consider bringing a portable charger to events
- You can stop Event Mode during breaks to save battery

## Privacy & Security

### Data Storage
- Presence pings are stored for 7 days, then automatically deleted
- Suggestions are stored until you take action (accept/ignore/block)
- Connections are permanent (until you remove them)

### Data Sharing
- We never share your location or presence data with third parties
- Event organizers can see aggregate attendance, not individual data
- Other users only see suggestions if there's mutual overlap

### Opting Out
- You can delete your account anytime from Settings
- All your presence data and suggestions will be deleted
- Existing connections will remain (but you'll be removed from their network)

## For Event Organizers

### Setting Up Beacons

1. Purchase Bluetooth beacons (iBeacon compatible)
2. Configure each beacon with a unique UUID/Major/Minor
3. Register beacons in the admin panel
4. Place beacons around the venue (one per room/area)
5. Test with a few devices before the event

### Best Practices

- Place beacons at chest height for best signal
- Use one beacon per distinct area (room, booth, etc.)
- Label beacons clearly in the admin panel
- Test beacon coverage before the event
- Have backup batteries for beacons

### During the Event

- Monitor beacon status in the admin panel
- Replace batteries if needed
- Encourage attendees to enable Event Mode
- Provide charging stations for attendees

### After the Event

- Leave beacons active for 24 hours (for late suggestion generation)
- Review analytics in the admin panel
- Deactivate beacons after the event
- Collect feedback from attendees

## Support

### Need Help?

- Check this guide first
- Contact event organizers for beacon-related issues
- Contact CharlestonHacks support for app issues
- Report bugs via the app's feedback form

### Feedback

We're always improving! Let us know:
- What worked well
- What was confusing
- What features you'd like to see
- Any bugs or issues you encountered

---

**Happy Networking!** 🎉

Use BLE Passive Networking to discover meaningful connections at your next event.
