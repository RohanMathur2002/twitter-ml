# 🛰️ MediaMonitor (Twitter/X Semantic Intelligence Platform)

[![Next.js](https://img.shields.io/badge/Next.js-16.2.9-black?logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.2.4-blue?logo=react)](https://react.dev/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115.6-009688?logo=fastapi)](https://fastapi.tiangolo.com/)
[![Python](https://img.shields.io/badge/Python-3.10%20%7C%203.11%20%7C%203.12%20%7C%203.13-3776AB?logo=python)](https://www.python.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16%2B%20with%20pgvector-336791?logo=postgresql)](https://github.com/pgvector/pgvector)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker)](https://www.docker.com/)

**MediaMonitor** is a distributed social media intelligence and analytics system designed for real-time scraping, vector embedding generation, zero-shot stance classification, and interactive semantic visualization of Twitter/X profiles, tweets, and conversation threads.

---

## 📑 Table of Contents

- [🏛️ System Architecture](#️-system-architecture)
- [⚡ Quick Start (TL;DR)](#-quick-start-tldr)
- [💻 System Requirements](#-system-requirements)
- [📦 Directory Structure](#-directory-structure)
- [🛠️ Detailed Step-by-Step Setup](#️-detailed-step-by-step-setup)
  - [1. Database Configuration & pgvector](#1-database-configuration--pgvector)
  - [2. Environment Files Setup](#2-environment-files-setup)
  - [3. Frontend Setup (`media_monitor`)](#3-frontend-setup-media_monitor)
  - [4. ML Microservice Setup (`ml-fastapi`)](#4-ml-microservice-setup-ml-fastapi)
  - [5. Scraper Setup (`nitter-dev`)](#5-scraper-setup-nitter-dev)
  - [6. Database Migrations Execution](#6-database-migrations-execution)
- [🚀 Running the Project](#-running-the-project)
  - [Method A: Master Orchestration Runner (Recommended)](#method-a-master-orchestration-runner-recommended)
  - [Method B: Running Individual Services for Development](#method-b-running-individual-services-for-development)
- [🔍 Verification & Health Checks](#-verification--health-checks)
- [🌟 Key Platform Features](#-key-platform-features)
- [📚 API Reference](#-api-reference)
- [🔧 Troubleshooting](#-troubleshooting)

---

## 🏛️ System Architecture

MediaMonitor operates as a cohesive multi-service architecture:

```
                                  +---------------------------------------+
                                  |         Client Browser                |
                                  |     http://localhost:3000             |
                                  +---------------------------------------+
                                                      |
                                                      v
                                  +---------------------------------------+
                                  |     Media Monitor Frontend            |
                                  |     (Next.js 16 + React 19)           |
                                  +---------------------------------------+
                                       /              |             \
              Async Ingestion Request /               |              \ Scrape Request
                                     v                |               v
      +---------------------------------+             |        +---------------------+
      |        ML FastAPI Microservice  |             |        |     Nitter Scraper  |
      |     (PyTorch / Transformers)    |             |        |    (Docker / Nim)   |
      |      http://localhost:8000      |             |        |  http://localhost:8081  |
      +---------------------------------+             |        +---------------------+
                     |                                |                   |
                     | Vector Embeddings              | Read/Write        | Timeline Cache
                     v                                v                   v
      +-----------------------------------------------------+   +---------------------+
      |            PostgreSQL 16+ Database                  |   |     Redis 7 Cache   |
      |             (pgvector HNSW indexes)                 |   |     (Docker)        |
      |             http://localhost:5432                   |   +---------------------+
      +-----------------------------------------------------+
```

### Services Summary

| Service | Path | Tech Stack | Port | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| **MediaMonitor UI** | `internal_services/media_monitor` | Next.js 16, React 19, Tailwind CSS v4, Cheerio | `3000` | Web dashboard, analytics UI, topic manager, UMAP map views, ingestion orchestration |
| **ML FastAPI** | `internal_services/ml-fastapi` | FastAPI, PyTorch, SentenceTransformers, UMAP, Scikit-learn | `8000` | Vector embeddings, stance prediction, vector similarity search, 2D coordinates |
| **Nitter Scraper** | `nitter-dev` | Nim, Alpine Linux, Docker Compose | `8081` | Real-time Twitter timeline and thread scraping without official API limits |
| **Nitter Redis** | `nitter-dev` | Redis 7 Alpine (Docker) | `6379` *(internal)* | In-memory timeline caching and rate-limit mitigation |
| **PostgreSQL** | Local Host or Docker | PostgreSQL 16+ with `pgvector` | `5432` | Canonical storage for profiles, tweets, embeddings, analysis scores |
| **Master Runner** | `internal_services/start.js` | Node.js child_process orchestrator | - | Single-command unified launcher with colored logs and hourly cleanup cron |

---

## ⚡ Quick Start (TL;DR)

If you already have PostgreSQL with `pgvector` running on port 5432 (user: `postgres`, password: `root`):

```bash
# 1. Start Nitter & Redis via Docker
cd nitter-dev
docker compose up -d

# 2. Install MediaMonitor frontend dependencies & run migrations
cd ../internal_services/media_monitor
npm install
node run_migrations.js

# 3. Setup Python virtual environment for ML service
cd ../ml-fastapi
python -m venv venv
# On Windows: .\venv\Scripts\activate | On Linux/Mac: source venv/bin/activate
pip install -r requirements.txt
alembic upgrade head

# 4. Launch all internal services concurrently
cd ..
npm start
```

Access the dashboard at [http://localhost:3000](http://localhost:3000) and ML docs at [http://localhost:8000/docs](http://localhost:8000/docs).

---

## 💻 System Requirements

- **Operating System**: Windows 10/11, macOS, or Ubuntu Linux 20.04+.
- **Node.js**: `v20.x`, `v22.x`, or `v24.x` (LTS recommended).
- **Python**: `3.10` - `3.13` (64-bit).
- **PostgreSQL**: `15` - `18` with the **`pgvector`** extension installed.
- **Docker & Docker Compose**: Docker Desktop (Windows/macOS) or Docker Engine (Linux).
- **Hardware**: Minimum 8 GB RAM (16 GB recommended for transformer models). NVIDIA GPU optional (CUDA enabled if available).

---

## 📦 Directory Structure

```text
MediaMonitor/
├── README.md                           # Main repository entrypoint
├── docs/                               # Detailed technical guides
│   ├── SETUP_GUIDE.md                  # Comprehensive setup & troubleshooting manual
│   └── nitter_version_history.md       # Upstream Nitter commits & rollback registry
├── nitter-dev/                         # Dockerized Twitter scraper
│   ├── compose.yml                     # Nitter + Redis Docker services
│   ├── nitter.conf                     # Nitter server & cache settings
│   ├── sessions-dev.jsonl              # Twitter cookie sessions pool
│   ├── proxies.json                    # Residential proxy pool (optional)
│   └── proxy_rotator.js                # Local HTTP proxy rotator (optional)
└── internal_services/                  # Core application services
    ├── package.json                    # Master orchestration runner configuration
    ├── start.js                        # Master runner script
    ├── media_monitor/                  # Next.js 16 Web Dashboard & Ingestion Engine
    │   ├── .env.example                # Frontend environment template
    │   ├── package.json                # Dependencies: next, react, cheerio, pg, lucide
    │   ├── run_migrations.js           # Automated SQL migration runner
    │   ├── app/                        # App Router (pages: /profile, /tweet, /maps, /topics)
    │   ├── components/                 # UI components (charts, timelines, maps)
    │   ├── db/migrations/              # Raw SQL migrations (001 to 014)
    │   ├── pipeline/                   # Ingestion scripts (ingestTweets.ts, ingestKeywordTweets.ts)
    │   └── services/                   # Service layer (nitterService, tweetService, etc.)
    └── ml-fastapi/                     # FastAPI Machine Learning Service
        ├── .env.example                # Backend environment template
        ├── main.py                     # FastAPI entrypoint with model preloading
        ├── requirements.txt            # Python dependencies
        ├── alembic.ini                 # Database migration configuration
        ├── api/routes/                 # Endpoints (/embed, /search, /tweets, /maps, /intelligence)
        ├── database/                   # SQLAlchemy async models & Alembic versions
        └── services/                   # Model loading, embedding cache, UMAP projections
```

---

## 🛠️ Detailed Step-by-Step Setup

### 1. Database Configuration & pgvector

MediaMonitor requires a PostgreSQL database called `media_monitor` with the `vector` extension.

#### A. Install `pgvector`
- **Windows**: Download the binary from [pgvector releases](https://github.com/pgvector/pgvector/releases), copy `vector.dll` into PostgreSQL's `lib` directory, and copy `.sql`/`.control` files into `share/extension`.
- **Linux**: `sudo apt install postgresql-server-dev-all && git clone https://github.com/pgvector/pgvector && cd pgvector && make && sudo make install`.
- **macOS**: `brew install pgvector`.
- **Docker**: Run `docker run -d --name media-monitor-pg -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=root -e POSTGRES_DB=media_monitor -p 5432:5432 pgvector/pgvector:pg16`.

#### B. Create Database
Run the setup script:
```powershell
# Windows PowerShell
$env:PGPASSWORD="root"
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -h localhost -p 5432 -d postgres -f "internal_services/media_monitor/db/setup/create_database.sql"
```
Or via SQL:
```sql
CREATE DATABASE media_monitor;
\c media_monitor
CREATE EXTENSION IF NOT EXISTS vector;
```

---

### 2. Environment Files Setup

#### Media Monitor (`internal_services/media_monitor/.env`)
Copy `internal_services/media_monitor/.env.example` to `.env`:
```ini
DATABASE_URL=postgresql://postgres:root@localhost:5432/media_monitor
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=media_monitor
POSTGRES_USER=postgres
POSTGRES_PASSWORD=root

ML_FASTAPI_URL=http://127.0.0.1:8000
NITTER_SESSIONS_FILE_PATH=../nitter-dev/sessions-dev.jsonl
```

Create `internal_services/media_monitor/.env.local` for private AI keys:
```ini
GEMINI_API_KEY=your_google_gemini_api_key_here
ML_FASTAPI_URL=http://127.0.0.1:8000
```

#### ML FastAPI (`internal_services/ml-fastapi/.env`)
Copy `internal_services/ml-fastapi/.env.example` to `.env`:
```ini
APP_NAME=ML FastAPI Service
ENVIRONMENT=local
DEBUG=false
LOG_LEVEL=INFO
API_PREFIX=
CORS_ORIGINS=["http://localhost:3000","http://localhost:8000"]

DATABASE_URL=postgresql+asyncpg://postgres:root@127.0.0.1:5432/media_monitor
DATABASE_POOL_SIZE=10
DATABASE_MAX_OVERFLOW=20

EMBEDDING_MODEL_NAME=sentence-transformers/all-MiniLM-L6-v2
EMBEDDING_DIMENSION=384
EMBEDDING_BATCH_SIZE=64
NORMALIZE_EMBEDDINGS=true

CLASSIFIER_PATH=artifacts/classifier.joblib
LABEL_ENCODER_PATH=artifacts/label_encoder.pkl
ALLOW_MISSING_ARTIFACTS=true
```

---

### 3. Frontend Setup (`media_monitor`)

Navigate to `internal_services/media_monitor` and install packages:

```bash
cd internal_services/media_monitor
npm install
```

---

### 4. ML Microservice Setup (`ml-fastapi`)

Create a Python virtual environment and install packages:

**Windows (PowerShell)**:
```powershell
cd internal_services\ml-fastapi
python -m venv venv
.\venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
```

**Linux / macOS**:
```bash
cd internal_services/ml-fastapi
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

> **Note**: Transformer models (`all-MiniLM-L6-v2`, `all-MiniLM-L12-v2`, `all-mpnet-base-v2`, `paraphrase-multilingual-MiniLM-L12-v2`) are downloaded automatically on first start and cached locally in `~/.cache/huggingface`.

---

### 5. Scraper Setup (`nitter-dev`)

1. Start Docker Desktop.
2. Build and run Nitter with Redis:
```bash
cd nitter-dev
docker compose up -d
```
3. Test scraper accessibility: open [http://localhost:8081](http://localhost:8081) in your browser.
4. Cookie sessions are stored in `nitter-dev/sessions-dev.jsonl`. You can monitor and validate their health from the MediaMonitor UI at `http://localhost:3000/dev`.

---

### 6. Database Migrations Execution

Run the automated migrations to build all 23 database tables, foreign keys, and vector indexes:

#### A. Media Monitor SQL Migrations
```bash
cd internal_services/media_monitor
node run_migrations.js
```
*Applies migrations `001` through `014` safely and idempotently.*

#### B. ML FastAPI Alembic Migrations
```bash
cd internal_services/ml-fastapi
# Activate venv first
alembic upgrade head
```
*Creates `documents`, `embedding_runs`, and partial HNSW indexes.*

---

## 🚀 Running the Project

### Method A: Master Orchestration Runner (Recommended)

Run the unified runner from the `internal_services/` directory:

```bash
cd internal_services
npm start
```
*(or `node start.js`)*

**What this does automatically:**
- Concurrently spins up Next.js on port `3000`.
- Concurrently spins up FastAPI on port `8000` via Uvicorn.
- Attaches to Nitter Docker logs.
- Color-codes and organizes console output.
- Logs a readiness banner when all systems are online.
- Starts an hourly background cache cleanup cron job (`http://localhost:3000/api/cron/cleanup`).
- Handles graceful shutdown (`Ctrl + C`) by cleanly terminating all subprocesses.

---

### Method B: Running Individual Services for Development

Open three separate terminals:

```bash
# Terminal 1: Scraper
cd nitter-dev
docker compose up

# Terminal 2: Machine Learning Service
cd internal_services/ml-fastapi
# Activate venv
uvicorn main:app --host 127.0.0.1 --port 8000 --reload

# Terminal 3: Media Monitor Frontend
cd internal_services/media_monitor
npm run dev
```

---

## 🔍 Verification & Health Checks

Verify your setup by checking these URLs:

| Service | URL | Check |
| :--- | :--- | :--- |
| **MediaMonitor Dashboard** | [http://localhost:3000](http://localhost:3000) | Main interface loads |
| **ML Swagger API Docs** | [http://localhost:8000/docs](http://localhost:8000/docs) | Interactive API exploration |
| **ML Process Health** | [http://localhost:8000/health](http://localhost:8000/health) | Returns `{"status":"ok"}` |
| **Nitter Web Scraper** | [http://localhost:8081](http://localhost:8081) | Nitter homepage renders |
| **Nitter Session Health** | [http://localhost:3000/api/nitter-health](http://localhost:3000/api/nitter-health) | Displays active cookie health |

### Quick Vector Embedding Smoke Test:
```bash
curl -X POST http://localhost:8000/embed \
  -H "Content-Type: application/json" \
  -d '{"texts": ["Hello MediaMonitor!"]}'
```

---

## 🌟 Key Platform Features

- **Profile Intelligence (`/analyse-profile`, `/profile`)**: Deep-scrape Twitter user timelines, analyze posting patterns, extract top hashtags, and generate engagement stats.
- **Tweet & Thread Analysis (`/analyse-tweet`, `/tweet`)**: Thread reconstruction with zero-shot stance classification (Agree/Disagree/Neutral) powered by DeBERTa.
- **Keyword & Topic Tracking (`/analyse-keyword`, `/keyword`, `/topics`)**: Ingest tweets matching specific query strings and monitor sentiment and frequency trends.
- **Interactive 2D Semantic Maps (`/maps`)**: Global and topic-specific 2D UMAP projections of profiles based on semantic tweet embeddings (Canonical, Narrative, and Ideological projections).
- **Cross-Model Embedding Comparison (`/compare`, `/compare-st`)**: Benchmark different sentence-transformer models side-by-side (`MiniLM`, `E5`, `BGE-M3`, `MPNet`).
- **Session & Developer Tools (`/dev`)**: Inspect live Twitter cookie pool health, quotas, duplicate checkers, and cache purges.

---

## 📚 API Reference

### ML FastAPI (`http://localhost:8000`)

- `GET /health`: Basic health check.
- `POST /embed`: Generate query-time embeddings without persisting.
- `POST /tweets/embed-async`: Asynchronously compute and persist embeddings for a batch of tweets into `tweet_embeddings`.
- `POST /tweets/search`: Semantic vector search against stored tweets.
- `POST /tweets/analyze-thread`: Compute embeddings and stance predictions across a tweet conversation thread.
- `GET /intelligence/profile-topic/{profile_id}/{topic_id}/stream`: Server-Sent Events (SSE) stream of profile topic intelligence scoring.
- `POST /maps/global/generate`: Trigger background generation of 2D UMAP coordinates for all monitored profiles.
- `POST /maps/topic/{topic_id}/generate`: Trigger background generation of topic-specific 2D coordinates.

### Next.js API Routes (`http://localhost:3000/api`)

- `GET /api/nitter-health`: Real-time health metrics of the Nitter scraper and cookie pool.
- `GET /api/cron/cleanup`: Hourly routine removing expired cached tweets and temporary replies.
- `POST /api/dev/sessions`: Add, test, or update Twitter cookies in `sessions-dev.jsonl`.
- `POST /api/intelligence/stream`: Client bridge for streaming profile intelligence calculations.

---

## 🔧 Troubleshooting

| Issue | Cause | Fix |
| :--- | :--- | :--- |
| **`failed to connect to the docker API`** | Docker Desktop is closed | Launch Docker Desktop and wait until it is in the "Running" state. |
| **`Cannot find module 'pg'`** | npm packages not installed | Run `npm install` inside `internal_services/media_monitor`. |
| **`extension "vector" is not available`** | `pgvector` not installed in PostgreSQL | Install `pgvector` extension binaries or run PostgreSQL via `pgvector/pgvector:pg16` Docker image. |
| **`No module named 'fastapi'`** | Python virtualenv inactive | Activate virtualenv (`.\venv\Scripts\Activate.ps1` or `source venv/bin/activate`) and run `pip install -r requirements.txt`. |
| **Port `3000`, `8000`, or `8081` in use** | An existing process is bound to the port | Check port with `Get-NetTCPConnection -LocalPort 3000` (Windows) or `lsof -i :3000` (Linux/Mac) and terminate the process. |
| **Nitter `403` or scraping failure** | Twitter cookies expired | Visit `http://localhost:3000/dev` to check sessions; add fresh `auth_token` and `ct0` values in `nitter-dev/sessions-dev.jsonl` and run `docker compose restart nitter-dev`. |

---

## 📖 Additional Documentation

- [Detailed Technical Setup Guide](file:///c:/Users/Sveltetech/Desktop/MediaMonitor%20-%20Copy/docs/SETUP_GUIDE.md)
- [Nitter Version History & Rollback Registry](file:///c:/Users/Sveltetech/Desktop/MediaMonitor%20-%20Copy/docs/nitter_version_history.md)
- [Database Schema & Partitioning Notes](file:///c:/Users/Sveltetech/Desktop/MediaMonitor%20-%20Copy/internal_services/media_monitor/db/README.md)
