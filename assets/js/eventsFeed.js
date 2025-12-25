/**
 * CharlestonHacks — Live Events Scraper
 * Fetches real-time events using the Cloudflare Worker endpoint
 * 
 * This module is designed to work with the modal system.
 */

console.log("📜 eventsFeed.js module loaded");

// Use the Cloudflare Worker endpoint (more reliable than CORS proxies)
const FEED_URL = "https://charlestonhacks-events-worker.deckerdb26354.workers.dev";

/**
 * Main function to load and display events
 * Call this function when the events modal is opened
 */
async function loadEvents() {
    console.log("🔍 loadEvents() called");
    
    const list = document.getElementById("events-list");
    console.log("📋 events-list element:", list);
    
    if (!list) {
        console.error("❌ Could not find #events-list element!");
        return;
    }

    // Show loading state
    list.innerHTML = `<p style="opacity:.7;">Searching for local happenings...</p>`;
    console.log("⏳ Loading message displayed");

    try {
        console.log("🔄 Fetching from Cloudflare Worker:", FEED_URL);
        
        const response = await fetch(FEED_URL);
        console.log("📡 Response status:", response.status);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log("📦 Received data:", data);
        
        // Extract events array
        const events = data.events || data;
        console.log(`📰 Found ${events.length} events`);

        if (!events || events.length === 0) {
            list.innerHTML = "<p>No upcoming events found. Check back later!</p>";
            console.log("ℹ️ No events found");
            return;
        }

        // Clear loader and display events
        list.innerHTML = "";
        console.log("🧹 Cleared loading message, rendering events");

        // Limit to 10 most recent events
        const eventsToShow = events.slice(0, 10);

        eventsToShow.forEach((event, index) => {
            const title = event.title || "Event";
            const link = event.link || "#";
            const description = event.description || "";
            const location = event.location || "";
            
            // Format date
            let dateStr = "Upcoming";
            if (event.startDate) {
                try {
                    const date = new Date(event.startDate);
                    dateStr = date.toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        weekday: 'short'
                    });
                } catch (e) {
                    console.warn("Could not parse date:", event.startDate);
                }
            }

            const eventEl = document.createElement("div");
            eventEl.style.marginBottom = "1.5rem";
            eventEl.style.paddingBottom = "1rem";
            eventEl.style.borderBottom = "1px solid #333";
            
            eventEl.innerHTML = `
                <div style="font-size: 0.75rem; color: #00e0ff; margin-bottom: 4px; text-transform: uppercase;">${dateStr}</div>
                <h3 style="margin: 0 0 8px 0; font-size: 1.1rem;">
                    <a href="${link}" target="_blank" rel="noopener noreferrer" 
                       style="color: #fff; text-decoration: none; border-bottom: 1px solid #444; transition: border-color 0.3s;"
                       onmouseover="this.style.borderColor='#00e0ff'" 
                       onmouseout="this.style.borderColor='#444'">${title}</a>
                </h3>
                ${location ? `<p style="font-size: 0.85rem; color: #aaa; margin: 4px 0;">📍 ${location}</p>` : ''}
                ${description ? `<p style="font-size: 0.9rem; color: #888; margin-top: 5px; line-height: 1.4;">${description.substring(0, 150)}${description.length > 150 ? '...' : ''}</p>` : ''}
            `;
            list.appendChild(eventEl);
            
            if (index === 0) {
                console.log(`✅ First event rendered: ${title}`);
            }
        });
        
        console.log(`✅ Successfully loaded ${eventsToShow.length} events`);

    } catch (err) {
        console.error("❌ Error loading events:", err);
        list.innerHTML = `<p>Unable to reach the event feed. Please try again later.</p>`;
    }
}

// Make loadEvents available globally so the modal can call it
window.loadEvents = loadEvents;

// Export for module usage
export { loadEvents };
