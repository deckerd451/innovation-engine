/**
 * CharlestonHacks — Live Events Scraper
 * Fetches real-time events from Charleston City Paper RSS.
 * 
 * This module is designed to work with the modal system.
 * It only loads events when explicitly called.
 */

console.log("📜 eventsFeed.js module loaded");

// Source: Charleston City Paper RSS feed
const RSS_URL = "https://charlestoncitypaper.com/events/feed/";

// Multiple CORS proxy options (try in order for reliability)
const PROXIES = [
    `https://corsproxy.io/?${encodeURIComponent(RSS_URL)}`,
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(RSS_URL)}`,
    `https://api.allorigins.win/get?url=${encodeURIComponent(RSS_URL)}`
];

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

    // Try each proxy until one works
    for (let i = 0; i < PROXIES.length; i++) {
        console.log(`🔄 Trying proxy ${i + 1}/${PROXIES.length}`);
        
        try {
            const response = await fetch(PROXIES[i]);
            console.log(`📡 Proxy ${i + 1} response status:`, response.status);
            
            if (!response.ok) {
                console.log(`⚠️ Proxy ${i + 1} failed with status ${response.status}`);
                continue;
            }
            
            let xmlContent;
            
            // Handle different proxy response formats
            if (PROXIES[i].includes('allorigins')) {
                const data = await response.json();
                xmlContent = data.contents;
                console.log(`📦 Proxy ${i + 1} returned JSON format`);
            } else {
                xmlContent = await response.text();
                console.log(`📦 Proxy ${i + 1} returned text format`);
            }
            
            console.log(`📄 XML content length: ${xmlContent.length} characters`);
            
            // Parse the XML
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlContent, "text/xml");
            
            // Check for parsing errors
            const parserError = xmlDoc.querySelector("parsererror");
            if (parserError) {
                console.log(`❌ Proxy ${i + 1} returned invalid XML`);
                continue;
            }
            
            const items = xmlDoc.querySelectorAll("item");
            console.log(`📰 Found ${items.length} event items`);

            if (items.length === 0) {
                list.innerHTML = "<p>No upcoming events found. Check back later!</p>";
                console.log("ℹ️ No events found in feed");
                return;
            }

            // Clear loader and display events
            list.innerHTML = "";
            console.log("🧹 Cleared loading message, now rendering events");

            items.forEach((item, index) => {
                if (index >= 10) return; // Limit to 10 events

                const title = item.querySelector("title")?.textContent || "Event";
                const link = item.querySelector("link")?.textContent || "#";
                const description = item.querySelector("description")?.textContent || "";
                const pubDateText = item.querySelector("pubDate")?.textContent;
                
                let pubDate = "Upcoming";
                if (pubDateText) {
                    try {
                        pubDate = new Date(pubDateText).toLocaleDateString(undefined, {
                            month: 'short', 
                            day: 'numeric'
                        });
                    } catch (e) {
                        console.warn("Could not parse date:", pubDateText);
                    }
                }

                const eventEl = document.createElement("div");
                eventEl.style.marginBottom = "1.5rem";
                eventEl.innerHTML = `
                    <div style="font-size: 0.8rem; color: #aaa; margin-bottom: 2px;">${pubDate}</div>
                    <h3 style="margin: 0; font-size: 1.1rem;">
                        <a href="${link}" target="_blank" rel="noopener noreferrer" style="color: #fff; text-decoration: none; border-bottom: 1px solid #333;">${title}</a>
                    </h3>
                    <p style="font-size: 0.9rem; color: #888; margin-top: 5px;">${description.replace(/<[^>]*>/g, '').substring(0, 120)}...</p>
                `;
                list.appendChild(eventEl);
                
                if (index === 0) {
                    console.log(`✅ First event rendered: ${title}`);
                }
            });
            
            console.log(`✅ Successfully loaded ${Math.min(items.length, 10)} events using proxy ${i + 1}`);
            return;

        } catch (err) {
            console.error(`❌ Proxy ${i + 1} error:`, err);
            // Continue to next proxy
        }
    }
    
    // All proxies failed
    console.error("💥 All proxies failed to load events");
    list.innerHTML = `<p>Unable to reach the event feed. Please try again later.</p>`;
}

// Make loadEvents available globally so the modal can call it
window.loadEvents = loadEvents;

// Export for module usage
export { loadEvents };
