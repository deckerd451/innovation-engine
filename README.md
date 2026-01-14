# CharlestonHacks Innovation Engine

**Making Invisible Networks Visible**

A sophisticated web-based innovation platform for hackathons and collaborative innovation, featuring real-time networking, project management, and community engagement.

![CharlestonHacks](images/charlestonhackslogo.svg)

---

## 🚀 Features

- **Synapse Network Visualization** - Interactive D3.js-based network graph showing connections and relationships
- **Theme Circles** - Temporary collaboration spaces for emerging ideas
- **Real-time Messaging** - Direct messaging between community members
- **Project Management** - Create and manage collaborative projects
- **Connection System** - Send and accept connection requests
- **Endorsements** - Skill endorsement system
- **Leaderboards** - XP, streak, and connection rankings
- **Team Builder** - Automated team matching based on skills
- **Admin Analytics** - Dashboard for community management

---

## 📋 Prerequisites

Before you begin, ensure you have:

- A [Supabase](https://supabase.com) account and project
- Git installed on your machine
- A modern web browser (Chrome, Firefox, Safari, or Edge)
- Basic knowledge of JavaScript and SQL

---

## 🛠️ Setup Instructions

### 1. Clone the Repository

```bash
git clone https://github.com/Charlestonhacks/charlestonhacks.github.io.git
cd charlestonhacks.github.io
```

### 2. Configure Supabase

#### A. Create Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Note your project URL and anon key

#### B. Update Supabase Client

Edit `assets/js/supabaseClient.js`:

```javascript
export const supabase = createClient(
  "YOUR_SUPABASE_URL",
  "YOUR_SUPABASE_ANON_KEY",
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  }
);
```

#### C. Enable Authentication Providers

In your Supabase dashboard:
1. Go to **Authentication** → **Providers**
2. Enable **GitHub** and **Google** OAuth
3. Configure redirect URLs:
   - Development: `http://localhost:8000/dashboard.html`
   - Production: `https://yourdomain.com/dashboard.html`

### 3. Run Database Migrations

Execute the following SQL files in your Supabase SQL Editor **in order**:

```bash
# Core migrations (in migrations/ folder)
1. STEP_1_test_user_id.sql
2. STEP_2_create_messaging_tables.sql
3. STEP_3_add_engagement_columns.sql
4. STEP_4_create_activity_log.sql
5. STEP_5_create_achievements.sql
6. STEP_6_create_leaderboards.sql
7. STEP_7_fix_conversations.sql
8. STEP_8_create_rls_policies.sql
9. HELPERS_functions_and_triggers.sql

# Theme Circles feature (optional but recommended)
10. THEME_CIRCLES_SCHEMA.sql
11. DEMO_THEMES.sql (for testing)
```

**Important:** Run migrations in order. Each migration depends on the previous ones.

### 4. Configure Admin Access

Edit `assets/js/theme-admin.js` and add your admin email:

```javascript
const adminEmails = ['your-email@example.com'];
```

### 5. Local Development

#### Option A: Using Python

```bash
python3 -m http.server 8000
```

#### Option B: Using Node.js

```bash
npx http-server -p 8000
```

#### Option C: Using VS Code Live Server

1. Install the "Live Server" extension
2. Right-click `index.html`
3. Select "Open with Live Server"

Visit `http://localhost:8000` in your browser.

---

## 📁 Project Structure

```
charlestonhacks.github.io/
├── index.html                 # Landing page with 9 interactive portals
├── dashboard.html             # Main application dashboard
├── auth.js                    # Authentication controller
├── main.js                    # Application entry point
├── dashboard.js               # Dashboard logic
├── profile.js                 # Profile management
├── assets/
│   ├── js/
│   │   ├── supabaseClient.js  # Supabase configuration
│   │   ├── synapse/           # Network visualization
│   │   │   ├── core.js
│   │   │   ├── data.js
│   │   │   ├── render.js
│   │   │   ├── themes.js
│   │   │   └── ui.js
│   │   ├── api/               # API layer
│   │   ├── ui/                # UI components
│   │   ├── connections.js     # Connection management
│   │   ├── messaging.js       # Real-time messaging
│   │   ├── projects.js        # Project management
│   │   └── ...
│   ├── css/                   # Stylesheets
│   └── images/                # Image assets
├── migrations/                # Database migrations
├── docs/                      # Documentation
└── README.md                  # This file
```

---

## 🗄️ Database Schema

### Core Tables

- **community** - User profiles and information
- **connections** - User connections and relationships
- **projects** - Collaborative projects
- **messages** - Direct messages
- **conversations** - Message threads
- **endorsements** - Skill endorsements
- **achievements** - User achievements
- **activity_log** - User activity tracking
- **theme_circles** - Temporary collaboration spaces
- **theme_participants** - Theme circle membership

See `docs/DATABASE.md` for complete schema documentation.

---

## 🔐 Security

### Row Level Security (RLS)

All tables use Supabase Row Level Security policies to ensure:
- Users can only see their own data
- Public data is accessible to authenticated users
- Admin-only operations are protected

### Authentication

- OAuth via GitHub and Google
- Session management via Supabase Auth
- Automatic token refresh
- Secure credential storage

### Admin Access

Admin features are restricted to:
- Localhost development (with override)
- Verified admin email addresses
- Users with admin role in database

---

## 🎨 Customization

### Branding

Update the following files:
- `images/charlestonhackslogo.svg` - Main logo
- `manifest.json` - PWA configuration
- `styles.css` - Color scheme and typography

### Theme Colors

Edit CSS variables in `styles.css`:

```css
:root {
  --gold: #c9a35e;
  --cyan: #00e0ff;
  --bg-dark: #000;
  --text-primary: #fff;
}
```

---

## 📊 Features Guide

### Theme Circles

Theme Circles are temporary collaboration spaces that:
- Automatically expire after a set duration
- Track participant engagement levels
- Decay based on activity
- Can be linked to projects

**Creating a Theme:**
1. Admin access required
2. Navigate to Admin panel
3. Click "Create Theme Circle"
4. Set title, description, tags, and expiration

### Network Visualization

The Synapse network shows:
- **User nodes** - Community members
- **Project nodes** - Active projects
- **Theme circles** - Collaboration spaces
- **Connections** - Relationships between users

**Interactions:**
- Click nodes to view details
- Hover for quick info
- Drag to rearrange
- Zoom and pan

### Messaging System

Real-time messaging features:
- Direct messages between users
- Conversation threads
- Read receipts
- Unread message counts

---

## 🧪 Testing

### Manual Testing

1. **Authentication Flow**
   ```bash
   # Test GitHub OAuth
   # Test Google OAuth
   # Test logout
   ```

2. **Profile Management**
   ```bash
   # Create profile
   # Edit profile
   # Upload avatar
   ```

3. **Connections**
   ```bash
   # Send connection request
   # Accept request
   # Decline request
   ```

4. **Theme Circles** (requires admin)
   ```bash
   # Create theme
   # Join theme
   # View participants
   ```

### Test Data

Run `DEMO_THEMES.sql` to create 8 sample theme circles for testing.

---

## 🚀 Deployment

### GitHub Pages (Recommended)

1. Push your changes to GitHub
2. Go to repository **Settings** → **Pages**
3. Select branch: `main`
4. Select folder: `/ (root)`
5. Click **Save**

Your site will be available at: `https://yourusername.github.io/`

### Custom Domain

1. Add `CNAME` file with your domain
2. Configure DNS:
   ```
   Type: CNAME
   Name: @
   Value: yourusername.github.io
   ```
3. Enable HTTPS in GitHub Pages settings

### Environment Variables

For production, update:
- Supabase URL and keys
- OAuth redirect URLs
- Admin email addresses

---

## 🐛 Troubleshooting

### Common Issues

**Issue:** "Supabase not available"
- **Solution:** Check that `supabaseClient.js` is loaded before other scripts

**Issue:** Theme circles not showing
- **Solution:** Run `THEME_CIRCLES_SCHEMA.sql` migration

**Issue:** OAuth redirect fails
- **Solution:** Verify redirect URLs in Supabase dashboard match your domain

**Issue:** Admin panel not accessible
- **Solution:** Add your email to `adminEmails` array in `theme-admin.js`

### Debug Mode

Enable debug logging:
```javascript
localStorage.setItem('debug', 'true');
```

View logs in browser console (F12).

---

## 📚 Documentation

- [API Documentation](docs/API.md)
- [Database Schema](docs/DATABASE.md)
- [Event System](docs/EVENTS.md)
- [Theme Circles Guide](THEME_CIRCLES_README.md)
- [Testing Guide](QUICK_START_TESTING.md)

---

## 🤝 Contributing

We welcome contributions! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Code Style

- Use ES6+ JavaScript
- Follow existing naming conventions
- Add comments for complex logic
- Test before submitting PR

---

## 📝 License

See [LICENSE.txt](LICENSE.txt) for details.

---

## 🙏 Credits

### Technology Stack

- **Frontend:** HTML5, CSS3, JavaScript (ES6+)
- **Visualization:** D3.js
- **Backend:** Supabase (PostgreSQL + Auth)
- **Authentication:** GitHub OAuth, Google OAuth
- **Hosting:** GitHub Pages

### Assets

- **Icons:** [Font Awesome](https://fontawesome.io)
- **Images:** [Unsplash](https://unsplash.com)
- **Libraries:** jQuery, Scrollex

### Team

- **Project Lead:** Douglas Hamilton
- **Email:** hello@charlestonhacks.co
- **Twitter:** @Descart84114619

---

## 📞 Support

- **Email:** hello@charlestonhacks.co
- **Issues:** [GitHub Issues](https://github.com/Charlestonhacks/charlestonhacks.github.io/issues)
- **Discussions:** [GitHub Discussions](https://github.com/Charlestonhacks/charlestonhacks.github.io/discussions)

---

## 🗺️ Roadmap

### Q1 2026
- [ ] Mobile app (React Native)
- [ ] Advanced analytics dashboard
- [ ] AI-powered team matching
- [ ] Video chat integration

### Q2 2026
- [ ] Multi-language support
- [ ] Advanced search filters
- [ ] Project templates
- [ ] Mentor matching system

---

## ⭐ Star Us!

If you find this project useful, please consider giving it a star on GitHub!

---

**Built with ❤️ by the CharlestonHacks community**
