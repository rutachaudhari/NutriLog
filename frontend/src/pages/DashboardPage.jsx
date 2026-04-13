import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import Layout from '../components/Layout'
import {
  getProfile,
  updateProfile,
  getSummary,
  getMeals,
  parseMeal,
  confirmMeal,
  deleteMeal,
} from '../api/client'

const ACTIVITY_OPTIONS = [
  { label: 'Sedentary', value: 'sedentary' },
  { label: 'Lightly Active', value: 'lightly_active' },
  { label: 'Moderately Active', value: 'moderately_active' },
  { label: 'Very Active', value: 'very_active' },
]

const RATE_OPTIONS = ['0.25', '0.5', '0.75', '1.0']

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

function formatTime(isoString) {
  if (!isoString) return '—'
  const d = new Date(isoString)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
}

function sourceBadge(source) {
  switch (source) {
    case 'usda': return <span className="badge badge-usda">USDA</span>
    case 'open_food_facts': return <span className="badge badge-off">OFF</span>
    case 'llm_estimate': return <span className="badge badge-ai">AI Est.</span>
    case 'not_found': return <span className="badge badge-manual">Manual</span>
    default: return <span className="badge">{source}</span>
  }
}

function buildProfileBody(form) {
  const body = {}
  if (form.name && form.name.trim() !== '') body.name = form.name.trim()
  if (form.age !== '' && !isNaN(Number(form.age))) body.age = Number(form.age)
  if (form.gender !== '') body.gender = form.gender
  if (form.height_cm !== '' && !isNaN(Number(form.height_cm))) body.height_cm = Number(form.height_cm)
  if (form.current_weight_kg !== '' && !isNaN(Number(form.current_weight_kg))) body.current_weight_kg = Number(form.current_weight_kg)
  if (form.target_weight_kg !== '' && !isNaN(Number(form.target_weight_kg))) body.target_weight_kg = Number(form.target_weight_kg)
  if (form.activity_level !== '') body.activity_level = form.activity_level
  if (form.weekly_rate_kg !== '' && !isNaN(Number(form.weekly_rate_kg))) body.weekly_rate_kg = Number(form.weekly_rate_kg)
  return body
}

function profileToForm(profile) {
  return {
    name: profile.name ?? '',
    age: profile.age != null ? String(profile.age) : '',
    gender: profile.gender ?? '',
    height_cm: profile.height_cm != null ? String(profile.height_cm) : '',
    current_weight_kg: profile.current_weight_kg != null ? String(profile.current_weight_kg) : '',
    target_weight_kg: profile.target_weight_kg != null ? String(profile.target_weight_kg) : '',
    activity_level: profile.activity_level ?? '',
    weekly_rate_kg: profile.weekly_rate_kg != null ? String(profile.weekly_rate_kg) : '',
  }
}

// Compute live totals from parsedItems (some may have user-overridden values)
function computeTotals(items) {
  return items.reduce(
    (acc, item) => ({
      calories: acc.calories + (Number(item._calories ?? item.calories) || 0),
      protein_g: acc.protein_g + (Number(item._protein_g ?? item.protein_g) || 0),
      fat_g: acc.fat_g + (Number(item._fat_g ?? item.fat_g) || 0),
      fiber_g: acc.fiber_g + (Number(item._fiber_g ?? item.fiber_g) || 0),
    }),
    { calories: 0, protein_g: 0, fat_g: 0, fiber_g: 0 }
  )
}

export default function DashboardPage() {
  const { profileId: profileIdStr } = useParams()
  const profileId = Number(profileIdStr)
  const today = todayStr()

  // ── Main data state ──────────────────────────────────────────────────
  const [profile, setProfile] = useState(null)
  const [summary, setSummary] = useState(null)
  const [meals, setMeals] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // ── Meal parse / confirm state ───────────────────────────────────────
  const [mealInput, setMealInput] = useState('')
  const [parsing, setParsing] = useState(false)
  const [parseError, setParseError] = useState('')
  // parsedItems: null when no active parse; array of items (with _override fields for not_found)
  const [parsedItems, setParsedItems] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  // ── Profile edit state ───────────────────────────────────────────────
  const [showProfileForm, setShowProfileForm] = useState(false)
  const [profileForm, setProfileForm] = useState(null)
  const [profileFormError, setProfileFormError] = useState('')
  const [profileSaving, setProfileSaving] = useState(false)

  // ── Meal delete errors (per meal id) ────────────────────────────────
  const [mealDeleteErrors, setMealDeleteErrors] = useState({})

  // ── Fetch summary helper (re-used after mutations) ───────────────────
  const refreshSummary = useCallback(() => {
    return getSummary(profileId, today).then(setSummary).catch(() => {})
  }, [profileId, today])

  // ── Initial parallel fetch ───────────────────────────────────────────
  useEffect(() => {
    setLoading(true)
    setError(null)
    Promise.all([
      getProfile(profileId),
      getSummary(profileId, today),
      getMeals(profileId, today),
    ])
      .then(([profileData, summaryData, mealsData]) => {
        setProfile(profileData)
        setProfileForm(profileToForm(profileData))
        setSummary(summaryData)
        setMeals(mealsData)
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [profileId, today])

  // ── Parse meal ───────────────────────────────────────────────────────
  async function handleParse(e) {
    e.preventDefault()
    if (!mealInput.trim()) return
    setParsing(true)
    setParseError('')
    setParsedItems(null)
    setSaveError('')
    try {
      const result = await parseMeal(profileId, mealInput.trim())
      // Attach override fields for not_found items (blank strings = user hasn't typed yet)
      const items = (result.items || []).map(item => ({
        ...item,
        _calories: item.source === 'not_found' ? '' : undefined,
        _protein_g: item.source === 'not_found' ? '' : undefined,
        _fat_g: item.source === 'not_found' ? '' : undefined,
        _fiber_g: item.source === 'not_found' ? '' : undefined,
      }))
      setParsedItems(items)
    } catch (err) {
      setParseError(err.message)
    } finally {
      setParsing(false)
    }
  }

  // ── Update override field for a not_found item ───────────────────────
  function handleNotFoundField(itemIndex, field, value) {
    setParsedItems(prev =>
      prev.map((item, i) => i === itemIndex ? { ...item, [field]: value } : item)
    )
  }

  // ── Confirm and save meal ────────────────────────────────────────────
  async function handleConfirm() {
    if (!parsedItems) return
    setSaving(true)
    setSaveError('')

    // Build final items array with resolved numeric values
    const resolvedItems = parsedItems.map(item => {
      if (item.source !== 'not_found') return item
      return {
        ...item,
        calories: Number(item._calories) || 0,
        protein_g: Number(item._protein_g) || 0,
        fat_g: Number(item._fat_g) || 0,
        fiber_g: Number(item._fiber_g) || 0,
      }
    })

    const totals = computeTotals(resolvedItems)

    try {
      await confirmMeal({
        profile_id: profileId,
        description: mealInput.trim(),
        items_json: JSON.stringify(resolvedItems),
        calories: totals.calories,
        protein_g: totals.protein_g,
        fat_g: totals.fat_g,
        fiber_g: totals.fiber_g,
      })
      // Clear form
      setMealInput('')
      setParsedItems(null)
      // Re-fetch summary and meals
      const [updatedSummary, updatedMeals] = await Promise.all([
        getSummary(profileId, today),
        getMeals(profileId, today),
      ])
      setSummary(updatedSummary)
      setMeals(updatedMeals)
    } catch (err) {
      setSaveError(err.message)
    } finally {
      setSaving(false)
    }
  }

  // ── Delete a meal ────────────────────────────────────────────────────
  async function handleDeleteMeal(mealId) {
    setMealDeleteErrors(prev => ({ ...prev, [mealId]: null }))
    try {
      await deleteMeal(mealId)
      setMeals(prev => prev.filter(m => m.id !== mealId))
      await refreshSummary()
    } catch (err) {
      setMealDeleteErrors(prev => ({ ...prev, [mealId]: err.message }))
    }
  }

  // ── Profile form field change ────────────────────────────────────────
  function handleProfileField(e) {
    const { name, value } = e.target
    setProfileForm(f => ({ ...f, [name]: value }))
  }

  // ── Save profile ─────────────────────────────────────────────────────
  async function handleProfileSave(e) {
    e.preventDefault()
    if (!profileForm.name || !profileForm.name.trim()) return
    setProfileSaving(true)
    setProfileFormError('')
    try {
      const updated = await updateProfile(profileId, buildProfileBody(profileForm))
      setProfile(updated)
      setProfileForm(profileToForm(updated))
      setShowProfileForm(false)
    } catch (err) {
      setProfileFormError(err.message)
    } finally {
      setProfileSaving(false)
    }
  }

  // ── Render ───────────────────────────────────────────────────────────
  if (loading) return <Layout><p style={{ padding: '1rem' }}>Loading...</p></Layout>
  if (error) return <Layout><p className="error-msg" style={{ padding: '1rem' }}>{error}</p></Layout>

  const dateTotals = summary?.date_totals ?? {}
  const weekTotals = summary?.week_totals ?? {}

  const liveTotals = parsedItems ? computeTotals(parsedItems) : null

  return (
    <Layout>
      {/* ── Profile heading ── */}
      <div className="section-header">
        <h1 style={{ margin: 0 }}>{profile.name}</h1>
        <button
          className="btn-secondary"
          onClick={() => { setShowProfileForm(s => !s); setProfileFormError('') }}
        >
          {showProfileForm ? 'Close Profile' : 'Edit Profile'}
        </button>
      </div>

      {/* ── Profile stats ── */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Current Weight</div>
          <div className="stat-value">{profile.current_weight_kg ?? '—'}</div>
          <div className="stat-unit">kg</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Target Weight</div>
          <div className="stat-value">{profile.target_weight_kg ?? '—'}</div>
          <div className="stat-unit">kg</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Daily Goal</div>
          {profile.recommended_daily_calories != null ? (
            <>
              <div className="stat-value">{Math.round(profile.recommended_daily_calories)}</div>
              <div className="stat-unit">kcal/day</div>
            </>
          ) : (
            <div style={{ fontSize: '0.8rem', marginTop: '4px' }}>
              <button className="btn-link" style={{ fontSize: '0.8rem' }} onClick={() => setShowProfileForm(true)}>
                Set up your profile to see your calorie goal
              </button>
            </div>
          )}
        </div>
        <div className="stat-card">
          <div className="stat-label">Weeks to Target</div>
          <div className="stat-value">
            {profile.weeks_to_target != null ? Math.ceil(profile.weeks_to_target) : '—'}
          </div>
          <div className="stat-unit">weeks</div>
        </div>
      </div>

      {/* ── Inline profile edit form ── */}
      {showProfileForm && profileForm && (
        <div className="form-section">
          <h2 style={{ marginTop: 0 }}>Edit Profile</h2>
          <form onSubmit={handleProfileSave} noValidate>
            <div className="form-group">
              <label htmlFor="pf-name">Name *</label>
              <input id="pf-name" name="name" type="text" value={profileForm.name} onChange={handleProfileField} />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="pf-age">Age</label>
                <input id="pf-age" name="age" type="number" min="1" max="120" value={profileForm.age} onChange={handleProfileField} />
              </div>
              <div className="form-group">
                <label>Gender</label>
                <div className="radio-group">
                  <label>
                    <input type="radio" name="gender" value="male" checked={profileForm.gender === 'male'} onChange={handleProfileField} />
                    Male
                  </label>
                  <label>
                    <input type="radio" name="gender" value="female" checked={profileForm.gender === 'female'} onChange={handleProfileField} />
                    Female
                  </label>
                </div>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="pf-height">Height (cm)</label>
                <input id="pf-height" name="height_cm" type="number" min="50" max="300" value={profileForm.height_cm} onChange={handleProfileField} />
              </div>
              <div className="form-group">
                <label htmlFor="pf-cw">Current Weight (kg)</label>
                <input id="pf-cw" name="current_weight_kg" type="number" min="1" step="0.1" value={profileForm.current_weight_kg} onChange={handleProfileField} />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="pf-tw">Target Weight (kg)</label>
                <input id="pf-tw" name="target_weight_kg" type="number" min="1" step="0.1" value={profileForm.target_weight_kg} onChange={handleProfileField} />
              </div>
              <div className="form-group">
                <label htmlFor="pf-activity">Activity Level</label>
                <select id="pf-activity" name="activity_level" value={profileForm.activity_level} onChange={handleProfileField}>
                  <option value="">— Select —</option>
                  {ACTIVITY_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="pf-rate">Weekly Rate (kg/week)</label>
              <select id="pf-rate" name="weekly_rate_kg" value={profileForm.weekly_rate_kg} onChange={handleProfileField}>
                <option value="">— Select —</option>
                {RATE_OPTIONS.map(r => <option key={r} value={r}>{r} kg/week</option>)}
              </select>
            </div>

            {profileFormError && <p className="error-msg">{profileFormError}</p>}

            <div className="btn-row">
              <button type="submit" className="btn-primary" disabled={profileSaving}>
                {profileSaving ? 'Saving…' : 'Save'}
              </button>
              <button type="button" className="btn-secondary" onClick={() => { setShowProfileForm(false); setProfileForm(profileToForm(profile)); setProfileFormError('') }}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Today's and weekly totals ── */}
      <div className="section-header">
        <h2>Nutrition Totals</h2>
      </div>

      <div className="card" style={{ overflowX: 'auto' }}>
        <table className="meal-table">
          <thead>
            <tr>
              <th>Period</th>
              <th>Calories (kcal)</th>
              <th>Protein (g)</th>
              <th>Fat (g)</th>
              <th>Fiber (g)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>Today</strong></td>
              <td>{dateTotals.calories ?? 0}</td>
              <td>{dateTotals.protein_g ?? 0}</td>
              <td>{dateTotals.fat_g ?? 0}</td>
              <td>{dateTotals.fiber_g ?? 0}</td>
            </tr>
            <tr>
              <td><strong>This Week</strong></td>
              <td>{weekTotals.calories ?? 0}</td>
              <td>{weekTotals.protein_g ?? 0}</td>
              <td>{weekTotals.fat_g ?? 0}</td>
              <td>{weekTotals.fiber_g ?? 0}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ── Meal entry form ── */}
      <div className="section-header">
        <h2>Log a Meal</h2>
      </div>

      <div className="card">
        <form onSubmit={handleParse}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label htmlFor="meal-input">Describe what you ate</label>
            <div style={{ display: 'flex', gap: 'var(--spacing-sm)', marginTop: 'var(--spacing-xs)' }}>
              <input
                id="meal-input"
                type="text"
                value={mealInput}
                onChange={e => { setMealInput(e.target.value); setParseError(''); setParsedItems(null); setSaveError('') }}
                placeholder="e.g. 2 scrambled eggs and toast with butter"
                disabled={parsing}
              />
              <button
                type="submit"
                className="btn-primary"
                disabled={!mealInput.trim() || parsing}
                style={{ whiteSpace: 'nowrap' }}
              >
                {parsing ? 'Parsing…' : 'Parse Meal'}
              </button>
            </div>
          </div>
        </form>

        {parseError && <p className="error-msg" style={{ marginTop: 'var(--spacing-sm)' }}>{parseError}</p>}

        {/* ── Parsed breakdown ── */}
        {parsedItems && (
          <div style={{ marginTop: 'var(--spacing-md)' }}>
            <table className="meal-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Qty</th>
                  <th>Calories</th>
                  <th>Protein (g)</th>
                  <th>Fat (g)</th>
                  <th>Fiber (g)</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {parsedItems.map((item, i) => (
                  <tr key={i}>
                    <td>{item.name}</td>
                    <td>{item.quantity != null ? `${item.quantity}${item.unit ? ' ' + item.unit : ''}` : '—'}</td>
                    {item.source === 'not_found' ? (
                      <>
                        <td>
                          <input
                            type="number"
                            className="input-sm"
                            min="0"
                            placeholder="0"
                            value={item._calories}
                            onChange={e => handleNotFoundField(i, '_calories', e.target.value)}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            className="input-sm"
                            min="0"
                            placeholder="0"
                            value={item._protein_g}
                            onChange={e => handleNotFoundField(i, '_protein_g', e.target.value)}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            className="input-sm"
                            min="0"
                            placeholder="0"
                            value={item._fat_g}
                            onChange={e => handleNotFoundField(i, '_fat_g', e.target.value)}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            className="input-sm"
                            min="0"
                            placeholder="0"
                            value={item._fiber_g}
                            onChange={e => handleNotFoundField(i, '_fiber_g', e.target.value)}
                          />
                        </td>
                      </>
                    ) : (
                      <>
                        <td>{item.calories != null ? Math.round(item.calories) : '—'}</td>
                        <td>{item.protein_g != null ? item.protein_g.toFixed(1) : '—'}</td>
                        <td>{item.fat_g != null ? item.fat_g.toFixed(1) : '—'}</td>
                        <td>{item.fiber_g != null ? item.fiber_g.toFixed(1) : '—'}</td>
                      </>
                    )}
                    <td>{sourceBadge(item.source)}</td>
                  </tr>
                ))}
                {/* Totals row */}
                <tr className="totals-row">
                  <td colSpan={2}><strong>Total</strong></td>
                  <td><strong>{Math.round(liveTotals.calories)}</strong></td>
                  <td><strong>{liveTotals.protein_g.toFixed(1)}</strong></td>
                  <td><strong>{liveTotals.fat_g.toFixed(1)}</strong></td>
                  <td><strong>{liveTotals.fiber_g.toFixed(1)}</strong></td>
                  <td></td>
                </tr>
              </tbody>
            </table>

            {saveError && <p className="error-msg" style={{ marginTop: 'var(--spacing-sm)' }}>{saveError}</p>}

            <div className="btn-row" style={{ marginTop: 'var(--spacing-md)' }}>
              <button
                className="btn-primary"
                onClick={handleConfirm}
                disabled={saving || !parsedItems}
              >
                {saving ? 'Saving…' : 'Confirm and Save'}
              </button>
              <button
                className="btn-secondary"
                onClick={() => { setParsedItems(null); setSaveError('') }}
              >
                Discard
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Today's meal list ── */}
      <div className="section-header">
        <h2>Today's Meals</h2>
      </div>

      <div className="card">
        {meals.length === 0 ? (
          <p className="info-msg" style={{ margin: 0 }}>No meals logged today</p>
        ) : (
          <table className="meal-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Description</th>
                <th>Calories</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {[...meals]
                .sort((a, b) => new Date(a.logged_at) - new Date(b.logged_at))
                .map(meal => (
                  <tr key={meal.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{formatTime(meal.logged_at)}</td>
                    <td>{meal.description}</td>
                    <td>{meal.calories != null ? Math.round(meal.calories) : '—'} kcal</td>
                    <td>
                      <button
                        className="btn-danger"
                        onClick={() => handleDeleteMeal(meal.id)}
                      >
                        Delete
                      </button>
                      {mealDeleteErrors[meal.id] && (
                        <p className="error-msg" style={{ margin: '2px 0 0', fontSize: '0.75rem' }}>
                          {mealDeleteErrors[meal.id]}
                        </p>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </div>
    </Layout>
  )
}
