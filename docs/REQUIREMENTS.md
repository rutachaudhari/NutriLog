# NutriLog — Requirements

> **Version:** 3.0
> **Date:** 2026-04-12
> **Status:** Active — web app, zero-cost stack
> **Stack:** React (Vite) · Java 17 + Spring Boot 3 · SQLite · Groq API (Llama 3) · USDA FoodData Central API · Open Food Facts API

---

## 1. Goals & Constraints

| # | Constraint | Detail |
|---|---|---|
| G1 | Zero cost | No paid services required. Groq API (default LLM) is free. USDA API key is free. OpenAI gpt-4o-mini is an optional alternative at near-zero personal use cost. |
| G2 | Local only | Runs on localhost — no cloud hosting, no deployment |
| G3 | No auth | No login, no accounts — just open the app and use it |
| G4 | Dynamic profiles | Any number of profiles, user-created, named freely |
| G5 | 4 nutrients only | Calories, protein (g), fat (g), fiber (g) — nothing else |
| G6 | LLM-assisted meal parsing | Groq free tier (Llama 3) as primary parser; USDA FoodData Central verifies nutrient data; Open Food Facts as secondary fallback; manual entry as last resort |
| G7 | Free calorie goals | Mifflin-St Jeor equation computed on the backend — pure math, no API |
| G8 | Ship fast | Buildable by a solo developer in a short sprint |

---

## 2. Stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend | React (Vite) | Component-based UI; Vite for fast local dev |
| Backend | Java 17 + Spring Boot 3 | Spring MVC for REST; JdbcTemplate for SQLite; WebClient for async external calls |
| Storage | SQLite (via JDBC) | Single local file; `org.xerial:sqlite-jdbc` driver; no ORM; no DB server needed |
| Meal parsing — LLM (primary) | Groq API (Llama 3 8B, free tier) | Default; configurable to OpenAI gpt-4o-mini via `LLM_PROVIDER=openai`; handles regional food names |
| Meal parsing — USDA (verify) | USDA FoodData Central API | Free; verifies and overrides LLM estimates with authoritative data |
| Meal parsing — fallback | Open Food Facts API | Free, no key; used when USDA has no match |
| Calorie goal calculation | Mifflin-St Jeor equation | Pure Java on the Spring Boot backend; no external service |

---

## 3. Functional Requirements

### 3.1 Landing Page

**User Story:** As a user, I want to see all my profiles on the landing page so I can navigate into any profile's dashboard or create a new one.

| ID | Requirement | Acceptance Criteria |
|---|---|---|
| F-01 | Landing page shows all existing profile cards (fetched from backend) plus an "Add Profile" button | Each card shows profile name + today's calorie count (e.g. "840 kcal today"). Empty state: "Welcome to NutriLog. Create your first profile to get started." |
| F-02 | Clicking a profile card navigates to that profile's dashboard | Browser route changes (e.g. `/dashboard/1`); dashboard has an explicit "← All Profiles" link for navigation back |
| F-03 | Clicking "Add Profile" opens a profile creation modal | Form is shown as a centered modal overlay; single `POST /profiles` call on submit; modal closes and user is navigated to the new dashboard on success |
| F-04 | User can delete a profile from the landing page | Deletion requires a confirmation step; confirmation copy: "Delete [name]? This will permanently remove all their meal history. This cannot be undone."; confirmed deletion removes the profile and ALL its associated meals from the database |

---

### 3.2 Dashboard (per profile)

**User Story:** As a user, I want my dashboard to show my calorie summary, weight progress, and recommended intake at a glance so I can understand how I am tracking without any manual calculation.

| ID | Requirement | Acceptance Criteria |
|---|---|---|
| F-09 | Dashboard displays the profile name as the page heading | Heading reads "[Name]'s Dashboard" (e.g. "Ruta's Dashboard") so users always know which profile they are viewing |
| F-10 | Dashboard shows today's total calorie count | Sum of calories across all meals logged today for this profile |
| F-11 | Dashboard shows this week's total calorie count | Sum of calories across Mon–Sun of the current ISO week |
| F-12 | Dashboard shows current weight (kg) | Pulled from profile; user-entered and stored locally |
| F-13 | Dashboard shows target weight (kg) | Pulled from profile; user-entered and stored locally |
| F-14 | Dashboard shows recommended daily calorie intake | Calculated from profile fields using Mifflin-St Jeor; see section 5 for formula. Displayed first (above today's count) so the goal is always the reference point |
| F-15 | Dashboard has a "Log a Meal" section with a free-text input field | Text field accepts any string; submission triggers the meal parsing flow |
| F-16 | Today's calorie count and weekly count update immediately after a meal is confirmed | No page refresh required |

---

### 3.3 Meal Logging — Parsing Flow

**User Story:** As a user, I want to type a meal in plain English and have the app look up the nutritional content automatically, so I do not have to enter numbers manually.

| ID | Requirement | Acceptance Criteria |
|---|---|---|
| F-20 | User enters a free-text meal description (e.g. "2 scrambled eggs and a slice of toast") | Text input accepts any string |
| F-21 | Backend sends the input to the configured LLM (Groq by default). LLM returns a structured JSON array of food items with estimated nutrients. If LLM is unavailable, falls back to basic tokenisation. | LLM response contains `[{name, quantity_g, calories, protein_g, fat_g, fiber_g}]`; empty list triggers tokenizer fallback |
| F-22 | For each item returned by the LLM, backend queries USDA FoodData Central to verify and override the LLM's nutrient estimates with authoritative data | USDA per-100g values scaled to the LLM-inferred quantity; `source` flagged as `"usda"` |
| F-22b | If USDA verifies an item, use USDA's nutrient values (override LLM estimate). If USDA has no match, keep the LLM estimate unless Open Food Facts provides a better match. | `source` field reflects which data source was ultimately used: `"usda"`, `"open_food_facts"`, `"llm_estimate"`, or `"not_found"` |
| F-23 | If USDA returns no result for an item, backend queries Open Food Facts | Uses the Open Food Facts search API as fallback |
| F-24 | If neither source finds a result, that item is flagged as "not found" | User sees the item listed with blank nutrient fields and a manual entry prompt |
| F-25 | User can manually enter calories (and optionally protein, fat, fiber) for any "not found" item | Inline numeric inputs appear per unfound item before the user confirms the meal |
| F-26 | Backend sums the 4 nutrients across all items to produce meal totals | Calories, protein (g), fat (g), fiber (g) all totalled |
| F-27 | User sees a breakdown before confirming: each food item with its individual nutrient values, and the meal total | Confirmation step shown inline; user can review before saving |
| F-28 | User clicks "Save Meal" → meal is saved to SQLite | Row created in `meals` table with all 4 nutrient totals and the per-item breakdown; button label is "Save Meal" (not "Confirm") |
| F-29 | If the user cancels or navigates away, nothing is saved | A visible "Cancel" control discards the breakdown; no partial or phantom meal records |

---

### 3.4 Meal History

**User Story:** As a user, I want to see my logged meals so I can review what I have eaten and delete mistakes.

| ID | Requirement | Acceptance Criteria |
|---|---|---|
| F-30 | Dashboard (or a section within it) shows today's meals for the active profile | Meals listed in chronological order with description and calorie count |
| F-31 | User can delete a logged meal | Meal removed from DB; today's totals and weekly totals update immediately |
| F-32 | Meals are correctly scoped to the active profile | No cross-profile data visible |

---

### 3.5 Profile Management

**User Story:** As a user, I want to create profiles for each person in my household, set their physical stats and goals, and have the app calculate their recommended daily calories automatically.

| ID | Requirement | Acceptance Criteria |
|---|---|---|
| F-40 | Profile creation form includes the following fields: display name (free text, required), age (years), gender (male / female), height (cm), current weight (kg, required), target weight (kg, required), activity level (see options below), weekly rate of change (kg/week, e.g. 0.25 / 0.5) | Form is accessible from the "Add Profile" button on the landing page |
| F-40a | Current weight and target weight are required at profile creation | The recommended daily calorie goal is computed and displayed immediately after the profile is saved; the user does not need to revisit the profile form to see it |
| F-41 | Activity level options: Sedentary, Lightly Active, Moderately Active, Very Active | Maps to Mifflin-St Jeor multipliers: 1.2, 1.375, 1.55, 1.725 |
| F-42 | Recommended daily calorie intake is computed on the backend from these fields | Formula defined in section 5; no external API call |
| F-43 | Profile is saved to SQLite and persists across restarts | Editing profile recalculates recommended intake immediately |
| F-44 | Profile display name is editable | Name is a user-chosen free-text label (e.g. "Ruta", "Rahul"); it can be changed via the profile edit form at any time |

---

## 4. Non-Functional Requirements

| ID | Requirement | Target |
|---|---|---|
| N-01 | Meal parsing completes within 5 seconds | p95 < 5s including both external API calls |
| N-02 | App is fully usable offline except for the external food lookup APIs | SQLite reads/writes, profile, and calorie goal calculation work with no internet |
| N-03 | If USDA or Open Food Facts is unavailable, the app shows a clear error — no silent failures | Error message displayed per item; user can proceed with manual entry |
| N-04 | API keys stored in environment variables — never hardcoded | Required: `USDA_API_KEY` (free). Also required: `GROQ_API_KEY` (free, default) or `OPENAI_API_KEY` (if `LLM_PROVIDER=openai`). Backend reads from environment via `application.properties`. |
| N-05 | App starts with a single command per layer | Documented in README: `npm run dev` (frontend), `./mvnw spring-boot:run` (backend) |
| N-06 | Data persists across restarts | SQLite file is not ephemeral; verified after stop/restart cycle |

---

## 5. Calorie Goal Calculation (Mifflin-St Jeor)

All computation happens on the Spring Boot backend. No external service is called.

**Step 1 — Basal Metabolic Rate (BMR)**

```
Male:   BMR = (10 × weight_kg) + (6.25 × height_cm) − (5 × age) + 5
Female: BMR = (10 × weight_kg) + (6.25 × height_cm) − (5 × age) − 161
```

**Step 2 — Total Daily Energy Expenditure (TDEE)**

```
TDEE = BMR × activity_multiplier

Activity multipliers:
  Sedentary         → 1.200
  Lightly Active    → 1.375
  Moderately Active → 1.550
  Very Active       → 1.725
```

**Step 3 — Adjust for target weight**

```
Weekly rate of change in kg → daily calorie delta = (rate_kg_per_week × 7700) / 7

If target_weight < current_weight (loss): recommended = TDEE − daily_delta
If target_weight > current_weight (gain): recommended = TDEE + daily_delta
If target_weight = current_weight:        recommended = TDEE
```

`recommended_daily_calories` is stored on the profile row and recalculated whenever profile fields change.

---

## 6. Data Model (SQLite)

```sql
-- Profiles (user-created; table starts empty at startup)
CREATE TABLE profiles (
    id                          INTEGER PRIMARY KEY AUTOINCREMENT,
    name                        TEXT NOT NULL,   -- user-supplied display name; no UNIQUE constraint — two profiles may share a name
    created_at                  DATETIME DEFAULT CURRENT_TIMESTAMP,
    age                         INTEGER,
    gender                      TEXT,           -- 'male' | 'female'
    height_cm                   REAL,
    current_weight_kg           REAL,
    target_weight_kg            REAL,
    activity_level              TEXT,           -- 'sedentary' | 'lightly_active' | 'moderately_active' | 'very_active'
    weekly_rate_kg              REAL,           -- e.g. 0.25, 0.5
    recommended_daily_calories  REAL            -- computed and stored on save
);

-- Logged meals
CREATE TABLE meals (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id   INTEGER NOT NULL REFERENCES profiles(id),
    logged_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    description  TEXT NOT NULL,     -- raw user input
    calories     REAL DEFAULT 0,
    protein_g    REAL DEFAULT 0,
    fat_g        REAL DEFAULT 0,
    fiber_g      REAL DEFAULT 0,
    items_json   TEXT               -- JSON array: [{name, quantity_g, unit, calories, protein_g, fat_g, fiber_g, source, not_found}]
);
```

**Notes:**
- `items_json.source` values: `"usda"`, `"open_food_facts"`, `"llm_estimate"`, `"not_found"`
- Weekly and daily totals are computed at query time — no pre-aggregation needed at this scale
- `profiles` table starts empty; no seed data is inserted on startup — all profiles are user-created
- Health stats fields (age, gender, height, weights, activity level) are set when the user completes the profile creation form and can be updated at any time

---

## 6a. SQLite Auto-Purge

Runs once on every app startup, after schema initialisation.

| Property | Value |
|---|---|
| File size threshold | 100 MB |
| Purge target | Meals older than 12 months from the current date |
| Tables affected | `meals` only — `profiles` is never purged |
| Trigger | Every startup; executes only if the SQLite file size exceeds the threshold |

**Behaviour:**

1. On startup, measure the SQLite file size.
2. If file size is at or below 100 MB: do nothing. No log entry is written.
3. If file size exceeds 100 MB: execute `DELETE FROM meals WHERE logged_at < DATE('now', '-12 months')`, then log the number of rows deleted and the new file size.
4. If the file is still above 100 MB after the purge (unlikely at this scale): log a warning. Do not loop or purge more aggressively.

---

## 7. API Design (Spring Boot)

| Method | Path | Description |
|---|---|---|
| `GET` | `/profiles` | Returns list of profiles |
| `GET` | `/profiles/{id}` | Returns a single profile by ID; used by the dashboard on load |
| `POST` | `/profiles` | Creates a new profile (name + health fields); triggers Mifflin-St Jeor calculation |
| `DELETE` | `/profiles/{id}` | Deletes a profile and all its associated meals |
| `PUT` | `/profiles/{id}` | Updates name and/or health fields for a profile; recalculates and stores recommended daily calories |
| `POST` | `/meals/parse` | Parses a meal description; returns per-item breakdown — does NOT save to DB |
| `POST` | `/meals` | Saves a confirmed meal (with pre-parsed items_json) to DB |
| `GET` | `/meals?profile_id=&date=` | Returns meals for a profile on a given date (ISO format) |
| `DELETE` | `/meals/{id}` | Deletes a meal |
| `GET` | `/summary?profile_id=&date=` | Returns today's and this week's calorie totals for the dashboard |

**Two-step logging rationale:** `POST /meals/parse` lets the frontend show the breakdown for user review before committing. `POST /meals` saves only after the user confirms. This keeps the backend stateless between the two steps.

---

## 8. Meal Parsing Flow

```
User submits meal description text
        │
        ▼
POST /meals/parse (Spring Boot)
        │
        ├─► LLM Parser (Groq / OpenAI)
        │       Sends description to LLM; receives [{name, quantity_g, calories, protein_g, fat_g, fiber_g}]
        │       If LLM unavailable: falls back to basic conjunction-split tokenisation
        │
        ├─► For each LLM item (in parallel via WebClient): query USDA FoodData Central /foods/search
        │       If result found: override LLM estimates with USDA per-100g data scaled to quantity_g
        │       Source flagged as "usda"
        │
        ├─► If USDA returns no result: query Open Food Facts search API
        │       If result found: extract nutrients; scale by quantity
        │       Source flagged as "open_food_facts"
        │
        └─► If both return no result:
                Keep LLM estimate if non-zero → source = "llm_estimate"
                If LLM estimates also zero → source = "not_found"
                Frontend renders inline manual entry fields for "not_found" items

Frontend shows breakdown to user → user edits "not_found" items manually if needed → user confirms
        │
        ▼
POST /meals (Spring Boot)
        Receives: {profile_id, description, items_json (with any manual overrides), summed totals}
        Writes one row to meals table
        Returns: saved meal row
```

---

## 9. Build Order

### Phase 1 — Backend Core

| Task | Notes |
|---|---|
| Spring Boot project scaffold with SQLite via JDBC (`org.xerial:sqlite-jdbc` + JdbcTemplate) | Maven build; no ORM |
| Schema initialisation on startup via `ApplicationRunner` — creates tables if they do not exist | No seed data; `profiles` table starts empty |
| SQLite file-size check + auto-purge on startup | Runs after schema init; deletes meals older than 12 months if file exceeds 100 MB; logs result |
| Profile CRUD endpoints: `POST /profiles` (create), `GET /profiles` (list), `DELETE /profiles/{id}` (delete profile and its meals), `PUT /profiles/{id}` (update name and health fields) | `POST /profiles` accepts name, age, gender, height, weights, activity level, weekly rate; triggers Mifflin-St Jeor calculation on creation |
| `POST /meals/parse` — LLM parser + USDA verification + Open Food Facts fallback | Core parsing logic via `MealParserOrchestrator`; returns breakdown only, no DB write |
| `POST /meals` — save confirmed meal | Simple insert |
| `GET /meals` and `DELETE /meals/{id}` | CRUD |
| `GET /summary` — today's and weekly totals | Two aggregation queries |

### Phase 2 — Frontend

| Task | Notes |
|---|---|
| React app scaffold (Vite) | Install and configure |
| Landing page with profile cards + "Add Profile" button | Fetches `GET /profiles`; routes to `/dashboard/:profileId`; shows only the button on first run |
| Dashboard page — today count, weekly count, weight, target, recommended intake | Calls `GET /summary` and `GET /profiles/{id}` |
| Profile form modal or page | `PUT /profiles/{id}`; recommended intake updates on save |
| Meal log section on dashboard — text input + submit | Calls `POST /meals/parse`; shows breakdown inline |
| Meal confirmation step — per-item breakdown, manual entry for "not found" items, confirm button | Calls `POST /meals` on confirm |
| Today's meal list with delete button | Calls `GET /meals` filtered to today; delete calls `DELETE /meals/{id}` |

---

## 10. Out of Scope

| Feature | Decision |
|---|---|
| Anthropic Claude API | Not used; Groq (free) and OpenAI gpt-4o-mini (near-zero cost) are the supported LLM providers |
| WhatsApp integration | Removed entirely |
| Cloud hosting / deployment | Local only |
| User authentication | Not needed for a local personal app |
| Week navigation (prev/next week) | Parked to future scope; v1 shows today and current week only |
| Water logging | Not tracked |
| Carbs, sugar, micronutrients | Out of scope; 4 nutrients only |
| Reminders / notifications | No scheduler |
| Voice input, barcode scanning, photo logging | Future only |
| Max profiles limit | No cap on number of profiles in v1 |
| CSV / PDF export | Future scope |
| Weekly insight summaries | Future scope |

---

## 11. Definition of Done

The app is complete when:

1. Landing page shows all profile cards plus an "Add Profile" button; on first run with no profiles, only the button is shown
2. Creating a profile with name, current weight, and target weight immediately shows the calorie goal on the dashboard; all profile fields are saved and the recommended daily calories appear without a second visit to the profile form
3. User can type a meal description and see a per-item nutrient breakdown before confirming
4. "Not found" items show manual entry fields; user-entered values are included in the meal total
5. Confirmed meals are saved; today's count and weekly count on the dashboard update without a page refresh
6. Meals are correctly scoped to the active profile — no cross-profile data leakage
7. Deleting a meal updates all totals immediately
8. Data (meals and profiles) persists after stopping and restarting the backend
9. App starts locally with the documented commands
10. `GROQ_API_KEY` (or `OPENAI_API_KEY`) and `USDA_API_KEY` are the only required secrets; all are free to obtain; the app starts without them but shows a graceful 503 error when the relevant service is called
