/**
 * CharlestonHacks – Live Events Scraper
 * Fetches real-time events from Charleston City Paper RSS.
 */

async function loadEvents() {
    const list = document.getElementById("events-list");
    if (!list) return;

    // Source: Charleston City Paper RSS feed
    const RSS_URL = "https://charlestoncitypaper.com/events/feed/";
    // CORS Proxy to allow browser-side fetching
    const PROXY_URL = "https://api.allorigins.win/get?url=";
    
    list.innerHTML = `<p style="opacity:.7;">Searching for local happenings...</p>`;

    try {
        const response = await fetch(`${PROXY_URL}${encodeURIComponent(RSS_URL)}`);
        const data = await response.json();
        
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(data.contents, "text/xml");
        const items = xmlDoc.querySelectorAll("item");

        if (items.length === 0) {
            list.innerHTML = "<p>No upcoming events found. Check back later!</p>";
            return;
        }

        list.innerHTML = ""; // Clear loader

        items.forEach((item, index) => {
            if (index >= 10) return; // Limit to 10 events

            const title = item.querySelector("title")?.textContent || "Event";
            const link = item.querySelector("link")?.textContent || "#";
            const description = item.querySelector("description")?.textContent || "";
            const pubDate = new Date(item.querySelector("pubDate")?.textContent).toLocaleDateString(undefined, {
                month: 'short', day: 'numeric'
            });

            const eventEl = document.createElement("div");
            eventEl.style.marginBottom = "1.5rem";
            eventEl.innerHTML = `
                <div style="font-size: 0.8rem; color: #aaa; margin-bottom: 2px;">${pubDate}</div>
                <h3 style="margin: 0; font-size: 1.1rem;">
                    <a href="${link}" target="_blank" style="color: #fff; text-decoration: none; border-bottom: 1px solid #333;">${title}</a>
                </h3>
                <p style="font-size: 0.9rem; color: #888; margin-top: 5px;">${description.replace(/<[^>]*>/g, '').substring(0, 120)}...</p>
            `;
            list.appendChild(eventEl);
        });

    } catch (err) {
        console.error("Scraper error:", err);
        list.innerHTML = `<p>Unable to reach the event feed. Please try again.</p>`;
    }
}

// Start the fetch process
loadEvents();
