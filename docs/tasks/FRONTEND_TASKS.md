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
- Route `/dashboard/:profileId` renders `<DashboardPage />`
- Both components can be stubs (return a heading) at this stage
- `BrowserRouter` wraps the app in `main.jsx`
- Navigating directly to `/dashboard/1` in the browser renders the dashboard stub without a 404

**Depends on:** Task 1.1

---

### Task 1.3 — API client module

**What:** Create a single module that wraps every backend endpoint in a named async function. All `fetch` calls live here — no component should call `fetch` directly.

**Functions to implement (map directly to the API contract in BACKEND_TASKS.md):**

```
getProfiles()                    → GET /profiles        → [{id, name, created_at, ...}]
createProfile(profileData)       → POST /profiles       → full profile row
deleteProfile(profileId)         → DELETE /profiles/{id} → {ok: true}
getProfile(profileId)            → GET /profiles/{id}   → full profile row
updateProfile(profileId, data)   → PUT /profiles/{id}   → updated profile row
parseMeal(profileId, description) → POST /meals/parse   → {items, totals}
confirmMeal(mealData)            → POST /meals          → saved meal row
getMeals(profileId, date)        → GET /meals           → [{id, description, calories, ...}]
deleteMeal(mealId)               → DELETE /meals/{id}   → {ok: true}
getSummary(profileId, date)      → GET /summary         → {date_totals, week_totals}
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
- `<Layout>` component in `src/components/Layout.jsx` renders a `<header>` with "NutriLog" and a `<Link to="/">` home link (React Router `<Link>`, not `<a>`), plus `{children}` below
- Both `<LandingPage>` and `<DashboardPage>` stubs render inside `<Layout>`
- No styling requirement at this stage — semantic HTML only

**Depends on:** Task 1.2

---

## Phase 2 — Landing Page

*Requires backend Phase 1 (Tasks 1.1–1.3) to be running for profile cards to load.*

### Task 2.1 — Profile cards from GET /profiles

**What:** Fetch all profiles on mount and render a card for each one. Clicking a card navigates to that profile's dashboard.

**Acceptance criteria:**
- `GET /profiles` is called on component mount via `getProfiles()` from the API client
- A card renders for each profile, showing the profile `name`
- If the array is empty: show only the "Add Profile" button and a welcome message ("No profiles yet — create your first one")
- Clicking a card navigates to `/dashboard/{id}` using React Router `useNavigate`
- While loading: show a "Loading..." text
- On API error: show "Could not load profiles — is the backend running?"
- No hardcoded profile names in JSX — always driven by the API response

**Depends on:** Tasks 1.2, 1.3; backend Task 1.3

---

### Task 2.2 — "Add Profile" button and creation form

**What:** An "Add Profile" button is always visible on the landing page. Clicking it opens a form to create a new profile in a single API call.

**Acceptance criteria:**
- "Add Profile" button is always visible regardless of how many profiles exist
- Clicking opens an inline form or modal with fields: name (text), age (number), gender (radio: male / female), height in cm (number), current weight in kg (number), target weight in kg (number), activity level (select), weekly rate (select)
- Validation: `name` is required and shown as an inline error if blank on submit; `current_weight_kg` and `target_weight_kg` are required; all other fields are optional at creation
- On submit: call `createProfile({ name, age, gender, height_cm, current_weight_kg, target_weight_kg, activity_level, weekly_rate_kg })` — a single `POST /profiles` call; the backend handles both identity and health data in one request
- On success: close the form, add the new card to the landing page without a full reload, and navigate to `/dashboard/{newProfile.id}`
- On API error: show an inline error message; do not close the form

**Depends on:** Tasks 1.2, 1.3; backend Task 1.3

---

### Task 2.3 — Delete profile

**What:** Each profile card has a delete control. Deleting a profile removes it and all its meal history after user confirmation.

**Acceptance criteria:**
- Each profile card renders a delete button (e.g. small "Delete" label or ✕, visible on hover is acceptable)
- Clicking the delete button shows a confirmation: "Delete [name]? This will remove all their meal history."
- On confirm: call `deleteProfile(profileId)`; on success remove the card from the page without a full reload
- On cancel: no action
- On API error: show an inline error; do not remove the card

**Depends on:** Tasks 1.3, 2.1; backend Task 1.3

---

## Phase 3 — Dashboard

*Requires backend Phase 2 (profile endpoints) and backend Phase 4 (summary endpoint) to be live.*

### Task 3.1 — Today's and weekly calorie totals

**What:** On dashboard load, call `GET /summary` for today's date and display both the daily and weekly calorie totals.

**Acceptance criteria:**
- `profileId` comes from `useParams()`
- Today's date is computed in the component using `new Date()` formatted as `YYYY-MM-DD`
- Displays: "Today: {calories} kcal" and "This week: {calories} kcal"
- Displays all four nutrients (calories, protein, fat, fiber) for both periods
- Shows 0 (not blank) when no meals have been logged
- Loading and error states handled

**Depends on:** Tasks 1.3, 1.4; backend Task 4.4

---

### Task 3.2 — Profile summary on dashboard

**What:** Fetch the profile and display name, weight, target weight, recommended daily calories, and weeks to target.

**Acceptance criteria:**
- `GET /profiles/{profileId}` called on mount alongside the summary call (parallel fetches — do not chain them)
- `profileId` comes from `useParams()`
- Displays: profile name (as a page heading), current weight (kg), target weight (kg), recommended daily calories (kcal/day), weeks to target
- If `current_weight_kg` and `target_weight_kg` are present, `recommended_daily_calories` is shown immediately if it is non-null — no "set up your profile" prompt for those fields
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
- On submit: call `parseMeal(profileId, description)` where `profileId` comes from `useParams()`, show a loading indicator while awaiting response
- On success: render the parsed breakdown (see Task 4.2)
- On API error: show an inline error message; do not clear the input
- Input is cleared only after the user confirms the meal (Task 4.3)

**Depends on:** Task 1.3; backend Task 3.5

---

### Task 4.2 — Parsed breakdown display

**What:** Show the per-item breakdown returned from `POST /meals/parse`, with inline manual entry fields for any `not_found` items.

**Acceptance criteria:**
- Each item in `items` renders as a row: `name | qty unit | calories kcal | protein_g g | fat_g g | fiber_g g | source badge`
- Items with `source: "not_found"` render four number inputs (calories, protein, fat, fiber) instead of the looked-up values. All four inputs are optional — only calories is practically required but no field should be forced
- A totals row shows the sum of all items' nutrients (updated live as the user types into `not_found` inputs)
- "Source" badge: "USDA" for `usda`, "OFF" for `open_food_facts`, "AI Est." for `llm_estimate`, "Manual" for `not_found`

**Depends on:** Task 4.1

---

### Task 4.3 — Confirm and save meal

**What:** "Confirm and Save" button calls `POST /meals` with the resolved breakdown, then updates the dashboard totals without a page reload.

**Acceptance criteria:**
- "Confirm and Save" button is disabled until the breakdown is displayed
- On click: build the request body — `{profile_id, description, items_json: JSON.stringify(items), calories: total, protein_g: total, fat_g: total, fiber_g: total}` — and call `confirmMeal()`
- `profile_id` comes from `useParams()` as `profileId`
- `not_found` items use the user-entered values (or 0 if left blank) in both `items_json` and the totals
- On success: clear the meal input and breakdown, then re-fetch summary so today's and weekly totals update immediately (no page reload)
- On API error: show an error message; do not clear the form

**Depends on:** Tasks 4.1, 4.2, 3.1; backend Task 4.1

---

## Phase 5 — Profile Setup

*Requires backend Phase 2 (profile endpoints) to be live.*

### Task 5.1 — Profile form

**What:** Build a form per profile for all profile fields. Saving the form calls `PUT /profiles/{profileId}` and refreshes the dashboard's calorie goal display.

**Fields:** name (text), age (number), gender (radio: male / female), height in cm (number), current weight in kg (number), target weight in kg (number), activity level (select: Sedentary / Lightly Active / Moderately Active / Very Active), weekly rate of change in kg/week (select or number: 0.25 / 0.5 / 0.75 / 1.0)

**Acceptance criteria:**
- Form pre-populates with existing profile values from `GET /profiles/{profileId}`
- `profileId` comes from `useParams()`
- Name field is editable — users can rename a profile at any time
- All fields except name are optional for save; show inline validation only if the user attempts to save an incomplete set that would prevent calorie goal calculation
- Activity level select maps display labels to the API values: `"Sedentary" → "sedentary"`, `"Lightly Active" → "lightly_active"`, `"Moderately Active" → "moderately_active"`, `"Very Active" → "very_active"`
- On save: call `updateProfile(profileId, formData)`, then update the profile name (if changed), recommended daily calories, and weeks to target on the dashboard — no page reload
- The profile form can be rendered as an inline section, a modal, or a separate route — implementer's choice, but it must be reachable from the dashboard

**Depends on:** Tasks 1.3, 3.2; backend Task 2.3

---

## Phase 6 — Meal History

*Requires backend Phase 4 (GET /meals and DELETE /meals) to be live.*

### Task 6.1 — Today's meal list

**What:** Below the summary section, list all meals logged today for the active profile.

**Acceptance criteria:**
- Calls `getMeals(profileId, today)` on mount (can share the same mount effect as the summary call — parallel fetches)
- `profileId` comes from `useParams()`
- Meals rendered in chronological order, each row showing: logged time (HH:MM), description, calorie count
- Empty state: "No meals logged today" — not blank
- Meals are scoped to the active `profileId` — verify there is no chance of cross-profile data (the `profile_id` query param must always come from `useParams()`, never from component state or a hardcoded value)

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
