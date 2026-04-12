# NutriLog — Backend Tasks

> Stack: Java 17 · Spring Boot 3 · Spring MVC · Spring JDBC · SQLite (via JDBC) · WebClient
> Build tool: Maven
> Start command: `./mvnw spring-boot:run` from the backend project root
> Backend port: 8080

---

## API Contract

Shared reference for both backend and frontend engineers.

| Method | Path | Request Body | Response Shape |
|---|---|---|---|
| `GET` | `/profiles` | — | `[{id, name, created_at, age, gender, height_cm, current_weight_kg, target_weight_kg, activity_level, weekly_rate_kg, recommended_daily_calories, weeks_to_target}]` |
| `POST` | `/profiles` | `{name, and optionally any health fields}` | full profile row (same shape as GET single) |
| `GET` | `/profiles/{id}` | — | `{id, name, created_at, age, gender, height_cm, current_weight_kg, target_weight_kg, activity_level, weekly_rate_kg, recommended_daily_calories, weeks_to_target}` — all nullable until profile is saved |
| `PUT` | `/profiles/{id}` | `{name, age, gender, height_cm, current_weight_kg, target_weight_kg, activity_level, weekly_rate_kg}` | Same shape as GET single, with `recommended_daily_calories` and `weeks_to_target` populated if health fields are present |
| `DELETE` | `/profiles/{id}` | — | `{ok: true}` |
| `POST` | `/meals/parse` | `{profile_id, description}` | `{items: [{name, quantity_g, unit, calories, protein_g, fat_g, fiber_g, source, not_found}], totals: {calories, protein_g, fat_g, fiber_g}}` — `source` is `"usda"`, `"open_food_facts"`, `"llm_estimate"`, or `"not_found"` |
| `POST` | `/meals` | `{profile_id, description, items_json, calories, protein_g, fat_g, fiber_g}` | `{id, profile_id, logged_at, description, calories, protein_g, fat_g, fiber_g, items_json}` |
| `GET` | `/meals` | Query params: `profile_id`, `date` (ISO 8601, e.g. `2026-04-12`) | `[{id, profile_id, logged_at, description, calories, protein_g, fat_g, fiber_g, items_json}]` |
| `DELETE` | `/meals/{id}` | — | `{ok: true}` |
| `GET` | `/summary` | Query params: `profile_id`, `date` | `{date_totals: {calories, protein_g, fat_g, fiber_g}, week_totals: {calories, protein_g, fat_g, fiber_g}}` |

**Notes on the contract:**
- `items_json` is stored as a TEXT column in SQLite but deserialized into a `JsonNode` by the row mapper before returning; the API always returns it as a JSON object/array (not a quoted string). In `MealRepository`, use `objectMapper.readTree(rs.getString("items_json"))` and declare the field as `JsonNode itemsJson` in `Meal.java`.
- **`itemsJson` serialization contract:** `POST /meals/parse` returns `items` as a JSON array (not a string). When the frontend calls `POST /meals`, it must send `items_json` as a JSON array directly — do **not** `JSON.stringify()` it. The backend receives it as a `String` field in `MealSaveRequest`; Jackson binds the array literal to the String field and it is stored verbatim. Double-encoding (`"[{\"name\":...}]"`) will break the round-trip.
- `GET /summary` returns both the daily total for `date` and the ISO week total in a single response — one round-trip from the frontend.
- `source: "not_found"` items have all nutrient values at `0`. The frontend fills these from manual user input and sends corrected values in the `POST /meals` body.
- `source: "llm_estimate"` items have non-zero nutrient values estimated by the LLM — no USDA or Open Food Facts match was found, but the LLM's estimate is used.
- USDA verification and Open Food Facts fallback calls for different food items within a single parse request run concurrently via `Flux.fromIterable().flatMap()` to keep p95 latency under 5 seconds.

---

## Phase 1 — Project Setup

### Task 1.1 — Spring Boot project scaffold

**What:** Generate the Maven project, establish the folder structure, and verify the server starts clean before any real endpoints exist.

**Maven dependencies (`pom.xml`):**
- `spring-boot-starter-web` (Spring MVC + embedded Tomcat)
- `spring-boot-starter-jdbc` (JdbcTemplate)
- `spring-boot-starter-webflux` (WebClient for async HTTP calls)
- `spring-boot-starter-validation` (Bean Validation on request bodies)
- `org.xerial:sqlite-jdbc:3.45.3.0` (SQLite JDBC driver)

**Folder structure:**
```
backend/
  src/main/java/com/nutrilog/
    NutrilogApplication.java
    config/
      CorsConfig.java
      WebClientConfig.java
    controller/
      HealthController.java
      ProfileController.java
      MealController.java
      SummaryController.java
    service/
      CalorieGoalService.java
      StartupService.java
      LlmParserService.java
      UsdaLookupService.java
      OpenFoodFactsService.java
      MealParserOrchestrator.java
    model/
      Profile.java
      Meal.java
      ParsedFoodItem.java
      ParseRequest.java
      ParseResponse.java
    repository/
      ProfileRepository.java
      MealRepository.java
    exception/
      GlobalExceptionHandler.java
      ProfileNotFoundException.java
      MealNotFoundException.java
      ServiceUnavailableException.java
  src/main/resources/
    application.properties
    schema.sql
  pom.xml
```

**Acceptance criteria:**
- `./mvnw spring-boot:run` starts without errors on port 8080
- `GET /health` returns `{"status": "ok"}` with HTTP 200
- No compilation warnings on `./mvnw compile`

**Depends on:** none

---

### Task 1.2 — SQLite JDBC setup and schema initialisation

**What:** Configure Spring to use a local SQLite file via JDBC and run `schema.sql` on every startup using `spring.sql.init.mode=always`.

**`application.properties` datasource config:**
```properties
spring.datasource.url=jdbc:sqlite:${NUTRILOG_DB_PATH:./nutrilog.db}?foreign_keys=on
spring.datasource.driver-class-name=org.sqlite.JDBC
spring.sql.init.mode=always
spring.sql.init.schema-locations=classpath:schema.sql
```

**`schema.sql` — `CREATE TABLE IF NOT EXISTS` is mandatory because this runs on every startup:**
```sql
CREATE TABLE IF NOT EXISTS profiles (
    id                          INTEGER PRIMARY KEY AUTOINCREMENT,
    name                        TEXT NOT NULL,
    created_at                  DATETIME DEFAULT CURRENT_TIMESTAMP,
    age                         INTEGER,
    gender                      TEXT,
    height_cm                   REAL,
    current_weight_kg           REAL,
    target_weight_kg            REAL,
    activity_level              TEXT,
    weekly_rate_kg              REAL,
    recommended_daily_calories  REAL
);

CREATE TABLE IF NOT EXISTS meals (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id   INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    logged_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    description  TEXT NOT NULL,
    calories     REAL DEFAULT 0,
    protein_g    REAL DEFAULT 0,
    fat_g        REAL DEFAULT 0,
    fiber_g      REAL DEFAULT 0,
    items_json   TEXT
);
```

**Notes on schema changes from previous version:**
- `profiles` is now the single identity + health data table — no separate `personas` table
- `profiles.id` is `AUTOINCREMENT` — no fixed IDs
- `profiles.name` has no `UNIQUE` constraint — two profiles can share a name
- `profiles.created_at` is stored on the profile row
- `meals` foreign key uses `profile_id` and includes `ON DELETE CASCADE` — deleting a profile cascades automatically

**Acceptance criteria:**
- `nutrilog.db` is created on first startup in the project root
- Both tables exist after startup
- Restarting does not fail or duplicate tables
- SQLite file path is configurable via `NUTRILOG_DB_PATH` env var; defaults to `./nutrilog.db`
- Foreign key enforcement is active: after `DELETE /profiles/{id}`, `SELECT COUNT(*) FROM meals WHERE profile_id = {id}` returns 0

**Depends on:** Task 1.1

---

### Task 1.3 — ProfileController: POST /profiles and DELETE /profiles/{id}

**What:** Implement the profile creation and deletion endpoints. No startup seeding — all profiles are user-created.

**`POST /profiles`:**
- Request body: `{name}` (`@NotBlank`), plus any optional health fields
- Inserts a single row into `profiles` with `name` and any provided health fields
- After inserting, if all health fields are present, call `CalorieGoalService.calculate(profile)` and immediately `UPDATE profiles SET recommended_daily_calories = ? WHERE id = ?` with the result. The returned profile must include the computed `recommended_daily_calories`. If any health field is absent, `recommended_daily_calories` remains null.
- Returns the full created profile row
- 422 if `name` is blank

**`DELETE /profiles/{id}`:**
- Because `meals` uses `ON DELETE CASCADE`, a single `DELETE FROM profiles WHERE id = ?` is sufficient
- Returns `{ok: true}`
- 404 if profile does not exist (check row count from `update()`)

**Acceptance criteria:**
- `POST /profiles` with `{"name": "Ruta"}` creates a profile row; returns the new profile with `id` and `created_at`
- `POST /profiles` with all health fields returns `recommended_daily_calories` as a non-null number
- `POST /profiles` with name only returns `recommended_daily_calories: null` — no exception
- `GET /profiles` after creation returns the new profile in the array
- `DELETE /profiles/{id}` removes the profile and all its meals; returns `{ok: true}`
- `DELETE /profiles/99` (non-existent) returns 404
- No fixed IDs — IDs are assigned by SQLite AUTOINCREMENT

**Depends on:** Task 1.2

---

### Task 1.4 — StartupService: SQLite Auto-Purge on startup

**What:** On every app startup, after schema init, check the SQLite file size and purge old meal rows if the file exceeds 100 MB.

**Implementation:** A `StartupService` class annotated `@Component` implementing `ApplicationRunner`. Injected with `JdbcTemplate` and the datasource URL from `@Value("${spring.datasource.url}")`.

**Logic:**
```java
private static final long PURGE_THRESHOLD_BYTES = 100L * 1024 * 1024; // 100 MB

@Override
public void run(ApplicationArguments args) {
    if (datasourceUrl.contains(":memory:")) return; // skip in-memory DBs

    String rawPath = datasourceUrl.replace("jdbc:sqlite:", "").split("\\?")[0]; // strip query params
    File dbFile = Path.of(rawPath).toAbsolutePath().toFile();
    log.info("SQLite DB path resolved to: {}", dbFile.getAbsolutePath());

    if (dbFile.length() > PURGE_THRESHOLD_BYTES) {
        int deleted = jdbcTemplate.update(
            "DELETE FROM meals WHERE logged_at < date('now', '-12 months')"
        );
        // VACUUM is required to reclaim disk space; without it dbFile.length() won't reflect freed pages
        jdbcTemplate.execute("VACUUM");
        long newSize = dbFile.length();
        log.info("Purged {} old meal rows. DB file size after VACUUM: {} MB", deleted, newSize / (1024 * 1024));

        if (dbFile.length() > PURGE_THRESHOLD_BYTES) {
            log.warn("DB file still large after purge ({} MB) — consider manual cleanup",
                     dbFile.length() / (1024 * 1024));
        }
    }
}
```

**Acceptance criteria:**
- On startup with a DB file > 100 MB: meals older than 12 months are deleted; deletion count and new file size are logged at INFO
- If still > 100 MB after purge: a WARNING is logged; no further action taken
- On startup with file ≤ 100 MB: nothing happens, nothing is logged
- If datasource URL contains `:memory:`: size check is skipped entirely
- `profiles` rows are never touched by this logic
- After purge, `VACUUM` is executed; the logged "new file size" reflects the post-VACUUM file size
- The DB file path is resolved to an absolute path at startup and logged at INFO

**Depends on:** Task 1.2

---

### Task 1.5 — application.properties and environment variable wiring

**What:** Define all configurable keys using Spring's `${ENV_VAR:default}` syntax. Document required variables in `.env.example`.

**Entries to add to `application.properties`:**
```properties
spring.datasource.url=jdbc:sqlite:${NUTRILOG_DB_PATH:./nutrilog.db}?foreign_keys=on
usda.api.key=${USDA_API_KEY:}
llm.provider=${LLM_PROVIDER:groq}
groq.api.key=${GROQ_API_KEY:}
openai.api.key=${OPENAI_API_KEY:}
groq.api.base-url=https://api.groq.com/openai/v1
openai.api.base-url=https://api.openai.com/v1
groq.model=llama3-8b-8192
openai.model=gpt-4o-mini
```

**`.env.example`:**
```
USDA_API_KEY=your_key_here      # free from fdc.nal.usda.gov
GROQ_API_KEY=your_key_here      # free from console.groq.com (default LLM)
# OPENAI_API_KEY=your_key_here  # optional; set LLM_PROVIDER=openai to use
LLM_PROVIDER=groq               # groq (default, free) | openai
# NUTRILOG_DB_PATH=./nutrilog.db  # optional; override SQLite file location
```

**Acceptance criteria:**
- App starts cleanly when all keys are absent (keys default to empty string)
- When a key is absent and its service is called, `ServiceUnavailableException` → `GlobalExceptionHandler` returns HTTP 503 with `{"error": "GROQ_API_KEY is not configured"}` — not a NullPointerException
- `.env` is in `.gitignore`; `.env.example` is committed

**Depends on:** Task 1.1

---

### Task 1.6 — CORS configuration

**What:** Allow the React dev server at `localhost:5173` to call the Spring Boot backend.

**Implementation:** A `CorsConfig` class annotated `@Configuration` declaring a `CorsConfigurationSource` bean with `allowedOrigins=["http://localhost:5173"]`, `allowedMethods=["GET","POST","PUT","DELETE","OPTIONS"]`, `allowedHeaders=["*"]`.

**Acceptance criteria:**
- `OPTIONS` preflight to any API endpoint from `localhost:5173` returns 200 with correct CORS headers
- `GET /profiles` from a browser at `localhost:5173` does not produce a CORS error

**Depends on:** Task 1.1

---

### Task 1.7 — WebClient configuration

**What:** Define reusable `WebClient` beans for the three external services (LLM, USDA, Open Food Facts).

**Implementation:** A `WebClientConfig` class annotated `@Configuration` with three `@Bean` methods: `groqWebClient()`, `usdaWebClient()`, `openFoodFactsWebClient()`. Each uses `WebClient.builder().baseUrl(...)` with base URLs injected from `@Value` properties. Each bean must be configured with a 4-second response timeout via `ReactorClientHttpConnector`:
```java
HttpClient httpClient = HttpClient.create().responseTimeout(Duration.ofSeconds(4));
WebClient.builder()
    .baseUrl(baseUrl)
    .clientConnector(new ReactorClientHttpConnector(httpClient))
    .build();
```
A 4-second per-call timeout leaves headroom for the LLM → USDA/OFF pipeline to fit within the 5s p95 SLA (N-01).

**Acceptance criteria:**
- Three named `WebClient` beans are injectable across the service layer
- No hardcoded URLs in any service class
- Each WebClient bean has a 4-second response timeout configured

**Depends on:** Tasks 1.1, 1.5

---

## Phase 2 — Profile and Calorie Goal

### Task 2.1 — GET /profiles and GET /profiles/{id}

**What:** Return all profiles in the database, and return a single profile by ID. Both include `weeks_to_target` computed from stored values.

**Acceptance criteria:**
- `GET /profiles` returns `[{id, name, created_at, age, gender, height_cm, current_weight_kg, target_weight_kg, activity_level, weekly_rate_kg, recommended_daily_calories, weeks_to_target}]` — all profiles in the DB
- Returns an empty array `[]` if no profiles exist; 200 status always
- Response includes `created_at` in ISO 8601 format
- `GET /profiles/{id}` returns the full profile row (all fields nullable until saved)
- Returns 404 if the profile does not exist
- `weeks_to_target` is computed and present if `recommended_daily_calories` is not null; null otherwise

**Depends on:** Task 1.3

---

### Task 2.2 — PUT /profiles/{id} with Mifflin-St Jeor calculation

**What:** Accept a profile update (name and/or health fields), compute `recommended_daily_calories` in `CalorieGoalService` when health fields are present, persist, and return the updated profile.

**Formula to implement (authoritative — use this exactly):**
```java
// Guard: return null if any required health field is absent
if (weightKg == null || heightCm == null || age == null ||
    gender == null || activityLevel == null || weeklyRateKg == null || targetWeightKg == null) {
    return null; // recommended_daily_calories stored as NULL; weeks_to_target also null
}

// Step 1: BMR
double bmr = (10 * weightKg) + (6.25 * heightCm) - (5 * age);
bmr += gender.equals("male") ? 5 : -161;

// Step 2: TDEE
Map<String, Double> multipliers = Map.of(
    "sedentary", 1.2, "lightly_active", 1.375,
    "moderately_active", 1.55, "very_active", 1.725
);
double tdee = bmr * multipliers.get(activityLevel);

// Step 3: Adjust for weekly rate
double dailyDelta = (weeklyRateKg * 7700) / 7;
double recommended;
if (targetWeightKg < currentWeightKg) recommended = tdee - dailyDelta;       // loss
else if (targetWeightKg > currentWeightKg) recommended = tdee + dailyDelta;  // gain
else recommended = tdee;                                                       // maintain

// weeks_to_target: null when maintaining weight (weeklyRateKg == 0 or weights equal)
// Do NOT divide by dailyDelta when weeklyRateKg == 0 — avoids division by zero
Double weeksToTarget = (weeklyRateKg == 0 || Double.compare(currentWeightKg, targetWeightKg) == 0)
    ? null
    : Math.abs(currentWeightKg - targetWeightKg) / (weeklyRateKg);
```

**Acceptance criteria:**
- If the request body contains NO health fields (only `name`): update `name` only; leave `recommended_daily_calories` and `weekly_rate_kg` unchanged; return the existing profile row. This is a valid operation — no 422.
- If the request body contains ONE OR MORE health fields: ALL seven health fields are required. Return 422 if any are missing. Recalculate and store `recommended_daily_calories`.
- A name-only PUT is distinct from a health-field PUT; the controller must branch on whether any health field is non-null in the request body.
- `gender` must be `"male"` or `"female"`; `activity_level` must be one of the four valid strings — 422 for invalid values
- `recommended_daily_calories` stored in DB after every successful PUT with health fields
- Response includes both `recommended_daily_calories` (stored) and `weeks_to_target` (computed, null when maintaining weight)
- `PUT /profiles/{id}` where `current_weight_kg == target_weight_kg` returns `weeks_to_target: null` — no division by zero
- Calling PUT again with different values recalculates correctly
- 404 for unknown profile `id`

**Depends on:** Task 2.1

---

## Phase 3 — Meal Parsing Pipeline

### Task 3.1 — LlmParserService — call LLM, return ParsedFoodItem list

**What:** Send the user's meal description to the configured LLM (Groq or OpenAI) via WebClient and deserialise the JSON response into `List<ParsedFoodItem>`.

**System prompt (embed as a constant):**
```
You are a nutrition parser. The user will describe a meal in plain English.
Return ONLY a JSON array — no explanation, no markdown, just raw JSON.
Each element must have exactly these fields:
  name (string): the food item name
  quantity_g (number): estimated weight in grams
  calories (number): estimated kcal
  protein_g (number): estimated protein in grams
  fat_g (number): estimated fat in grams
  fiber_g (number): estimated dietary fiber in grams
If you cannot estimate a field, use 0. Never return null for any field.
```

**Implementation notes:**
- Groq and OpenAI both use the OpenAI-compatible chat completions API (`POST /chat/completions`). The HTTP body is identical for both; only the base URL, model name, and API key differ. A single private `callLlmApi(String userMessage)` handles both via `llm.provider` config.
- Parse `choices[0].message.content` as `List<ParsedFoodItem>` using Jackson. Before passing to Jackson, strip markdown code fences if present: remove a leading ` ```json ` or ` ``` ` and a trailing ` ``` ` using a simple regex (`content.replaceAll("^```(?:json)?\\s*", "").replaceAll("```\\s*$", "").strip()`). Only after stripping should the JSON-invalid fallback be triggered.
- If the response is still not valid JSON after stripping: log at WARN including the raw response, return empty list.
- If API key is missing or HTTP call fails: return empty list without throwing.

**Acceptance criteria:**
- With a valid Groq key and `LLM_PROVIDER=groq`: `"2 scrambled eggs and toast"` returns ≥2 items
- With missing/invalid key: returns empty list without throwing
- With unparseable LLM response: returns empty list and logs raw response at WARN

**Depends on:** Task 1.7

---

### Task 3.2 — UsdaLookupService — verify one item via USDA

**What:** For a single food name and quantity, query USDA FoodData Central and return a `ParsedFoodItem` with USDA-sourced nutrients scaled to `quantityG`.

**Implementation notes:**
- Endpoint: `GET /fdc/v1/foods/search?query={name}&api_key={key}&pageSize=1`
- Extract from `foodNutrients` array by checking both `nutrientNumber` AND `nutrientId`. Authoritative mappings:
  - kcal:    `nutrientNumber = "208"`,  `nutrientId = 1008`
  - protein: `nutrientNumber = "203"`,  `nutrientId = 1003`
  - fat:     `nutrientNumber = "204"`,  `nutrientId = 1004`
  - fiber:   `nutrientNumber = "291"`,  `nutrientId = 1079`
  For each nutrient, match if EITHER field equals the expected value. This handles Foundation Foods (use `nutrientNumber`) and Branded Foods (use `nutrientId`).
- Scale: `valuePer100g * quantityG / 100`
- Return `Mono<Optional<ParsedFoodItem>>` — empty if no results or HTTP error
- Set `source = "usda"` on the returned item

**Acceptance criteria:**
- With valid USDA key: `lookupByName("chicken breast", 150.0)` returns non-empty Optional with reasonable values
- With missing key or no match: returns empty Optional without throwing
- Uses WebClient (non-blocking)

**Depends on:** Task 1.7

---

### Task 3.3 — OpenFoodFactsService — fallback lookup for one item

**What:** For a single food name, query Open Food Facts (no key required) and return scaled nutrients.

**Implementation notes:**
- Endpoint: `https://world.openfoodfacts.org/cgi/search.pl?search_terms={name}&search_simple=1&action=process&json=1&page_size=1`
- Extract from `products[0].nutriments`: `energy-kcal_100g`, `proteins_100g`, `fat_100g`, `fiber_100g` — use 0 for missing fields
- Scale by `quantityG / 100`
- Return `Mono<Optional<ParsedFoodItem>>` — empty if `products` is empty or request fails
- Set `source = "open_food_facts"` on the returned item

**Acceptance criteria:**
- For a common food name: returns non-empty Optional with non-zero calories
- Returns empty Optional on any HTTP failure; never throws

**Depends on:** Task 1.7

---

### Task 3.4 — MealParserOrchestrator — coordinate the three services

**What:** Coordinate LlmParserService → UsdaLookupService → OpenFoodFactsService to produce the final `ParseResponse`.

**Pipeline logic:**
```
1. Call LlmParserService.parse(description) → List<ParsedFoodItem> llmItems

2. If llmItems is empty (LLM failed):
   Fallback: split description on "and", ",", "with" → basic token list
   For each token: USDA lookup → if empty, OFF lookup → if empty, source = "not_found"

3. If llmItems is non-empty:
   For each llmItem, in parallel (Flux.fromIterable().flatMap()):
     a. UsdaLookupService → if present: use USDA nutrients, source = "usda"
     b. Else OpenFoodFactsService → if present: use OFF nutrients, source = "open_food_facts"
     c. Else: if LLM estimates > 0 → source = "llm_estimate"
              if LLM estimates all 0  → source = "not_found"
     Each per-item lookup chain must be wrapped with `.onErrorResume(e -> { log.warn(...); return Mono.just(item.withSource("not_found")); })` to guarantee per-item error isolation — one failing HTTP call must not cancel the entire Flux.

4. Sum all non-null nutrient fields for totals ("not_found" items contribute 0)

5. Return ParseResponse{items, totals}
```

**Acceptance criteria:**
- With Groq + USDA keys: "2 scrambled eggs and toast" returns items with `source: "usda"` or `"llm_estimate"` and non-zero nutrients
- With LLM key only: items return with `source: "llm_estimate"` and LLM estimates
- With no keys: items return with `source: "not_found"`; totals are all zeros
- `totals` is always present
- p95 latency for a 2–4 item meal is under 5 seconds
- If USDA returns a 5xx for one item, that item is returned as `source: "not_found"` and the remaining items are unaffected

**Depends on:** Tasks 3.1, 3.2, 3.3

---

### Task 3.5 — POST /meals/parse and POST /meals endpoints

**What:** Wire the orchestrator to the parse endpoint and implement the meal confirm endpoint.

**`POST /meals/parse`:** `MealController.parseMeal(@RequestBody @Valid ParseRequest)` calls `MealParserOrchestrator.parse()` and returns `ParseResponse`.
- `ParseRequest`: `profileId` (`@NotNull`), `description` (`@NotBlank`)
- 400 if description is blank; 404 if `profileId` does not exist in the `profiles` table
- Before calling the orchestrator, `MealController.parseMeal()` must call `ProfileRepository.findById(profileId)` and throw `ProfileNotFoundException` if the profile does not exist. This prevents LLM API calls from firing for invalid profile IDs.
- `MealParserOrchestrator.parse()` returns `Mono<ParseResponse>`. The controller calls `.block()` on the result (acceptable on a Tomcat thread pool thread). Do not leave the reactive return type unresolved — failing to subscribe means nothing executes.

**`POST /meals`:** `MealController.saveMeal(@RequestBody @Valid MealSaveRequest)` inserts one row via `MealRepository`.
- Fields: `profileId`, `description`, `itemsJson` (String), `calories`, `proteinG`, `fatG`, `fiberG`
- Returns saved row with `id` and `loggedAt`
- 404 if `profileId` does not exist

**Acceptance criteria:**
- `POST /meals/parse` with valid body returns `ParseResponse` within 5s
- `POST /meals` returns the saved row; row appears in subsequent `GET /meals`
- Both return 400/422 for invalid request bodies with field-level error detail

**Depends on:** Tasks 2.1, 3.4

---

## Phase 4 — Meal CRUD and Summaries

### Task 4.1 — GET /meals

**What:** Return all meals for a given profile on a given date.

**Acceptance criteria:**
- Query params: `profile_id` (required), `date` (required, `YYYY-MM-DD`)
- Filters by `DATE(logged_at) = date`; results in ascending `logged_at` order
- Returns empty array if no meals — never 404
- `items_json` returned as a parsed JSON object/array (not a raw string). In `MealRepository` row mapper, use `objectMapper.readTree(rs.getString("items_json"))` and declare the field as `JsonNode itemsJson` in `Meal.java`. This ensures the API response contains a nested JSON array, not an escaped string.

**Depends on:** Task 3.5

---

### Task 4.2 — DELETE /meals/{id}

**What:** Delete a meal by ID.

**Acceptance criteria:**
- Deletes the row; returns `{"ok": true}`
- 404 if the meal does not exist: throw `MealNotFoundException` when `jdbcTemplate.update("DELETE FROM meals WHERE id = ?", id)` returns 0
- Does not validate profile ownership (no auth in v1)

**Depends on:** Task 3.5

---

### Task 4.3 — GET /summary

**What:** Return today's and this week's nutrient totals for a profile in a single response.

**SQL queries (use `COALESCE(SUM(...), 0)` to avoid null when no rows exist):**
```sql
-- Daily totals
SELECT COALESCE(SUM(calories),0), COALESCE(SUM(protein_g),0),
       COALESCE(SUM(fat_g),0),    COALESCE(SUM(fiber_g),0)
FROM meals WHERE profile_id = ? AND DATE(logged_at) = ?

-- Weekly totals (ISO week — compute Monday/Sunday in Java, pass as BETWEEN bounds)
-- Java: LocalDate monday = date.with(DayOfWeek.MONDAY);
--       LocalDate sunday = monday.plusDays(6);
-- Bind: profile_id, monday.toString(), sunday.toString()
SELECT COALESCE(SUM(calories),0), COALESCE(SUM(protein_g),0),
       COALESCE(SUM(fat_g),0),    COALESCE(SUM(fiber_g),0)
FROM meals WHERE profile_id = ?
  AND DATE(logged_at) BETWEEN ? AND ?
```
Do NOT use `strftime('%Y-%W', ...)` for weekly grouping — SQLite's `%Y` is the calendar year, which causes meals on Dec 29–31 (ISO week 1 of the next year) to be grouped incorrectly at year boundaries.

**Acceptance criteria:**
- Query params: `profile_id` (required), `date` (required)
- Returns `{date_totals, week_totals}` — no null fields; zeros when no meals exist
- 404 if `profile_id` does not exist: call `ProfileRepository.findById(profileId)` and throw `ProfileNotFoundException` before running aggregation queries — `COALESCE(SUM(...), 0)` over no rows returns zeros (not a 404), so the check must be explicit
- Weekly totals for a meal logged on `2026-12-30` (ISO week 1 of 2027) are counted in the week of `2026-12-28`–`2027-01-03`, not split across years

**Depends on:** Task 4.1

---

## Cross-Cutting — GlobalExceptionHandler

`@ControllerAdvice` class handling:

| Exception | HTTP Status | Response body |
|---|---|---|
| `ProfileNotFoundException` | 404 | `{"error": "Profile not found"}` |
| `MealNotFoundException` | 404 | `{"error": "Meal not found"}` |
| `ServiceUnavailableException` | 503 | `{"error": "...", "detail": "Configure GROQ_API_KEY at console.groq.com — free"}` |
| `MethodArgumentNotValidException` | 422 | Field-level validation errors |
| Any uncaught `Exception` | 500 | `{"error": "Internal server error"}` |

---
