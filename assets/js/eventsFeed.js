/**
 * CharlestonHacks — Live Events Scraper
 * Fetches real-time events from Charleston City Paper RSS.
 */

async function loadEvents() {
    const list = document.getElementById("events-list");
    if (!list) return;

    // Source: Charleston City Paper RSS feed
    const RSS_URL = "https://charlestoncitypaper.com/events/feed/";
    
    // More reliable CORS proxy options (try in order)
    const PROXIES = [
        `https://corsproxy.io/?${encodeURIComponent(RSS_URL)}`,
        `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(RSS_URL)}`,
        `https://api.allorigins.win/get?url=${encodeURIComponent(RSS_URL)}`
    ];
    
    list.innerHTML = `<p style="opacity:.7;">Searching for local happenings...</p>`;

    // Try each proxy until one works
    for (let i = 0; i < PROXIES.length; i++) {
        try {
            const response = await fetch(PROXIES[i]);
            
            if (!response.ok) {
                console.log(`Proxy ${i + 1} failed with status ${response.status}`);
                continue;
            }
            
            let xmlContent;
            
            // Handle different proxy response formats
            if (PROXIES[i].includes('allorigins')) {
                const data = await response.json();
                xmlContent = data.contents;
            } else if (PROXIES[i].includes('codetabs')) {
                xmlContent = await response.text();
            } else {
                xmlContent = await response.text();
            }
            
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlContent, "text/xml");
            
            // Check for parsing errors
            const parserError = xmlDoc.querySelector("parsererror");
            if (parserError) {
                console.log(`Proxy ${i + 1} returned invalid XML`);
                continue;
            }
            
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
            
            // Successfully loaded events
            console.log(`Successfully loaded events using proxy ${i + 1}`);
            return;

        } catch (err) {
            console.error(`Proxy ${i + 1} error:`, err);
            // Continue to next proxy
        }
    }
    
    // All proxies failed
    console.error("All proxies failed");
    list.innerHTML = `<p>Unable to reach the event feed. Please try again later.</p>`;
}

// Start the fetch process
loadEvents();
