# ML FastAPI Service

Production-oriented FastAPI service for tweet/text classification, embedding generation, vector persistence, and semantic search.

The service is designed to replace notebook-style execution with long-lived application resources:

- The sentence-transformer model loads once during FastAPI startup.
- Classifier artifacts load once during FastAPI startup.
- Embeddings for stored documents are generated once and persisted in PostgreSQL using pgvector.
- Incoming prediction and search queries generate only request-time embeddings.
- Vector search uses pgvector indexes and supports label filtering.

## Architecture

```text
Raw text
  -> preprocessing
  -> embedding generation
  -> PostgreSQL pgvector persistence
  -> classifier prediction or vector similarity search
```

Key boundaries:

- `api/` contains route handlers, request/response schemas, dependencies, and middleware.
- `services/` contains ML and domain orchestration logic.
- `database/` contains SQLAlchemy models, repositories, sessions, and Alembic migrations.
- `config/` contains environment-driven settings and structured logging.
- `artifacts/` contains model files loaded at startup.

## API

### `GET /health`

Returns a basic process health response.

### `POST /embed`

Generates embeddings for incoming text. This endpoint is for query-time or diagnostic embedding generation and does not persist documents.

```bash
curl -X POST http://localhost:8000/embed \
  -H "Content-Type: application/json" \
  -d '{"texts":["FastAPI service for ML inference"]}'
```

### `POST /documents`

Indexes labeled or unlabeled text into PostgreSQL. Embeddings are generated once and stored in `documents.embedding`.

```bash
curl -X POST http://localhost:8000/documents \
  -H "Content-Type: application/json" \
  -d '{"texts":["I love this product","This failed badly"],"label":"feedback","metadata":{"source":"twitter"}}'
```

### `POST /search`

Embeds the query once, searches stored vectors, and optionally filters by label.

```bash
curl -X POST http://localhost:8000/search \
  -H "Content-Type: application/json" \
  -d '{"query":"positive product feedback","limit":5,"label":"feedback","metadata":{"source":"twitter"}}'
```

### `POST /predict`

Runs preprocessing, embedding, and classifier inference using artifacts loaded at startup.

```bash
curl -X POST http://localhost:8000/predict \
  -H "Content-Type: application/json" \
  -d '{"text":"This launch is excellent","include_probabilities":true}'
```

If classifier artifacts are missing and `ALLOW_MISSING_ARTIFACTS=true`, startup still succeeds but `/predict` returns `503` until artifacts are available.

## Local Development

1. Create your environment file:

```bash
cp .env.example .env
```

2. Start PostgreSQL and the API:

```bash
docker compose up --build
```

3. Open the API docs:

```text
http://localhost:8000/docs
```

The container runs `alembic upgrade head` before starting Uvicorn.

## Training Workflow

Training reads labeled embeddings from PostgreSQL instead of recomputing historical embeddings.

1. Ingest labeled documents through `POST /documents`.
2. Train artifacts from persisted embeddings:

```bash
docker compose exec api python scripts/train_classifier.py
```

3. Restart the API so startup loads the new artifacts:

```bash
docker compose restart api
```

Generated artifacts:

- `artifacts/classifier.joblib`
- `artifacts/label_encoder.pkl`

For production, build artifacts in a controlled training job and ship them as immutable deployment assets.

## Database

The main table is `documents`:

```text
id          integer primary key
text        text not null
label       varchar(255)
metadata    jsonb
embedding   vector(384) not null
created_at  timestamptz
```

Migration `0001_create_documents` enables the `vector` extension and creates:

- `ix_documents_label`
- `ix_documents_metadata_gin`
- `ix_documents_embedding_hnsw_cosine`

The repository layer is intentionally small so future hybrid search can add full-text indexes and metadata filters without leaking SQL into route handlers.

## Configuration

Settings are loaded from environment variables via `pydantic-settings`.

Important variables:

- `DATABASE_URL`
- `EMBEDDING_MODEL_NAME`
- `EMBEDDING_BATCH_SIZE`
- `CLASSIFIER_PATH`
- `LABEL_ENCODER_PATH`
- `ALLOW_MISSING_ARTIFACTS`
- `CORS_ORIGINS`

## Production Notes

- Use managed PostgreSQL with pgvector enabled or the `pgvector/pgvector` image.
- Keep model artifacts immutable per release.
- Set `ALLOW_MISSING_ARTIFACTS=false` in production if prediction is required for startup readiness.
- Add authentication and rate limiting at the gateway or middleware layer before exposing public traffic.
- Add a readiness endpoint that checks database connectivity if orchestration needs dependency-aware health checks.
- Use a separate batch ingestion or training worker for large datasets.

## Development Commands

Run migrations:

```bash
alembic upgrade head
```

Run API locally without Docker:

```bash
uvicorn main:app --reload
```

Train classifier locally:

```bash
python scripts/train_classifier.py
```
