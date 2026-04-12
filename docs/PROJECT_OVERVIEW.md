# NutriLog — Project Overview

> **Version:** 3.0
> **Date:** 2026-04-12
> **Status:** Active — zero-cost web app
> **Owner:** Solo developer

---

## 1. What It Is

NutriLog is a locally-hosted web app for personal nutrition and weight tracking. No cloud, no subscriptions, no paid services required — Groq API (default LLM) is free to use.

You type what you ate in plain English. The app sends it to a free LLM (Groq / Llama 3) which parses the food items, then verifies nutrients against free public APIs (USDA, Open Food Facts), applies quantity math on the backend, and saves the result. Each profile gets a dashboard with today's calories, this week's calories, current weight, target weight, and a recommended daily calorie target calculated from their profile.

---

## 2. Problem & Solution

| Problem | Solution |
|---|---|
| Nutrition apps require subscriptions or paid AI APIs | Free public APIs (USDA FoodData Central, Open Food Facts) cover the common foods that matter |
| Most trackers are overbuilt | Track 4 nutrients only: calories, protein, fat, fiber |
| Household tracking usually means separate accounts and no shared view | Multiple profiles on a landing page — click a card to open that profile's dashboard |
| Cloud apps add login friction and privacy concerns | Runs on localhost; all data stays in a local SQLite file |
| Calorie goal calculators are locked behind apps | Mifflin-St Jeor equation in pure Java — no API needed |

---

## 3. Profiles

Profiles are user-created, named freely (e.g. 'Ruta', 'Rahul', 'Mom'). Any number of profiles can be created. Each profile has its own meal history, weight data, and calorie goal. No login, no accounts.

---

## 4. Core User Flow

```
Open app (localhost)
      │
      ▼
Landing page — profile cards + "Add Profile" button
      │
      ├── Click existing profile → Dashboard
      │         Shows: today's calories, week's calories,
      │         current weight, target weight,
      │         recommended daily calories, weeks to target
      │
      └── Click "Add Profile" → Profile creation form
            (name, age, gender, height, current weight, target weight, activity level, weekly rate)
            │
            ▼
            New profile created → navigated to new profile's dashboard
      │
      ▼
Click "Log a Meal"
      │
      ▼
Type free-text meal description
(e.g. "2 scrambled eggs and toast with butter")
      │
      ▼
Backend sends text to LLM → LLM returns structured food items + estimated nutrients
  1. Groq API (free tier, Llama 3) or OpenAI gpt-4o-mini — configurable via LLM_PROVIDER
  2. USDA FoodData Central API — verifies/overrides LLM estimates per item (free, free API key)
  3. Open Food Facts API — fallback if USDA has no match (free, no key)
  4. Prompt user to enter calories manually — last resort for unresolvable items
      │
      ▼
Parsed breakdown preview shown (per food item + total)
      │
      ▼
User confirms → saved to SQLite → dashboard updates
```

---

## 5. Technical Architecture

```
Browser (React + Vite)
      │
      │  HTTP (localhost:8080)
      ▼
Spring Boot (Java 17)
      │
      ├── LLM Parser (Groq / OpenAI)  ← primary: parses meal text + estimates nutrients
      │         Groq free tier (default):  https://console.groq.com  (LLM_PROVIDER=groq)
      │         OpenAI gpt-4o-mini (alt):  ~$0/month at personal volume (LLM_PROVIDER=openai)
      │
      ├── USDA FoodData Central API   ← verifies/overrides LLM estimates per item (free API key)
      │         https://fdc.nal.usda.gov/
      │
      ├── Open Food Facts API         ← fallback if USDA has no match (free, no key)
      │         https://world.openfoodfacts.org/
      │
      ├── Mifflin-St Jeor calculator (Java)  ← daily calorie goal per profile
      │
      ├── StartupService (ApplicationRunner)  ← schema init + auto-purge on startup
      │
      └── SQLite file (local, via JDBC)  ← all data stored here; single file, zero setup
```

No paid services required. Groq API (default) is free. USDA API key is free to obtain.

---

## 6. Meal Parsing — How It Works

This is the core technical decision. The full pipeline runs in Java on the Spring Boot backend.

### Step 1 — LLM Parse (primary)

The user's meal description is sent to the configured LLM (Groq by default). The LLM is prompted to return a JSON array where each element has `{name, quantity_g, calories, protein_g, fat_g, fiber_g}`. This handles colloquial and regional food names ("dal tadka", "homemade biryani") that USDA would not find. LLM estimates are provisional — they are the starting point, not the final answer.

If the LLM is unavailable or returns unparseable output, the pipeline falls back to basic conjunction-split tokenisation ("and", "with", commas).

### Step 2 — USDA Verification (per item, in parallel)

Each item returned by the LLM is looked up in USDA FoodData Central. If a match is found, the USDA per-100g data is scaled to the LLM-inferred quantity and used to **override** the LLM's estimated nutrients. Source flagged `"usda"`.

### Step 3 — Open Food Facts Fallback (per item)

If USDA returns no match, Open Food Facts is queried. If a match is found, nutrients are extracted and scaled. Source flagged `"open_food_facts"`.

### Step 4 — LLM Estimate or Manual Fallback

If neither API matches an item: if the LLM returned non-zero estimates, those are kept with `source = "llm_estimate"`. If the LLM also had no estimate, the item is flagged `source = "not_found"` and the frontend shows a manual entry field.

`source` values: `"usda"` | `"open_food_facts"` | `"llm_estimate"` | `"not_found"`

---

## 7. SQLite Auto-Purge

On every startup, after schema init, the app checks the SQLite file size.

- Threshold: 100 MB
- If exceeded: `DELETE FROM meals WHERE logged_at < date('now', '-12 months')`
- Logs rows deleted and new file size
- If still > 100 MB after purge: logs a warning; no further action
- `profiles` is never purged
- Implemented in `StartupService` (Spring `@Component`, `ApplicationRunner`)
- Skipped if datasource URL is in-memory (`:memory:`)

---

## 8. Calorie Goal Calculation

Pure Java. No API. Uses the Mifflin-St Jeor equation, derived from profile data.

```
BMR (male)   = 10 × weight(kg) + 6.25 × height(cm) − 5 × age + 5
BMR (female) = 10 × weight(kg) + 6.25 × height(cm) − 5 × age − 161

TDEE = BMR × activity multiplier
    Sedentary       → 1.2
    Lightly active  → 1.375
    Moderately active → 1.55
    Very active     → 1.725

Daily calorie target:
    Weight loss → TDEE − 500  (≈ 0.5 kg/week deficit)
    Weight gain → TDEE + 300

Weeks to target = (current weight − target weight) × 7700 kcal/kg
                  ÷ 500 kcal/day deficit
```

Recalculated on every profile save. Displayed on the dashboard alongside current and target weight.

---

## 9. Key Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| LLM-first parsing | Groq (free tier, Llama 3) as primary; USDA + Open Food Facts verify/override | Handles regional and colloquial food names that keyword matching misses; Groq free tier means zero cost at personal volume |
| Backend framework | Java 17 + Spring Boot 3 | Developer preference; WebClient enables async/parallel USDA + Open Food Facts calls; well-structured monolith |
| Storage | SQLite via JDBC (JdbcTemplate) | Local-only app; zero setup; single file; no server process; JdbcTemplate is sufficient — no ORM needed at this schema size |
| Frontend | React (Vite) | Component model fits the profile / week / meal hierarchy well; Vite keeps dev setup minimal |
| LLM provider switching | `LLM_PROVIDER` env var (`groq` default, `openai` alternative) | Both use OpenAI-compatible chat API; one `callLlmApi()` method handles both |
| Profile model | Dynamic profiles, user-created | Netflix-style; any number of named profiles; created via landing page |
| Free API strategy | LLM primary, USDA verify, Open Food Facts fallback, manual last resort | Maximises accuracy at zero cost; graceful degradation at every step |
| Calorie goal | Mifflin-St Jeor in Java | Industry-standard equation; no API needed; runs instantly |

---

## 10. What's Tracked

Four nutrients per meal, per profile:

| Nutrient | Unit |
|---|---|
| Calories | kcal |
| Protein | g |
| Fat | g |
| Fiber | g |

Nothing else. No carbs, no sugar, no micronutrients, no water.

---

## 11. UI Surfaces

### Landing Page
- Profile cards loaded dynamically from `GET /profiles`; if empty, show only an "Add Profile" button with a welcome message
- "Add Profile" button always visible
- Click a card to open that profile's dashboard
- No navigation chrome — cards are the entry point

### Dashboard (per profile)
- Today's calorie count vs. daily target
- This week's calorie count
- Current weight and target weight
- Recommended daily calories (from Mifflin-St Jeor)
- Estimated weeks to reach target weight
- Button to log a meal
- Link to weekly view and profile setup

### Meal Entry
- Free-text input field
- Parsed breakdown preview: each food token listed with its nutrients
- Items not found in either API are flagged — user enters calories manually
- Confirm button saves to SQLite and returns to dashboard

### Profile Setup (per profile)
- Age, gender (male/female), height (cm), current weight (kg), target weight (kg)
- Activity level selector: Sedentary / Lightly active / Moderately active / Very active
- Save recalculates daily calorie target immediately

### Weekly View (per profile)
- Current week shown by default (Mon–Sun)
- Navigate to previous weeks
- Days grouped with logged meals listed under each day
- Each meal shows: description, calorie count, delete button
- Weekly totals (calories, protein, fat, fiber) shown at top

---

## 12. External Dependencies

| Service | Purpose | Cost | Key Required? |
|---|---|---|---|
| Groq API (Llama 3 8B) | LLM meal parsing — primary (default) | Free (rate-limited) | Yes — free registration at console.groq.com |
| OpenAI gpt-4o-mini | LLM meal parsing — alternative | ~$0.15/1M tokens (~$0/month at personal volume) | Yes — api.openai.com; set `LLM_PROVIDER=openai` |
| USDA FoodData Central | Nutrient verification per item | Free | Yes — free registration at fdc.nal.usda.gov |
| Open Food Facts | Fallback nutrient lookup | Free | No |

Default configuration uses Groq (free). All other dependencies (React, Vite, Spring Boot, SQLite) are local and free. No Anthropic API.

---

## 13. Build Phases

### Phase 1 — Backend (Spring Boot + SQLite)
- Maven project setup, SQLite JDBC schema init, `StartupService` for auto-purge
- Profile endpoints: `GET /profiles`, `POST /profiles`, `DELETE /profiles/{id}`, `PUT /profiles/{id}`
- `CalorieGoalService` with Mifflin-St Jeor wired to profile data
- Meal parsing pipeline: `LlmParserService` → `UsdaLookupService` → `OpenFoodFactsService` → `MealParserOrchestrator`
- `POST /meals/parse` — parse only, no DB write; `POST /meals` — save confirmed meal
- `GET /meals` — filter by profile and date; `DELETE /meals/{id}`
- `GET /summary` — today's and weekly totals
- `GROQ_API_KEY` and `USDA_API_KEY` loaded from `application.properties` / environment
- Start command: `./mvnw spring-boot:run`

### Phase 2 — Frontend (React + Vite)
- Vite scaffold, routing (landing / dashboard / meal-entry / profile / weekly-view)
- Landing page with dynamic profile cards and "Add Profile" flow
- Dashboard wired to `GET /summary`
- Meal entry form: text input → parsed breakdown preview → confirm
- Manual calorie entry for unrecognised food tokens
- Profile setup form wired to `PUT /profiles/{id}`
- Weekly view with day-grouped meals and prev/next week navigation
- Delete meal action with immediate dashboard refresh

---

## 14. Out of Scope

These are explicitly not being built:

- Anthropic Claude API (not used; Groq and OpenAI are the supported LLM providers)
- Cloud hosting or deployment of any kind
- User authentication or accounts
- Profile limit / cap (no cap in v1)
- Reminders, notifications, or scheduled reports
- Water logging
- Voice, photo, or barcode input
- Paid tiers, Stripe, or any monetisation
- WhatsApp or messaging platform integration
- CSV export (parked for later)

---

## 15. Future Scope (Not Now)

| Feature | Why It's Parked |
|---|---|
| CSV / JSON export | Easy to add once the data model is stable |
| Mobile-friendly layout | Responsive CSS pass after core functionality is done |
| Smarter quantity parsing | ML-based NER for better "2 heaped tablespoons" handling |
| Custom nutrient goals per profile | Adds settings complexity; Mifflin-St Jeor is enough for v1 |
| Weekly nutrition insight summary | Nice to have; not core to the tracking loop |

---

## 16. Definition of Done

The project is complete when a user can:

1. Open the app in a browser on localhost, see the landing page with any existing profile cards and an "Add Profile" button
2. Create a new profile (name + weight fields required), be navigated to their dashboard, and immediately see their calorie goal if weight fields were entered
3. Type a meal description and see a parsed breakdown within 5 seconds (LLM call + parallel USDA verification)
4. Manually enter calories for any food item the APIs did not recognise
5. Confirm a meal and see the dashboard totals update immediately
6. View all meals for the current week, grouped by day, with weekly totals
7. Navigate to previous weeks
8. Delete a meal and see totals update immediately
9. Update their profile (weight, target weight, activity level) and see the calorie goal recalculate

And operationally:
- App starts with two documented commands: `./mvnw spring-boot:run` (backend), `npm run dev` (frontend)
- Required configuration: `GROQ_API_KEY` (free from console.groq.com) and `USDA_API_KEY` (free from fdc.nal.usda.gov)
- Data survives a backend restart
- No paid service is required at any point
