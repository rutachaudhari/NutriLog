# NutriLog — Architecture Document

> **Version:** 1.0  
> **Date:** 2026-05-25  
> **Stack:** React 19 + Vite / Spring Boot 3 / SQLite

---

## 1. System Overview

NutriLog is a locally-hosted, zero-cost nutrition tracker. All components run on a single machine — no cloud, no accounts, no paid infrastructure required.

```mermaid
C4Context
    title NutriLog — System Context

    Person(user, "User", "Logs meals and tracks nutrition via a browser")

    System_Boundary(local, "localhost") {
        System(frontend, "React Frontend", "Vite dev server on :5173. Profile cards, dashboard, meal entry.")
        System(backend, "Spring Boot Backend", "REST API on :8080. Meal parsing, profile management, calorie goal calculation.")
        SystemDb(db, "SQLite", "Single-file database. Profiles, meals, nutrient totals.")
    }

    System_Ext(groq, "Groq API (Llama 3)", "Free LLM. Parses free-text meal descriptions into structured food items.")
    System_Ext(usda, "USDA FoodData Central", "Free nutrient database. Verifies LLM estimates per food item.")
    System_Ext(off, "Open Food Facts", "Free fallback nutrient API. No API key required.")

    Rel(user, frontend, "Uses", "Browser")
    Rel(frontend, backend, "Calls", "HTTP/JSON on :8080")
    Rel(backend, db, "Reads/Writes", "JDBC / JdbcTemplate")
    Rel(backend, groq, "Parses meal text", "HTTPS")
    Rel(backend, usda, "Verifies nutrients", "HTTPS")
    Rel(backend, off, "Fallback lookup", "HTTPS")
```

---

## 2. Component Architecture

### 2.1 Backend Layers

```mermaid
flowchart TD
    subgraph Controllers
        MC[MealController]
        PC[ProfileController]
        SC[SummaryController]
        HC[HealthController]
    end

    subgraph Services
        MPO[MealParserOrchestrator]
        LLM[LlmParserService]
        USDA[UsdaLookupService]
        OFF[OpenFoodFactsService]
        CGS[CalorieGoalService]
        SS[StartupService]
    end

    subgraph Repositories
        MR[MealRepository]
        PR[ProfileRepository]
    end

    subgraph Infrastructure
        DB[(SQLite\nnurilog.db)]
        CORS[CorsConfig]
        WC[WebClientConfig]
        EH[GlobalExceptionHandler]
    end

    MC --> MPO
    MC --> MR
    PC --> PR
    PC --> CGS
    SC --> MR

    MPO --> LLM
    MPO --> USDA
    MPO --> OFF

    MR --> DB
    PR --> DB
    SS --> DB

    WC -.-> USDA
    WC -.-> OFF
    WC -.-> LLM
```

### 2.2 Frontend Structure

```mermaid
flowchart TD
    main[main.jsx\nReact root + Router]
    Layout[Layout.jsx\nShared shell / nav]
    LP[LandingPage.jsx\nProfile cards grid]
    DP[DashboardPage.jsx\nStats + meal entry]
    API[api/client.js\nFetch wrapper]

    main --> Layout
    Layout --> LP
    Layout --> DP
    LP --> API
    DP --> API

    API -->|GET /profiles| LP
    API -->|POST /meals/parse| DP
    API -->|GET /summary| DP
    API -->|POST /meals| DP
```

---

## 3. Meal Parsing Pipeline

The pipeline is the core of NutriLog. It runs entirely on the backend and produces structured nutrient data from a plain-English meal description.

```mermaid
flowchart TD
    INPUT([User types meal description])
    LLM_CALL[LlmParserService\nSend text to Groq / OpenAI\nReturn structured food items]
    LLM_OK{LLM returned\nitems?}
    SPLIT[Split description on\n'and' / ',' / 'with']

    subgraph PARALLEL [Resolve each item in parallel - Reactor Flux]
        HAS_NUTRIENTS{Item has\nnon-zero nutrients?}
        LLM_EST[Mark source = llm_estimate\nUse LLM values directly]
        USDA_CALL[UsdaLookupService\nSearch USDA FoodData Central\nScale to quantity_g]
        USDA_OK{USDA\nmatch found?}
        OFF_CALL[OpenFoodFactsService\nFallback lookup\nScale to quantity_g]
        OFF_OK{OFF\nmatch found?}
        USDA_RESULT[Mark source = usda]
        OFF_RESULT[Mark source = open_food_facts]
        NOT_FOUND[Mark source = not_found\nFlag for manual entry]
    end

    SUM[Sum totals\ncalories / protein / fat / fiber]
    RESPONSE([ParseResponse returned to controller])

    INPUT --> LLM_CALL
    LLM_CALL --> LLM_OK
    LLM_OK -->|Yes| HAS_NUTRIENTS
    LLM_OK -->|No| SPLIT
    SPLIT --> USDA_CALL

    HAS_NUTRIENTS -->|Yes| LLM_EST
    HAS_NUTRIENTS -->|No| USDA_CALL

    USDA_CALL --> USDA_OK
    USDA_OK -->|Yes| USDA_RESULT
    USDA_OK -->|No| OFF_CALL
    OFF_CALL --> OFF_OK
    OFF_OK -->|Yes| OFF_RESULT
    OFF_OK -->|No| NOT_FOUND

    LLM_EST --> SUM
    USDA_RESULT --> SUM
    OFF_RESULT --> SUM
    NOT_FOUND --> SUM
    SUM --> RESPONSE
```

### Source badge values

| `source` value | Meaning |
|---|---|
| `usda` | Nutrients from USDA FoodData Central (most authoritative) |
| `open_food_facts` | Nutrients from Open Food Facts fallback |
| `llm_estimate` | LLM returned plausible nutrient data; no external API match needed |
| `not_found` | No data found anywhere — frontend shows manual entry field |

---

## 4. API Request/Response Flow

```mermaid
sequenceDiagram
    participant U as User (Browser)
    participant FE as React Frontend
    participant BE as Spring Boot
    participant LLM as Groq / OpenAI
    participant USDA as USDA API
    participant OFF as Open Food Facts
    participant DB as SQLite

    U->>FE: Types "2 scrambled eggs and toast with butter"
    FE->>BE: POST /meals/parse { description }
    BE->>LLM: Chat completion request
    LLM-->>BE: [{name, quantity_g, calories, protein_g, fat_g, fiber_g}, ...]
    par USDA lookup per item
        BE->>USDA: GET /foods/search?query=scrambled+eggs
        USDA-->>BE: Nutrient data (scaled to quantity_g)
    and
        BE->>USDA: GET /foods/search?query=toast
        USDA-->>BE: Nutrient data
    end
    Note over BE: Items with no USDA match → Open Food Facts
    BE->>OFF: GET /cgi/search.pl?search_terms=butter
    OFF-->>BE: Nutrient data
    BE-->>FE: ParseResponse { items[], totals{} }
    FE->>U: Shows breakdown preview per food item

    U->>FE: Clicks "Save Meal"
    FE->>BE: POST /meals { profile_id, description, items[], totals }
    BE->>DB: INSERT INTO meals
    DB-->>BE: OK
    BE-->>FE: 201 Created
    FE->>BE: GET /summary?profile_id=1&date=today
    BE->>DB: SELECT SUM(calories) ...
    DB-->>BE: today_calories, week_calories
    BE-->>FE: SummaryResponse
    FE->>U: Dashboard totals refresh
```

---

## 5. Database Schema

```mermaid
erDiagram
    profiles {
        int id PK
        text name
        datetime created_at
        int age
        text gender
        real height_cm
        real current_weight_kg
        real target_weight_kg
        text activity_level
        real weekly_rate_kg
        real recommended_daily_calories
    }

    meals {
        int id PK
        int profile_id FK
        datetime logged_at
        text description
        real calories
        real protein_g
        real fat_g
        real fiber_g
        text items_json
    }

    profiles ||--o{ meals : "has"
```

**Schema notes:**
- `items_json` stores the raw `ParsedFoodItem[]` array as a JSON blob — no separate items table.
- Both tables use `CREATE TABLE IF NOT EXISTS` so the schema is re-applied idempotently on every startup.
- Indexes on `meals.profile_id` and `meals.logged_at` cover the common query patterns (`GET /meals` filter + `GET /summary` aggregation).

---

## 6. Startup Lifecycle

```mermaid
stateDiagram-v2
    [*] --> AppStart
    AppStart --> SchemaInit: StartupService runs\n(ApplicationRunner)
    SchemaInit --> CheckDBSize: Apply schema.sql\n(idempotent CREATE IF NOT EXISTS)
    CheckDBSize --> PurgeOldMeals: DB file > 100 MB
    CheckDBSize --> Ready: DB file ≤ 100 MB
    PurgeOldMeals --> LogResult: DELETE meals WHERE logged_at < now - 12 months
    LogResult --> Ready
    Ready --> [*]
```

---

## 7. Calorie Goal Calculation

Implemented in `CalorieGoalService` — pure Java, no external API.

```mermaid
flowchart LR
    IN[Profile data\nage / gender / height\ncurrent weight / activity level\nweekly rate]

    BMR[Mifflin-St Jeor BMR\nmale: 10w + 6.25h − 5a + 5\nfemale: 10w + 6.25h − 5a − 161]

    TDEE[TDEE = BMR × activity multiplier\nSedentary → 1.2\nLightly active → 1.375\nModerately active → 1.55\nVery active → 1.725]

    GOAL[Daily calorie target\nLoss → TDEE − 500\nGain → TDEE + 300]

    WEEKS[Weeks to target\n= Δweight × 7700 ÷ 500]

    IN --> BMR --> TDEE --> GOAL
    GOAL --> WEEKS
```

---

## 8. Configuration & Environment

| Variable | Required | Default | Source |
|---|---|---|---|
| `GROQ_API_KEY` | Yes (default LLM) | — | Free — console.groq.com |
| `USDA_API_KEY` | Yes | — | Free — fdc.nal.usda.gov |
| `LLM_PROVIDER` | No | `groq` | `groq` or `openai` |
| `OPENAI_API_KEY` | Only if `openai` | — | api.openai.com |
| `NUTRILOG_DB_PATH` | No | `./backend/nutrilog.db` | Override SQLite path |

**LLM switching:** both providers use the OpenAI-compatible chat API. `LlmParserService.callLlmApi()` handles both with a single code path — only the base URL and API key change.

**SQLite pool:** `hikari.maximum-pool-size=1`. SQLite does not support concurrent writes; this must never be increased.

---

## 9. Key Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| LLM-first parsing | Groq (Llama 3) primary; USDA + Open Food Facts verify | Handles regional/colloquial food names that keyword matching misses; Groq free tier = zero cost |
| Parallel API calls | Reactor `Flux.flatMap` | USDA lookups per item are independent — parallel cuts wall-clock time significantly |
| No ORM | Raw `JdbcTemplate` | Schema is small; JdbcTemplate is sufficient and avoids Hibernate startup overhead |
| Single SQLite file | `hikari.maximum-pool-size=1` | Local-only app; zero setup; all data in one portable file |
| `items_json` blob | JSON column on `meals` | Avoids a third table for food items; query patterns only need meal-level aggregates |
| Graceful degradation | 4-step pipeline with `not_found` fallback | Every step can fail independently; user always gets a result they can correct manually |
