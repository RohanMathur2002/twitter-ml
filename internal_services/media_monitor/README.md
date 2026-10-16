# MediaMonitor Web Application (`media_monitor`)

The Next.js 16 / React 19 frontend and orchestration interface for the MediaMonitor platform.

---

## 📌 Quick Links

- **Main Repository README**: [../../README.md](../../README.md)
- **Comprehensive Setup Guide**: [../../docs/SETUP_GUIDE.md](../../docs/SETUP_GUIDE.md)
- **Database & SQL Migrations**: [db/README.md](db/README.md)

---

## 🚀 Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Ensure your PostgreSQL credentials and `ML_FASTAPI_URL` are properly set. For private keys (such as `GEMINI_API_KEY`), create a `.env.local` file.

### 3. Apply Database Migrations
```bash
node run_migrations.js
```

### 4. Run Development Server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🏗️ Architecture & Features

- **App Router (`app/`)**:
  - `/(routes)/profile` & `/analyse-profile`: Profile deep-dive and timeline analysis.
  - `/(routes)/tweet` & `/analyse-tweet`: Tweet and thread reconstruction with zero-shot stance detection.
  - `/(routes)/maps`: Interactive 2D UMAP semantic maps.
  - `/(routes)/topics` & `/manage-topics`: Topic taxonomy and semantic anchor configuration.
  - `/(routes)/compare` & `/compare-st`: Cross-model vector embedding comparisons.
  - `/(routes)/dev`: Twitter cookie session health and quota dashboard.
- **Pipeline (`pipeline/`)**: Handles timeline pagination, tweet parsing (via Cheerio), DB upserts, and async ML embedding triggers.
- **Services (`services/`)**: Integration with Nitter scraper (`nitterService.ts`), ML FastAPI bridge (`tweetService.ts`), and Gemini AI.
