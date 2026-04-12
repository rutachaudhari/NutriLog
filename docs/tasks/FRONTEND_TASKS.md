# NutriLog — Frontend Tasks

> Stack: React · Vite · React Router
> Start command: `npm run dev` from the frontend project root (runs on `http://localhost:5173`)
> Backend API base URL: `http://localhost:8080`

---

## Phase 1 — Scaffold

### Task 1.1 — Vite + React project setup

**What:** Bootstrap the frontend project with Vite and install the only required routing dependency.

**Acceptance criteria:**
- `npm create vite@latest` with React + JavaScript template (no TypeScript in v1)
- `react-router-dom` installed
- `npm run dev` starts without errors and shows the default Vite page at `localhost:5173`
- Remove all Vite boilerplate from `App.jsx` and `index.css` after scaffolding — start clean

**Depends on:** none

---

### Task 1.2 — React Router setup

**What:** Configure the two top-level routes the app needs.

**Acceptance criteria:**
- Route `/` renders `<LandingPage />`
- Route `/dashboard/:personaId` renders `<DashboardPage />`
- Both components can be stubs (return a heading) at this stage
- `BrowserRouter` wraps the app in `main.jsx`
- Navigating directly to `/dashboard/1` in the browser renders the dashboard stub without a 404

**Depends on:** Task 1.1

---

### Task 1.3 — API client module

**What:** Create a single module that wraps every backend endpoint in a named async function. All `fetch` calls live here — no component should call `fetch` directly.

**Functions to implement (map directly to the API contract in BACKEND_TASKS.md):**

```
getPersonas()              → GET /personas  → [{id, name, created_at}]
createPersona(name)        → POST /personas → {id, name, created_at}
deletePersona(personaId)   → DELETE /personas/{id} → {ok: true}
getProfile(personaId)
updateProfile(personaId, profileData)
parseMeal(personaId, description)
confirmMeal(mealData)
getMeals(personaId, date)
deleteMeal(mealId)
getSummary(personaId, date)
```

**Acceptance criteria:**
- Module lives at `src/api/client.js`
- `BASE_URL` is defined once at the top of the file as `http://localhost:8080` — change in one place only
- Every function returns the parsed JSON response body on success
- On non-2xx response, every function throws an `Error` whose `.message` is the HTTP status text or a parsed error body string — never swallows errors silently
- `date` arguments are formatted as `YYYY-MM-DD` using a small helper in the same file

**Depends on:** Task 1.1

---

### Task 1.4 — Basic layout shell

**What:** Create a minimal layout wrapper that both pages can use — header with the app name and a way to get back to the landing page.

**Acceptance criteria:**
- `<Layout>` component in `src/components/Layout.jsx` renders a `<header>` with "NutriLog" and a home link, plus `{children}` below
- Both `<LandingPage>` and `<DashboardPage>` stubs render inside `<Layout>`
- No styling requirement at this stage — semantic HTML only

**Depends on:** Task 1.2

---

## Phase 2 — Landing Page

*Requires backend Phase 1 (Tasks 1.1–1.3) to be running for persona cards to load.*

### Task 2.1 — Profile cards from GET /personas

**What:** Fetch all personas on mount and render a card for each one. Clicking a card navigates to that persona's dashboard.

**Acceptance criteria:**
- `GET /personas` is called on component mount via `getPersonas()` from the API client
- A card renders for each persona, showing the persona `name`
- If the array is empty: show only the "Add Profile" button and a welcome message ("No profiles yet — create your first one")
- Clicking a card navigates to `/dashboard/{id}` using React Router `useNavigate`
- While loading: show a "Loading..." text
- On API error: show "Could not load profiles — is the backend running?"
- No hardcoded persona names in JSX — always driven by the API response

**Depends on:** Tasks 1.2, 1.3; backend Task 1.3

---

### Task 2.2 — "Add Profile" button and creation form

**What:** An "Add Profile" button is always visible on the landing page. Clicking it opens a form to create a new persona and immediately populate its profile.

**Acceptance criteria:**
- "Add Profile" button is always visible regardless of how many profiles exist
- Clicking opens an inline form or modal with fields: name (text), age (number), gender (radio: male / female), height in cm (number), current weight in kg (number), target weight in kg (number), activity level (select), weekly rate (select)
- Validation: `name` is required and shown as error if blank on submit; `current_weight_kg` and `target_weight_kg` are required; all other fields are optional at creation
- On submit:
  1. Call `createPersona(name)` → receive `{id, name, created_at}`
  2. If any optional profile fields were provided: call `updateProfile(newPersonaId, profileData)`. Note that `PUT /profiles/{persona_id}` requires all seven profile fields — only make this call if the user filled them all in; otherwise skip and let the user complete the profile from the dashboard
  3. On success: close the form, add the new card to the landing page, and navigate to `/dashboard/{newPersonaId}`
- On API error: show an inline error; do not close the form

**Depends on:** Tasks 1.2, 1.3; backend Task 1.3

---

### Task 2.3 — Delete profile

**What:** Each profile card has a delete control. Deleting a profile removes it and all its meal history after user confirmation.

**Acceptance criteria:**
- Each profile card renders a delete button (e.g. small "Delete" label or ✕, visible on hover is acceptable)
- Clicking the delete button shows a confirmation: "Delete [name]? This will remove all their meal history."
- On confirm: call `deletePersona(personaId)`; on success remove the card from the page without a full reload
- On cancel: no action
- On API error: show an inline error; do not remove the card

**Depends on:** Tasks 1.3, 2.1; backend Task 1.3

---

## Phase 3 — Dashboard

*Requires backend Phase 2 (profile endpoints) and backend Phase 4 (summary endpoint) to be live.*

### Task 3.1 — Today's and weekly calorie totals

**What:** On dashboard load, call `GET /summary` for today's date and display both the daily and weekly calorie totals.

**Acceptance criteria:**
- `personaId` comes from `useParams()`
- Today's date is computed in the component using `new Date()` formatted as `YYYY-MM-DD`
- Displays: "Today: {calories} kcal" and "This week: {calories} kcal"
- Displays all four nutrients (calories, protein, fat, fiber) for both periods
- Shows 0 (not blank) when no meals have been logged
- Loading and error states handled

**Depends on:** Tasks 1.3, 1.4; backend Task 4.4

---

### Task 3.2 — Profile summary on dashboard

**What:** Fetch the persona's profile and display weight, target weight, recommended daily calories, and weeks to target.

**Acceptance criteria:**
- `GET /profiles/{personaId}` called on mount alongside the summary call (parallel fetches — do not chain them)
- Displays: current weight (kg), target weight (kg), recommended daily calories (kcal/day), weeks to target
- If `current_weight_kg` and `target_weight_kg` are present (set at profile creation), `recommended_daily_calories` is shown immediately if it is non-null — no "set up your profile" prompt for those fields
- The "Set up your profile to see your calorie goal" prompt (with a link to the profile form, Task 5.1) only appears if `recommended_daily_calories` is null — which happens when age, gender, height, or activity_level are missing (required for Mifflin-St Jeor). Weight fields alone are not enough to compute the goal.
- Weeks to target displays as a whole number (round up)

**Depends on:** Tasks 1.3, 3.1; backend Task 2.3

---

## Phase 4 — Meal Entry Flow

*Requires backend Phase 3 (parse endpoint) and backend Task 4.1 (confirm endpoint) to be live.*

### Task 4.1 — Meal description input and parse call

**What:** Render a text input and submit button on the dashboard. On submit, call `POST /meals/parse` and display the returned breakdown.

**Acceptance criteria:**
- Text input accepts any string; submit disabled when input is empty
- On submit: call `parseMeal(personaId, description)`, show a loading indicator while awaiting response
- On success: render the parsed breakdown (see Task 4.2)
- On API error: show an inline error message; do not clear the input
- Input is cleared only after the user confirms the meal (Task 4.3)

**Depends on:** Task 1.3; backend Task 3.3

---

### Task 4.2 — Parsed breakdown display

**What:** Show the per-item breakdown returned from `POST /meals/parse`, with inline manual entry fields for any `not_found` items.

**Acceptance criteria:**
- Each item in `items` renders as a row: `name | qty unit | calories kcal | protein_g g | fat_g g | fiber_g g | source badge`
- Items with `source: "not_found"` render four number inputs (calories, protein, fat, fiber) instead of the looked-up values. All four inputs are optional — only calories is practically required but no field should be forced
- A totals row shows the sum of all items' nutrients (updated live as the user types into `not_found` inputs)
- "Source" badge: "USDA" for usda, "OFF" for open_food_facts, "AI Est." for llm_estimate, "Manual" for not_found

**Depends on:** Task 4.1

---

### Task 4.3 — Confirm and save meal

**What:** "Confirm and Save" button calls `POST /meals` with the resolved breakdown, then updates the dashboard totals without a page reload.

**Acceptance criteria:**
- "Confirm and Save" button is disabled until the breakdown is displayed
- On click: build the request body — `{persona_id, description, items_json: JSON.stringify(items), calories: total, protein_g: total, fat_g: total, fiber_g: total}` — and call `confirmMeal()`
- `not_found` items use the user-entered values (or 0 if left blank) in both `items_json` and the totals
- On success: clear the meal input and breakdown, then re-fetch summary so today's and weekly totals update immediately (no page reload)
- On API error: show an error message; do not clear the form

**Depends on:** Tasks 4.1, 4.2, 3.1; backend Task 4.1

---

## Phase 5 — Profile Setup

*Requires backend Phase 2 (profile endpoints) to be live.*

### Task 5.1 — Profile form

**What:** Build a form per persona for all seven profile fields. Saving the form calls `PUT /profiles/{personaId}` and refreshes the dashboard's calorie goal display.

**Fields:** age (number), gender (radio: male / female), height in cm (number), current weight in kg (number), target weight in kg (number), activity level (select: Sedentary / Lightly Active / Moderately Active / Very Active), weekly rate of change in kg/week (select or number: 0.25 / 0.5 / 0.75 / 1.0)

**Acceptance criteria:**
- Form pre-populates with existing profile values from `GET /profiles/{personaId}`
- All seven fields are required for submit; show inline validation errors for missing fields
- Activity level select maps display labels to the API values: `"Sedentary" → "sedentary"`, `"Lightly Active" → "lightly_active"`, `"Moderately Active" → "moderately_active"`, `"Very Active" → "very_active"`
- On save: call `updateProfile(personaId, formData)`, then update the recommended daily calories and weeks to target displayed on the dashboard — no page reload
- Persona name is displayed on the form as a heading but the field is read-only — name editing is not supported in v1
- The profile form can be rendered as an inline section, a modal, or a separate route — implementer's choice, but it must be reachable from the dashboard

**Depends on:** Tasks 1.3, 3.2; backend Task 2.3

---

## Phase 6 — Meal History

*Requires backend Phase 4 (GET /meals and DELETE /meals) to be live.*

### Task 6.1 — Today's meal list

**What:** Below the summary section, list all meals logged today for the active persona.

**Acceptance criteria:**
- Calls `getMeals(personaId, today)` on mount (can share the same mount effect as the summary call — parallel fetches)
- Meals rendered in chronological order, each row showing: logged time (HH:MM), description, calorie count
- Empty state: "No meals logged today" — not blank
- Meals are scoped to the active `personaId` — verify there is no chance of cross-persona data (the `persona_id` query param must always come from `useParams()`, never from component state or a hardcoded value)

**Depends on:** Tasks 1.3, 3.1; backend Task 4.2

---

### Task 6.2 — Delete meal with inline total update

**What:** Each meal row has a delete button. Deleting a meal removes it from the list and immediately updates the today and weekly totals.

**Acceptance criteria:**
- Delete button calls `deleteMeal(mealId)`
- On success: remove the meal row from local state without re-fetching the meal list, then re-fetch `getSummary()` so totals update
- On API error: show an inline error; do not remove the row
- No confirmation dialog required (deletes are immediate in v1)

**Depends on:** Tasks 6.1, 3.1; backend Task 4.3

---
