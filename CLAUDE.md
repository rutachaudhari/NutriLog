# NutriLog

Full-stack nutrition tracker: React/Vite frontend + Spring Boot 3 backend + SQLite.
Runs entirely on localhost — no cloud, no paid services required.

## Commands

```bash
# Backend (port 8080)
cd backend && ./mvnw spring-boot:run

# Frontend (port 5173)
cd frontend && npm run dev

# Backend tests
cd backend && ./mvnw test

# Frontend lint
cd frontend && npm run lint
```

## Environment Setup

Copy `backend/.env.example` and set these before starting the backend:

| Variable | Required | Source |
|---|---|---|
| `GROQ_API_KEY` | Yes (default LLM) | Free — console.groq.com |
| `USDA_API_KEY` | Yes | Free — fdc.nal.usda.gov |
| `LLM_PROVIDER` | No | `groq` (default) or `openai` |
| `OPENAI_API_KEY` | Only if `LLM_PROVIDER=openai` | api.openai.com |
| `NUTRILOG_DB_PATH` | No | Override SQLite file path (default: `./backend/nutrilog.db`) |

## Architecture

```
frontend/        React 19 + Vite, CSS Modules, React Router v7
  src/api/       fetch wrapper (client.js)
  src/pages/     LandingPage, DashboardPage
  src/components/ Layout (shared shell)

backend/         Spring Boot 3 + Java 17, JdbcTemplate (no ORM)
  src/.../controller/   REST endpoints
  src/.../service/      LlmParserService → UsdaLookupService → OpenFoodFactsService
  src/.../model/        POJOs
  src/main/resources/   application.properties, schema.sql
  nutrilog.db           SQLite data file (gitignored)
```

Backend listens on `http://localhost:8080`. Frontend dev server on `http://localhost:5173`.
No proxy configured — API calls go directly to 8080.

## Key Gotchas

- **SQLite pool size is locked to 1** (`hikari.maximum-pool-size=1`). SQLite doesn't support concurrent writes; never increase this.
- **`StartupService` runs on every boot**: initialises schema from `schema.sql`, then purges meals older than 12 months if the DB file exceeds 100 MB. Don't add blocking work here.
- **Meal parsing is a 4-step pipeline**: LLM parse → USDA verify (parallel, WebClient) → Open Food Facts fallback → manual. `source` field on each item shows which step resolved it: `usda | open_food_facts | llm_estimate | not_found`.
- **`LLM_PROVIDER=openai`** switches the LLM from Groq to OpenAI; both use the same OpenAI-compatible chat API so `LlmParserService.callLlmApi()` handles both with one code path.
- **No ORM** — all DB access is raw `JdbcTemplate`. Schema lives in `schema.sql` and is re-applied on every start (idempotent `CREATE TABLE IF NOT EXISTS`).

## API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/profiles` | List all profiles |
| POST | `/profiles` | Create profile |
| PUT | `/profiles/{id}` | Update profile (recalculates calorie goal) |
| DELETE | `/profiles/{id}` | Delete profile + all meals |
| POST | `/meals/parse` | Parse meal text — no DB write |
| POST | `/meals` | Save confirmed meal |
| GET | `/meals` | Filter by `profileId` and `date` |
| DELETE | `/meals/{id}` | Delete meal |
| GET | `/summary` | Today + weekly calorie totals for a profile |

## Docs

Full spec in `docs/PROJECT_OVERVIEW.md`. Task lists in `docs/tasks/`.
