# 🚀 MediaMonitor: Comprehensive Setup & Operational Guide

This document provides complete, step-by-step instructions for installing, configuring, running, and troubleshooting the **MediaMonitor** distributed intelligence platform.

---

## 📑 Table of Contents

1. [Architecture & System Overview](#-architecture--system-overview)
2. [Prerequisites & System Requirements](#-prerequisites--system-requirements)
3. [Repository Directory Structure](#-repository-directory-structure)
4. [Step 1: Database Setup & pgvector Installation](#step-1-database-setup--pgvector-installation)
5. [Step 2: Environment Configuration](#step-2-environment-configuration)
6. [Step 3: Service Dependency Installation](#step-3-service-dependency-installation)
   - [3.1 Next.js Web Application (`media_monitor`)](#31-nextjs-web-application-media_monitor)
   - [3.2 ML FastAPI Microservice (`ml-fastapi`)](#32-ml-fastapi-microservice-ml-fastapi)
7. [Step 4: Database Migrations](#step-4-database-migrations)
   - [4.1 Media Monitor SQL Migrations (Automated Runner)](#41-media-monitor-sql-migrations-automated-runner)
   - [4.2 ML FastAPI Alembic Migrations](#42-ml-fastapi-alembic-migrations)
8. [Step 5: Nitter Twitter Scraper Setup (Docker)](#step-5-nitter-twitter-scraper-setup-docker)
   - [5.1 Starting Nitter & Redis Containers](#51-starting-nitter--redis-containers)
   - [5.2 Managing Twitter Cookies (`sessions-dev.jsonl`)](#52-managing-twitter-cookies-sessions-devjsonl)
   - [5.3 (Optional) Residential Proxy Rotator](#53-optional-residential-proxy-rotator)
9. [Step 6: Running the Platform](#step-6-running-the-platform)
   - [Option A: Unified Master Orchestration (Recommended)](#option-a-unified-master-orchestration-recommended)
   - [Option B: Running Individual Services for Development](#option-b-running-individual-services-for-development)
10. [Step 7: Verification & Health Checks](#step-7-verification--health-checks)
11. [Step 8: Platform Features & Usage Overview](#step-8-platform-features--usage-overview)
12. [Troubleshooting & Frequently Asked Questions](#troubleshooting--frequently-asked-questions)

---

## 🏛 Architecture & System Overview

MediaMonitor is a distributed, full-stack intelligence system for scraping, embedding, classifying, and visualizing social media (Twitter/X) profiles, tweets, and conversation threads.

```
+-----------------------------------------------------------------------------------+
|                                  MediaMonitor                                     |
+-----------------------------------------------------------------------------------+
                                          |
        +---------------------------------+---------------------------------+
        |                                 |                                 |
        v                                 v                                 v
+-----------------------+     +-----------------------+     +-----------------------+
|   media_monitor UI    |     |      ml-fastapi       |     |      nitter-dev       |
|    (Next.js 16)       |     |     (FastAPI ML)      |     |     (Docker/Nim)      |
|  Port: 3000           |     |  Port: 8000           |     |  Port: 8081           |
+-----------------------+     +-----------------------+     +-----------------------+
        |         \                       |                             |
        |          \                      |                             |
        |           \---------------------+                             |
        |                                 |                             v
        |                                 |                   +-------------------+
        v                                 v                   |     redis-dev     |
+-----------------------------------------------------+       |      (Redis 7)    |
|               PostgreSQL 16+ Database               |       |   Internal: 6379  |
|                Database: media_monitor              |       +-------------------+
|               Extension: pgvector (HNSW)            |
|               Port: 5432                            |
+-----------------------------------------------------+
```

### Component Breakdown

| Component | Technology | Default Port | Description |
| :--- | :--- | :--- | :--- |
| **`media_monitor`** | Next.js 16 (React 19, TypeScript, Tailwind CSS v4) | `3000` | Web dashboard, profile search, tweet thread analysis, topic management, 2D semantic interactive map views, and session health dashboards. |
| **`ml-fastapi`** | Python 3.10-3.13, FastAPI, PyTorch, SentenceTransformers, UMAP | `8000` | High-performance embedding generation, dynamic VRAM model cache, vector search, zero-shot stance classification, and 2D UMAP projection calculation. |
| **`nitter-dev`** | Nim, Alpine Linux, Docker Compose | `8081` | Local headless scraper for Twitter/X profiles, tweets, and threads using authenticated guest/session cookies. |
| **`redis-dev`** | Redis 7 Alpine (Docker) | `6379` (Internal) | In-memory cache for Nitter rate limits, user timelines, and RSS feeds. |
| **PostgreSQL** | PostgreSQL 16+ with `pgvector` | `5432` | Canonical storage for profiles, tweets, embeddings, topics, analysis scores, and vector HNSW indexes. |
| **Master Runner** | Node.js (`start.js`) | Orchestrator | Single-command concurrent launcher with structured colorized logs and automatic hourly cache cleanup cron. |

---

## 💻 Prerequisites & System Requirements

Ensure the following tools are installed on your host system:

1. **Operating System**: Windows 10/11, macOS, or Ubuntu 20.04/22.04/24.04 LTS.
2. **Node.js**: `v20.x` or `v22.x` / `v24.x` (LTS recommended).
   - Verify: `node --version` and `npm --version`.
3. **Python**: Python `3.10` through `3.13` (64-bit).
   - Verify: `python --version` (or `py --version`).
4. **PostgreSQL**: Version `15`, `16`, `17`, or `18`.
   - Must have the **`pgvector`** extension installed.
   - Verify: `psql -U postgres -p 5432 -c "SELECT version();"`
5. **Docker & Docker Compose**:
   - Docker Desktop on Windows/macOS (WSL2 engine enabled).
   - Docker Engine + Docker Compose Plugin on Linux.
   - Verify: `docker --version` and `docker compose version`.
6. **Git**: Version control to clone and manage branches.
7. **Hardware Recommendation**:
   - RAM: Minimum 8 GB (16 GB recommended for running multiple transformer models locally).
   - GPU (Optional): CUDA-compatible NVIDIA GPU accelerates embedding and zero-shot stance classification. The platform automatically falls back to CPU if CUDA is unavailable.

---

## 📁 Repository Directory Structure

```text
MediaMonitor/
├── .gitignore                          # Global git ignore configuration
├── README.md                           # Main repository entrypoint documentation
├── docs/                               # Architectural and operational guides
│   ├── SETUP_GUIDE.md                  # This detailed setup guide
│   └── nitter_version_history.md       # Nitter upstream commit and patch tracking
├── _bin/                               # Historical build archives and prototypes
├── nitter-dev/                         # Nitter scraping service
│   ├── compose.yml                     # Docker Compose file for nitter-dev & redis-dev
│   ├── Dockerfile                      # Multistage Alpine build for Nitter
│   ├── nitter.conf                     # Nitter runtime configuration
│   ├── sessions-dev.jsonl              # Twitter authenticated cookie sessions pool
│   ├── proxies.json                    # (Optional) Residential proxy list
│   └── proxy_rotator.js                # (Optional) Local HTTP proxy rotator (port 8088)
└── internal_services/                  # Core application services
    ├── package.json                    # Master orchestration package
    ├── start.js                        # Master runner script (concurrent execution & logging)
    ├── media_monitor/                  # Next.js 16 Web Dashboard & Ingestion Pipeline
    │   ├── .env.example                # Configuration template
    │   ├── .env                        # Local runtime environment variables
    │   ├── .env.local                  # Local secrets (e.g. Gemini API key)
    │   ├── package.json                # Frontend dependencies and scripts
    │   ├── run_migrations.js           # Automated SQL migration runner
    │   ├── app/                        # Next.js App Router (pages and API routes)
    │   ├── components/                 # React UI components (charts, maps, timelines)
    │   ├── db/                         # Database setup and sequential SQL migrations
    │   │   ├── setup/create_database.sql
    │   │   └── migrations/             # 001 through 014 SQL schema migrations
    │   ├── pipeline/                   # Tweet ingestion and enrichment workflows
    │   └── services/                   # Business logic (Nitter client, DB, Gemini, ML bridge)
    └── ml-fastapi/                     # FastAPI Machine Learning Service
        ├── .env.example                # ML configuration template
        ├── .env                        # ML environment variables
        ├── main.py                     # FastAPI application entrypoint & lifespan
        ├── requirements.txt            # Python dependencies
        ├── alembic.ini                 # Alembic database migration config
        ├── api/                        # Route handlers, schemas, and middleware
        ├── config/                     # Pydantic settings and structured logging
        ├── database/                   # SQLAlchemy models, sessions, and Alembic migrations
        └── services/                   # Model loading, embedding cache, UMAP & clustering
```

---

## Step 1: Database Setup & pgvector Installation

MediaMonitor requires a PostgreSQL database named `media_monitor` with the `vector` (`pgvector`) extension enabled.

### 1.1 Installing `pgvector`

* **Windows**:
  - If you installed PostgreSQL using the standard EDB installer, download the matching `pgvector` Windows release zip from [pgvector GitHub releases](https://github.com/pgvector/pgvector/releases).
  - Copy `vector.dll` into `C:\Program Files\PostgreSQL\<version>\lib\`.
  - Copy `vector.control` and `vector--*.sql` into `C:\Program Files\PostgreSQL\<version>\share\extension\`.
* **Linux (Ubuntu/Debian)**:
  ```bash
  sudo apt install -y postgresql-server-dev-all git build-essential
  git clone --branch v0.8.0 https://github.com/pgvector/pgvector.git
  cd pgvector && make && sudo make install
  ```
* **macOS (Homebrew)**:
  ```bash
  brew install pgvector
  ```
* **Docker Alternative**:
  If you prefer running PostgreSQL in Docker with `pgvector` pre-installed:
  ```bash
  docker run -d \
    --name media-monitor-pg \
    -e POSTGRES_USER=postgres \
    -e POSTGRES_PASSWORD=root \
    -e POSTGRES_DB=media_monitor \
    -p 5432:5432 \
    pgvector/pgvector:pg16
  ```

### 1.2 Creating the Database

Open a terminal or command prompt and run:

**PowerShell (Windows)**:
```powershell
$env:PGPASSWORD="root"
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -h localhost -p 5432 -d postgres -f "internal_services/media_monitor/db/setup/create_database.sql"
```

**Bash (Linux/macOS)**:
```bash
PGPASSWORD=root psql -U postgres -h localhost -p 5432 -d postgres -f internal_services/media_monitor/db/setup/create_database.sql
```

Alternatively, connect via `psql` or pgAdmin and run:
```sql
CREATE DATABASE media_monitor;
\c media_monitor
CREATE EXTENSION IF NOT EXISTS vector;
```

---

## Step 2: Environment Configuration

### 2.1 Media Monitor (`internal_services/media_monitor`)

In `internal_services/media_monitor`, copy the example file to `.env`:

```bash
cd internal_services/media_monitor
cp .env.example .env
```

Ensure your `.env` contains:
```ini
# PostgreSQL Connection
DATABASE_URL=postgresql://postgres:root@localhost:5432/media_monitor
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=media_monitor
POSTGRES_USER=postgres
POSTGRES_PASSWORD=root

# ML FastAPI Endpoint
ML_FASTAPI_URL=http://127.0.0.1:8000

# Path to Nitter Session Cookies
NITTER_SESSIONS_FILE_PATH=../nitter-dev/sessions-dev.jsonl
```

Create `.env.local` for private API keys:
```ini
# Google Gemini API (used for tweet summarization, topic labeling, and profile categorization)
GEMINI_API_KEY=your_actual_gemini_api_key_here

# ML FastAPI bridge
ML_FASTAPI_URL=http://127.0.0.1:8000
```

### 2.2 ML FastAPI (`internal_services/ml-fastapi`)

In `internal_services/ml-fastapi`, copy the template:

```bash
cd internal_services/ml-fastapi
cp .env.example .env
```

Ensure your `.env` contains:
```ini
APP_NAME=ML FastAPI Service
ENVIRONMENT=local
DEBUG=false
LOG_LEVEL=INFO
API_PREFIX=
CORS_ORIGINS=["http://localhost:3000","http://localhost:8000"]

# Async SQLAlchemy Connection URL
DATABASE_URL=postgresql+asyncpg://postgres:root@127.0.0.1:5432/media_monitor
DATABASE_POOL_SIZE=10
DATABASE_MAX_OVERFLOW=20

# Embedding Model Defaults
EMBEDDING_MODEL_NAME=sentence-transformers/all-MiniLM-L6-v2
EMBEDDING_DIMENSION=384
EMBEDDING_BATCH_SIZE=64
NORMALIZE_EMBEDDINGS=true

# Model Artifacts
CLASSIFIER_PATH=artifacts/classifier.joblib
LABEL_ENCODER_PATH=artifacts/label_encoder.pkl
ALLOW_MISSING_ARTIFACTS=true

DEFAULT_SEARCH_LIMIT=10
MAX_SEARCH_LIMIT=100
```

---

## Step 3: Service Dependency Installation

### 3.1 Next.js Web Application (`media_monitor`)

Navigate into `internal_services/media_monitor` and install npm dependencies:

```bash
cd internal_services/media_monitor
npm install
```

This installs Next.js 16, React 19, `@tailwindcss/postcss`, `pg`, `cheerio`, `lucide-react`, and TypeScript types.

### 3.2 ML FastAPI Microservice (`ml-fastapi`)

Navigate into `internal_services/ml-fastapi`, create a Python virtual environment, activate it, and install requirements:

**On Windows (PowerShell)**:
```powershell
cd internal_services\ml-fastapi
python -m venv venv
.\venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
```

**On Linux / macOS**:
```bash
cd internal_services/ml-fastapi
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

> [!NOTE]
> On the first startup, `ml-fastapi` automatically downloads the pre-configured sentence transformer models (`sentence-transformers/all-MiniLM-L6-v2`, `all-MiniLM-L12-v2`, `paraphrase-multilingual-MiniLM-L12-v2`, `all-mpnet-base-v2`) from Hugging Face into your local Hugging Face cache (`~/.cache/huggingface/hub`). Ensure an internet connection is active during initial run.

---

## Step 4: Database Migrations

Database setup is split into two phases:
1. Core application schema migrations (`001` through `014`) run by the Node.js runner.
2. Machine learning tables and vector indexes run by Alembic.

### 4.1 Media Monitor SQL Migrations (Automated Runner)

From `internal_services/media_monitor`, run:

```bash
cd internal_services/media_monitor
node run_migrations.js
```

The automated runner:
- Connects using `DATABASE_URL` from `.env`.
- Creates a `schema_migrations_history` tracking table.
- Sequentially executes all pending migrations:
  - `001_initial_intelligence_schema.sql` (profiles, tweets, profile_analysis, clusters)
  - `002_separate_tweet_embeddings.sql` (tweet_embeddings table with HNSW indexing)
  - `003_create_topics_table.sql` (topics taxonomy table)
  - `004_create_topic_embeddings.sql` (initial topic vector embeddings)
  - `005_add_priority_to_topic_embeddings.sql` (weighted priority vectors)
  - `006_create_profile_topic_intelligence.sql` (cached scores & explainability)
  - `007_create_profile_map_coordinates.sql` (global 2D coordinates)
  - `008_create_profile_topic_map_coordinates.sql` (topic-specific 2D coordinates)
  - `009_multi_projection_map.sql` (multi-projection support)
  - `010_tweet_reply_cache_and_bookmarks.sql` (caching & bookmarks)
  - `011_tweet_thread_analysis.sql` (thread clustering storage)
  - `012_decouple_thread_analysis.sql` (standalone decoupled thread_tweets)
  - `013_add_starred_tweets_table.sql` (bookmarked_profile_tweets)
  - `014_add_reply_stance_to_thread_tweets.sql` (stance caching columns)
  - `014_keyword_searches.sql` (tweet_keywords indexing table)

### 4.2 ML FastAPI Alembic Migrations

Activate the Python virtual environment in `internal_services/ml-fastapi` and upgrade:

**Windows**:
```powershell
cd internal_services\ml-fastapi
.\venv\Scripts\Activate.ps1
alembic upgrade head
```

**Linux/macOS**:
```bash
cd internal_services/ml-fastapi
source venv/bin/activate
alembic upgrade head
```

This verifies and creates the `documents` table, `embedding_runs` history, dynamic vector casting, and partial HNSW indexes across multiple embedding model families (`idx_te_minilm`, `idx_te_e5`, `idx_te_bgem3`, `idx_te_minilm_l12`, `idx_te_para_minilm_l12`).

---

## Step 5: Nitter Twitter Scraper Setup (Docker)

Nitter provides real-time Twitter timeline and thread scraping without requiring Twitter's expensive official API keys.

### 5.1 Starting Nitter & Redis Containers

1. Ensure **Docker Desktop** (or Docker Engine) is running.
2. Navigate to `nitter-dev` and start the stack:

```bash
cd nitter-dev
docker compose up -d
```

3. Verify containers are healthy:
```bash
docker compose ps
```
You should see:
- `nitter-dev-1` listening on `0.0.0.0:8081->8080/tcp`
- `redis-dev-1` on internal Redis port `6379`

4. Test in your browser: open [http://localhost:8081](http://localhost:8081). You should see the Nitter homepage.

### 5.2 Managing Twitter Cookies (`sessions-dev.jsonl`)

Twitter requires authentication cookies for reading tweets and threads reliably.
`nitter-dev/sessions-dev.jsonl` contains cookie sessions in JSON Lines format:

```json
{"kind":"cookie","username":"account1","id":"1","auth_token":"<auth_token_hex>","ct0":"<ct0_hex>"}
{"kind":"cookie","username":"account2","id":"2","auth_token":"<auth_token_hex>","ct0":"<ct0_hex>"}
```

- **Health Monitoring**: MediaMonitor has a built-in session health checker at `http://localhost:3000/dev` which tests cookies and displays remaining quotas.
- **Reloading Sessions**: Whenever you edit `sessions-dev.jsonl`, restart Nitter:
  ```bash
  cd nitter-dev
  docker compose restart nitter-dev
  ```

### 5.3 (Optional) Residential Proxy Rotator

If scraping large volumes of accounts, Twitter may rate limit your IP address. The repository includes an automatic proxy rotator in `nitter-dev/proxy_rotator.js`.

1. Add your HTTP/HTTPS proxy URLs to `nitter-dev/proxies.json`:
   ```json
   {
     "proxies": [
       "http://username:password@proxy-node1.example.com:8000",
       "http://username:password@proxy-node2.example.com:8000"
     ]
   }
   ```
2. Run the proxy rotator:
   ```bash
   cd nitter-dev
   node proxy_rotator.js
   ```
   *Listens on port `8088`.*
3. In `nitter-dev/nitter.conf`, uncomment the proxy line:
   ```ini
   proxy = "http://host.docker.internal:8088"
   ```
4. Restart Nitter: `docker compose restart nitter-dev`.

---

## Step 6: Running the Platform

### Option A: Unified Master Orchestration (Recommended)

MediaMonitor includes a master runner (`internal_services/start.js`) that runs all services concurrently, formats output logs with colorful tags, detects service readiness, and triggers background maintenance cron jobs.

From `internal_services/`:

```bash
cd internal_services
npm start
```
*(or run `node start.js`)*

#### What the Master Runner does:
1. Spawns `media_monitor` Next.js server on **port 3000**.
2. Spawns `ml-fastapi` Uvicorn server on **port 8000** using Python from `venv`.
3. Attaches to `nitter-dev` Docker Compose logs.
4. Monitors log outputs and displays readiness banner once all services are live:
   ```text
   ======================================================
      ALL SERVICES ARE UP AND READY TO USE:              
      Frontend: http://localhost:3000                    
      Backend:  http://localhost:8000                    
   ======================================================
   ```
5. Runs an hourly cleanup job (`GET http://localhost:3000/api/cron/cleanup`) in the background.
6. Gracefully handles `Ctrl + C` (SIGINT), terminating all child processes cleanly.

---

### Option B: Running Individual Services for Development

If you are debugging a specific component or modifying code, you can run each service in a separate terminal:

#### Terminal 1: Nitter Docker Containers
```bash
cd nitter-dev
docker compose up
```

#### Terminal 2: ML FastAPI Service
**Windows**:
```powershell
cd internal_services\ml-fastapi
.\venv\Scripts\Activate.ps1
uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

**Linux/macOS**:
```bash
cd internal_services/ml-fastapi
source venv/bin/activate
uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

#### Terminal 3: Media Monitor Web Application
```bash
cd internal_services/media_monitor
npm run dev
```

---

## Step 7: Verification & Health Checks

Once services are running, verify each endpoint:

| Service | Test URL / Command | Expected Result |
| :--- | :--- | :--- |
| **Frontend UI** | [http://localhost:3000](http://localhost:3000) | MediaMonitor Dashboard loads cleanly |
| **FastAPI Docs** | [http://localhost:8000/docs](http://localhost:8000/docs) | Interactive Swagger UI with API routes |
| **FastAPI Health** | `curl http://localhost:8000/health` | `{"status":"ok"}` |
| **Nitter Health** | [http://localhost:8081](http://localhost:8081) | Nitter interface with search bar |
| **Nitter Health API** | [http://localhost:3000/api/nitter-health](http://localhost:3000/api/nitter-health) | Current session pool latency & quota status |
| **Database Check** | `psql -U postgres -d media_monitor -c "\dt"` | Displays all 23 application tables |

### Quick Smoke Test: Generate an Embedding via API
```bash
curl -X POST http://localhost:8000/embed \
  -H "Content-Type: application/json" \
  -d '{"texts": ["Testing MediaMonitor vector embedding pipeline."]}'
```
*Expected: JSON array containing a 384-dimensional vector float array.*

---

## Step 8: Platform Features & Usage Overview

Once the application is up at [http://localhost:3000](http://localhost:3000):

1. **Profile Intelligence (`/analyse-profile` & `/profile`)**:
   - Enter any public Twitter handle (e.g. `BillGates`, `elonmusk`).
   - The system scrapes tweets via Nitter, stores them in PostgreSQL, and enriches them with vector embeddings asynchronously via `ml-fastapi`.
   - Generates stats on engagement, active hours, top hashtags, and sentiment.
2. **Tweet & Thread Deep Dive (`/analyse-tweet` & `/tweet`)**:
   - Paste a direct tweet URL or ID.
   - MediaMonitor reconstructs the reply tree, classifies sentiment and stance using zero-shot DeBERTa models, and provides LLM summarization.
3. **Keyword Tracking (`/analyse-keyword` & `/keyword`)**:
   - Track topics and hashtags over time with search volume and sentiment aggregation.
4. **Interactive 2D Semantic Maps (`/maps`)**:
   - Visualizes all monitored profiles in 2D space using UMAP dimensionality reduction on tweet vectors.
   - Switch between **Canonical**, **Narrative**, and **Ideological** projection modes.
5. **Cross-Model Vector Comparison (`/compare` & `/compare-st`)**:
   - Compare embedding behavior, cosine similarity distributions, and performance across multiple transformer models (`MiniLM-L6`, `MiniLM-L12`, `E5-base`, `BGE-M3`, `all-mpnet-base-v2`).
6. **Topic Taxonomy Management (`/manage-topics` & `/topics`)**:
   - Define custom monitoring categories with semantic positive and negative query anchors.

---

## 🛠 Troubleshooting & Frequently Asked Questions

### 1. `failed to connect to the docker API` / Docker Desktop not running
- **Error**: `failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine`
- **Solution**: Open Docker Desktop on your machine and wait until the whale icon in the taskbar indicates "Docker Desktop is running". Then retry `docker compose up -d` in `nitter-dev`.

### 2. `Cannot find module 'pg'` or Next.js module errors
- **Error**: `Error: Cannot find module 'pg'` or missing package in `media_monitor`.
- **Solution**: You need to install dependencies. Run `npm install` inside `internal_services/media_monitor`.

### 3. `extension "vector" is not available` in PostgreSQL
- **Error**: `ERROR: extension "vector" is not available` when running migrations.
- **Solution**: The `pgvector` extension is not installed in your PostgreSQL instance. See [Step 1.1](#11-installing-pgvector) for installation steps, or run PostgreSQL using the official `pgvector/pgvector:pg16` Docker image.

### 4. Python `No module named ...` or Uvicorn not found
- **Error**: `uvicorn: command not found` or `ModuleNotFoundError: No module named 'fastapi'`
- **Solution**: Ensure your virtual environment is active:
  - Windows: `.\internal_services\ml-fastapi\venv\Scripts\Activate.ps1`
  - Linux/Mac: `source internal_services/ml-fastapi/venv/bin/activate`
  - Run `pip install -r internal_services/ml-fastapi/requirements.txt`.

### 5. Port Conflicts (`Port 3000`, `Port 8000`, or `Port 8081` in use)
- **Check active ports**:
  - Windows PowerShell: `Get-NetTCPConnection -LocalPort 3000,8000,8081`
  - Linux/Mac: `lsof -i :3000 -i :8000 -i :8081`
- **Resolution**: Stop existing processes or modify the port in `.env` / `start.js` / `compose.yml`.

### 6. Nitter returns `403` or `User not found` when scraping
- **Cause**: Twitter guest accounts or cookies in `sessions-dev.jsonl` may have expired or been rate-limited.
- **Solution**:
  - Visit `http://localhost:3000/dev` to check session pool health.
  - Export fresh cookies (`auth_token` and `ct0`) from a test Twitter session and update `nitter-dev/sessions-dev.jsonl`.
  - Restart Nitter: `docker compose restart nitter-dev`.

### 7. Database authentication error (`password authentication failed for user "postgres"`)
- **Solution**: Check the password specified in `internal_services/media_monitor/.env` and `internal_services/ml-fastapi/.env`. Verify with `psql -U postgres -h localhost -p 5432`.

---

## 📞 Support & Contributing

- For Nitter upstream version tracking and rollbacks, see [docs/nitter_version_history.md](file:///c:/Users/Sveltetech/Desktop/MediaMonitor%20-%20Copy/docs/nitter_version_history.md).
- To inspect or apply database migrations manually, see [internal_services/media_monitor/db/README.md](file:///c:/Users/Sveltetech/Desktop/MediaMonitor%20-%20Copy/internal_services/media_monitor/db/README.md).
