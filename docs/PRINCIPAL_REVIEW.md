# Principal Engineer Review — NutriLog Phase 1

**Reviewer:** Principal Engineer  
**Date:** 2026-04-12  
**Scope:** All code written through Phase 1 (backend profile management + frontend scaffold)  
**Status:** Phase 1 architecture is sound. Several issues below must be addressed before Phase 2 work begins; others can be resolved as you touch the affected code.

---

## Overall Assessment

The scaffolding is clean, well-structured, and follows sensible conventions. The decision to use JdbcTemplate over JPA/Hibernate is correct for this schema size — don't second-guess it. The two-step meal parsing flow (parse → confirm) is the right call for UX. The calorie goal math lives in a proper service. Documentation is exceptional.

The issues below fall into three tiers:

- **[MUST FIX]** — Will cause runtime crashes or silent data corruption
- **[SHOULD FIX]** — Correctness or maintainability problems that will cost more to fix later
- **[MINOR]** — Low-priority polish; address when you're already touching the file

---

## Backend Review

### MUST FIX

**1. `CalorieGoalService.java` — NullPointerException on invalid `activityLevel`**

`multipliers.get(activityLevel)` returns `null` if the string isn't one of the four defined keys. The result is immediately unboxed into a `double`, causing a hard NPE. There is currently no validation that `activityLevel` is one of `["sedentary", "lightly_active", "moderately_active", "very_active"]`.

Fix: validate the field before the map lookup. A guard like this before the TDEE line covers it:

```java
if (!multipliers.containsKey(activityLevel)) {
    throw new IllegalArgumentException("Unknown activity level: " + activityLevel);
}
```

The `GlobalExceptionHandler` should then add a handler for `IllegalArgumentException` that returns HTTP 422 with a descriptive error. Without this, the client gets a 500 with no indication of what went wrong.

**File:** `backend/src/main/java/com/nutrilog/service/CalorieGoalService.java`  
**File:** `backend/src/main/java/com/nutrilog/exception/GlobalExceptionHandler.java`

---

**2. `GlobalExceptionHandler.java` — catch-all swallows exceptions silently**

The fallback `handleGeneral(Exception ex)` returns a generic 500 with no logging. When something unexpected goes wrong, there will be zero trace. Add a `logger.error(...)` call before the return so failures appear in the console.

```java
private static final Logger logger = LoggerFactory.getLogger(GlobalExceptionHandler.class);

@ExceptionHandler(Exception.class)
public ResponseEntity<Map<String, String>> handleGeneral(Exception ex) {
    logger.error("Unhandled exception", ex);
    return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
            .body(Map.of("error", "Internal server error"));
}
```

**File:** `backend/src/main/java/com/nutrilog/exception/GlobalExceptionHandler.java`

---

### SHOULD FIX

**3. `ProfileRepository.java` — Service layer called from inside the Repository**

`mapRow()` calls `calorieGoalService.computeWeeksToTarget(...)`. Repositories should not call services — the dependency direction is inverted. This makes the layer boundary fuzzy and harder to test.

Move the `weeksToTarget` computation into `ProfileController` (or a dedicated `ProfileService` if you extract one). The repository returns a plain `Profile` with `weeksToTarget == null`, and the controller populates it before returning the response.

**File:** `backend/src/main/java/com/nutrilog/repository/ProfileRepository.java`  
**File:** `backend/src/main/java/com/nutrilog/controller/ProfileController.java`

---

**4. `ProfileController.java` — `PUT /profiles/{id}` accepts but ignores an explicit empty `activityLevel`**

The partial update logic checks `request.activityLevel() != null ? request.activityLevel() : existing.getActivityLevel()`. This means a client cannot intentionally clear a field by sending `null` — which is correct behaviour for this app. However, the inverse is also true: a client cannot send `activityLevel: ""` to indicate "not set." This is fine, but add a comment in the update block so the next engineer doesn't think it's a bug.

Also: activity_level is not validated in the PUT path since `@Valid` is intentionally absent. The NPE risk in #1 above applies here too. Make sure the `IllegalArgumentException` guard in `CalorieGoalService` is in place before the `activityLevel` field goes into production.

**File:** `backend/src/main/java/com/nutrilog/controller/ProfileController.java`

---

**5. `ParsedFoodItem.java` — `source` field should be an enum**

The `source` field carries string constants `"usda"`, `"open_food_facts"`, `"llm_estimate"`, `"not_found"`. Using raw strings means the LLM service, USDA service, and Open Food Facts service all need to know the exact string values. Define a `FoodSource` enum and use it consistently. This becomes important once the meal parsing pipeline is implemented in Phase 2.

```java
public enum FoodSource { USDA, OPEN_FOOD_FACTS, LLM_ESTIMATE, NOT_FOUND }
```

**File:** `backend/src/main/java/com/nutrilog/model/ParsedFoodItem.java`

---

**6. `ProfileRepository.save()` — unchecked null dereference on keyHolder**

`keyHolder.getKey().longValue()` will NPE if the JDBC driver doesn't return a generated key. SQLite with this driver reliably returns the key, so this is unlikely in practice — but it's an unchecked call. Add a null check or use `Objects.requireNonNull(keyHolder.getKey(), "Insert did not return generated key").longValue()` to make failures obvious rather than cryptic.

**File:** `backend/src/main/java/com/nutrilog/repository/ProfileRepository.java`

---

**7. `schema.sql` — missing index on `meals.profile_id`**

The `meals` table has a `profile_id` foreign key but no index on it. Every `SELECT ... WHERE profile_id = ?` (which will be the dominant query once meals are implemented) will do a full table scan. Add `CREATE INDEX IF NOT EXISTS idx_meals_profile_id ON meals(profile_id)` to the schema now, before any data exists.

**File:** `backend/src/main/resources/schema.sql`

---

**8. `schema.sql` — missing index on `meals.logged_at`**

The daily summary query will filter by date: `WHERE profile_id = ? AND DATE(logged_at) = ?`. Without an index on `logged_at`, this compounds the full-scan problem from #7. Add `CREATE INDEX IF NOT EXISTS idx_meals_logged_at ON meals(logged_at)`.

**File:** `backend/src/main/resources/schema.sql`

---

### MINOR

**9. `application.properties` — no startup validation for required env vars**

`GROQ_API_KEY` and `USDA_API_KEY` default to empty strings. If the app starts without them, it will fail at request time with an unclear HTTP error rather than a clear startup failure. Consider adding a `@PostConstruct` startup check in a config class that logs a warning (or fails fast) if these are blank.

**File:** `backend/src/main/resources/application.properties`

---

**10. `Profile.java` — verbose POJO; consider Lombok for Phase 2**

12+ getters/setters is manageable now but `Meal.java` (once written) will be larger. Add Lombok to `pom.xml` and use `@Data` or `@Getter/@Setter` to reduce the noise. Not urgent, but Phase 2 is the right time.

---

**11. `CorsConfig.java` — hardcoded origin will break in production**

`http://localhost:5173` is correct for development. If the app is ever served from a different origin (or the Vite port changes), CORS will silently block all requests. Move the allowed origin to a `@Value("${cors.allowed-origin:http://localhost:5173}")` property so it can be overridden without a code change.

**File:** `backend/src/main/java/com/nutrilog/config/CorsConfig.java`

---

## Frontend Review

### MUST FIX

**12. `client.js` — `BASE_URL` is hardcoded**

`const BASE_URL = 'http://localhost:8080'` will break the moment the backend port changes or the app runs in any environment other than local dev. Replace with:

```javascript
const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8080'
```

And add `VITE_API_URL=http://localhost:8080` to a `.env.local` file (gitignored). Vite picks this up automatically.

**File:** `frontend/src/api/client.js`

---

**13. `client.js` — network errors are not caught**

The `request()` helper handles non-2xx HTTP responses but does not handle `fetch()` rejections (network down, DNS failure, CORS error). These propagate as unhandled promise rejections, which are invisible to the user. Wrap the `fetch` call:

```javascript
async function request(path, options = {}) {
  let res
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    })
  } catch (err) {
    throw new Error('Cannot reach the server. Is the backend running?')
  }
  // ... rest of function
}
```

**File:** `frontend/src/api/client.js`

---

### SHOULD FIX

**14. `index.html` — title is `"frontend"`**

The browser tab reads "frontend". Change `<title>frontend</title>` to `<title>NutriLog</title>`.

**File:** `frontend/index.html`

---

**15. `main.jsx` — no 404 catch-all route**

If a user navigates to an unknown URL (e.g. `/dashboard/` without an ID, or a mistyped path), React Router silently renders nothing. Add a fallback route:

```jsx
<Route path="*" element={<Navigate to="/" replace />} />
```

**File:** `frontend/src/main.jsx`

---

**16. `client.js` — `getMeals` and `getSummary` expose date parameter but use query string construction directly**

Constructing query strings by hand (`?profile_id=${profileId}&date=${date}`) is fragile — if either value contains special characters, the URL breaks. Use `URLSearchParams`:

```javascript
export const getMeals = (profileId, date = today()) => {
  const params = new URLSearchParams({ profile_id: profileId, date })
  return request(`/meals?${params}`)
}
```

**File:** `frontend/src/api/client.js`

---

### MINOR

**17. No error boundary defined**

The app has no `<ErrorBoundary>` component. When a page-level render throws, the entire app goes blank with no user-facing message. Add a minimal error boundary around the route tree in `main.jsx` before implementing the landing and dashboard pages. React 19 supports the new `use()` hook approach, but a simple class-based boundary is fine.

**File:** `frontend/src/main.jsx`

---

**18. `index.css` — no CSS custom properties defined**

The global stylesheet is a blank canvas, which is fine for Phase 1. When the UX engineer starts styling components, establish CSS custom properties for colours, spacing, and typography at the `:root` level in `index.css` from the start. Retrofitting a design system onto per-component styles is painful. Suggest setting this up before any visual component work begins.

**File:** `frontend/src/index.css`

---

## Phase 2 Guidance for Backend Engineer

These are the things to keep in mind when you start the meal parsing work:

1. **Three services, one orchestrator.** Build `LlmService`, `UsdaService`, and `OpenFoodFactsService` as independent `@Service` classes. A `MealParsingService` orchestrates them. Do not put the pipeline logic in the controller.

2. **Stateless parsing endpoint.** `POST /meals/parse` should not write to the database — it returns a structured `ParsedMealResponse` for the frontend to preview. `POST /meals` does the actual write. This design is already correct in the API spec; don't drift from it.

3. **`items_json` column.** The meal schema stores the full item breakdown as a JSON text blob. Use Jackson's `ObjectMapper` to serialize/deserialize this field. Do not roll your own JSON handling.

4. **LLM failure handling.** Groq has rate limits and occasional downtime. The parsing pipeline must degrade gracefully: LLM fails → try USDA direct search → try Open Food Facts → return `source: "not_found"` per item. Never let an LLM timeout surface as a 500 to the client.

5. **USDA API key is optional in dev.** Do not make the app fail to start if `USDA_API_KEY` is blank. Log a warning and skip USDA verification in that case.

6. **Auto-purge.** The `>100 MB → delete meals >12 months` rule from `PROJECT_OVERVIEW.md` belongs in a `@PostConstruct` or scheduled `@EventListener(ApplicationStartedEvent.class)`. Run it once on startup before serving requests.

---

## Phase 2 Guidance for Frontend Engineer

1. **Profile cards on LandingPage.** Call `getProfiles()` in a `useEffect` with `useState` for loading/error/data. Show a spinner during load. Show an inline error (not an alert) on failure. Do not use a `useReducer` here — it's overkill for a single fetch.

2. **Profile creation modal.** The form should be controlled (React state per field). Run client-side validation before calling `createProfile()` — don't rely solely on the backend 422. On success, append the new profile to the list without a full re-fetch.

3. **Dashboard data.** The dashboard needs three concurrent fetches on mount: `getProfile(id)`, `getMeals(id, today)`, `getSummary(id, today)`. Use `Promise.all()` to run them in parallel. Don't waterfall.

4. **Meal entry form.** This is the core UX. The two-step flow is: user types description → calls `parseMeal()` → app shows parsed breakdown → user confirms → calls `confirmMeal()`. The parsed breakdown must be editable (the user may correct LLM values). Plan for this before writing the component — it has the most local state of anything in the app.

5. **profileId from params is a string.** `useParams()` returns strings. `profileId` from the URL will be `"1"`, not `1`. The API functions accept either (fetch stringifies), but be deliberate about coercion. Use `Number(profileId)` when passing to functions that send it in a request body.

---

## Summary Table

| # | Severity | Area | Status | Issue |
|---|----------|------|--------|-------|
| 1 | MUST FIX | Backend | ✅ Fixed | NPE on invalid `activityLevel` in `CalorieGoalService` |
| 2 | MUST FIX | Backend | ✅ Fixed | No logging in catch-all exception handler |
| 3 | SHOULD FIX | Backend | ✅ Fixed | Repository calls Service (inverted layer dependency) |
| 4 | SHOULD FIX | Backend | ✅ Fixed | `activityLevel` not validated in PUT path |
| 5 | SHOULD FIX | Backend | ✅ Fixed | `source` field in `ParsedFoodItem` should be an enum |
| 6 | SHOULD FIX | Backend | ✅ Fixed | Unchecked null dereference on `keyHolder.getKey()` |
| 7 | SHOULD FIX | Backend | ✅ Fixed | Missing index on `meals.profile_id` |
| 8 | SHOULD FIX | Backend | ✅ Fixed | Missing index on `meals.logged_at` |
| 9 | MINOR | Backend | Open | No startup validation for required API key env vars |
| 10 | MINOR | Backend | Open | Verbose POJO; consider Lombok for Phase 2 models |
| 11 | MINOR | Backend | Open | Hardcoded CORS origin |
| 12 | MUST FIX | Frontend | ✅ Fixed | `BASE_URL` hardcoded in `client.js` |
| 13 | MUST FIX | Frontend | ✅ Fixed | Network errors not caught in `request()` |
| 14 | SHOULD FIX | Frontend | ✅ Fixed | `<title>` is "frontend" not "NutriLog" |
| 15 | SHOULD FIX | Frontend | ✅ Fixed | No 404 catch-all route |
| 16 | SHOULD FIX | Frontend | ✅ Fixed | Manual query string construction — use `URLSearchParams` |
| 17 | MINOR | Frontend | Open | No error boundary |
| 18 | MINOR | Frontend | Open | No CSS custom properties — establish before styling begins |

**Remaining open items (#9, #10, #11, #17, #18) are all MINOR and can be addressed during Phase 2 as each file is touched.**
