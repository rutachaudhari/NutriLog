import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import Layout from '../components/Layout'
import {
  getProfile,
  updateProfile,
  getSummary,
  getMeals,
  getMealsRange,
  parseMeal,
  confirmMeal,
  deleteMeal,
} from '../api/client'
import styles from './DashboardPage.module.css'

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

function getISOWeekBounds(offsetWeeks = 0) {
  const now = new Date()
  now.setDate(now.getDate() + offsetWeeks * 7)
  const day = now.getDay() // 0=Sun
  const diffToMonday = day === 0 ? -6 : 1 - day
  const monday = new Date(now)
  monday.setDate(now.getDate() + diffToMonday)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  return {
    start: monday.toISOString().slice(0, 10),
    end: sunday.toISOString().slice(0, 10),
  }
}

function formatWeekLabel(start, end) {
  const fmt = (d) => new Date(d + 'T00:00:00').toLocaleDateString([], { month: 'short', day: 'numeric' })
  return `${fmt(start)} – ${fmt(end)}`
}

function groupByDay(meals) {
  const groups = {}
  for (const meal of meals) {
    const day = meal.logged_at.slice(0, 10)
    if (!groups[day]) groups[day] = []
    groups[day].push(meal)
  }
  return groups
}

function formatDayHeading(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })
}

function formatTime(isoString) {
  if (!isoString) return '—'
  const d = new Date(isoString)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
}

function sourceBadge(source) {
  switch (source) {
    case 'usda':           return <span className={`${styles.badge} ${styles.badgeUsda}`}>USDA</span>
    case 'open_food_facts': return <span className={`${styles.badge} ${styles.badgeOff}`}>OFF</span>
    case 'llm_estimate':   return <span className={`${styles.badge} ${styles.badgeAi}`}>~estimated</span>
    case 'manual':         return <span className={`${styles.badge} ${styles.badgeManual}`}>Manual</span>
    case 'not_found':      return <span className={`${styles.badge} ${styles.badgeNotFound}`}>Not found</span>
    default:               return <span className={styles.badge}>{source}</span>
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

function emptyManualForm() {
  return { name: '', quantity_g: '', calories: '', protein_g: '', fat_g: '', fiber_g: '' }
}

function nowTime() {
  const d = new Date()
  return { hour: d.getHours(), minute: d.getMinutes() }
}

function pad2(n) {
  return String(n).padStart(2, '0')
}

function TimeScrollCol({ value, max, onChange }) {
  const prev = (value - 1 + max + 1) % (max + 1)
  const next = (value + 1) % (max + 1)
  return (
    <div className={styles.timeScrollCol}>
      <button type="button" className={styles.timeScrollItem} onClick={() => onChange(prev)}>
        {pad2(prev)}
      </button>
      <div className={styles.timeScrollItemActive}>{pad2(value)}</div>
      <button type="button" className={styles.timeScrollItem} onClick={() => onChange(next)}>
        {pad2(next)}
      </button>
    </div>
  )
}

function calPillClass(calories) {
  if (calories >= 700) return styles.mealCalRed
  if (calories >= 400) return styles.mealCalAmber
  return styles.mealCalGreen
}

function progressColor(pct) {
  if (pct > 100) return 'red'
  if (pct >= 85) return 'amber'
  return 'green'
}

export default function DashboardPage() {
  const { profileId: profileIdStr } = useParams()
  const profileId = Number(profileIdStr)
  const today = todayStr()

  const [profile, setProfile] = useState(null)
  const [summary, setSummary] = useState(null)
  const [meals, setMeals] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // ── LLM mode state ──
  const [mealInput, setMealInput] = useState('')
  const [parsing, setParsing] = useState(false)
  const [parseError, setParseError] = useState('')
  const [parsedItems, setParsedItems] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saveSuccess, setSaveSuccess] = useState(false)

  // ── Manual mode state ──
  const [manualForm, setManualForm] = useState(emptyManualForm())
  const [manualItems, setManualItems] = useState([])
  const [manualSaving, setManualSaving] = useState(false)
  const [manualSaveError, setManualSaveError] = useState('')
  const [manualSaveSuccess, setManualSaveSuccess] = useState(false)

  // ── Shared ──
  const [entryMode, setEntryMode] = useState('llm') // 'llm' | 'manual'
  const [mealTime, setMealTime] = useState(nowTime)

  const [showProfileForm, setShowProfileForm] = useState(false)
  const [profileForm, setProfileForm] = useState(null)
  const [profileFormError, setProfileFormError] = useState('')
  const [profileSaving, setProfileSaving] = useState(false)

  const [mealDeleteErrors, setMealDeleteErrors] = useState({})

  // ── Weekly history state ──
  const [weekOffset, setWeekOffset] = useState(0)
  const [weekMeals, setWeekMeals] = useState([])
  const [weekLoading, setWeekLoading] = useState(false)
  const [weekDeleteErrors, setWeekDeleteErrors] = useState({})

  const chatThreadRef = useRef(null)

  useEffect(() => {
    if (chatThreadRef.current) {
      chatThreadRef.current.scrollTop = chatThreadRef.current.scrollHeight
    }
  }, [parsedItems, parsing, saveSuccess])

  useEffect(() => {
    if (parsedItems) {
      setMealTime(nowTime())
    }
  }, [parsedItems !== null])

  const refreshSummary = useCallback(() => {
    return getSummary(profileId, today).then(setSummary).catch(() => {})
  }, [profileId, today])

  const refreshWeekMeals = useCallback(() => {
    const { start, end } = getISOWeekBounds(weekOffset)
    return getMealsRange(profileId, start, end).then(setWeekMeals).catch(() => {})
  }, [profileId, weekOffset])

  useEffect(() => {
    setWeekLoading(true)
    refreshWeekMeals().finally(() => setWeekLoading(false))
  }, [refreshWeekMeals])

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

  function switchMode(mode) {
    setEntryMode(mode)
    setMealInput('')
    setParsedItems(null)
    setParseError('')
    setSaveError('')
    setSaveSuccess(false)
    setManualItems([])
    setManualForm(emptyManualForm())
    setManualSaveError('')
    setManualSaveSuccess(false)
    setMealTime(nowTime())
  }

  async function handleParse(e) {
    e.preventDefault()
    if (!mealInput.trim()) return
    setParsing(true)
    setParseError('')
    setParsedItems(null)
    setSaveError('')
    setSaveSuccess(false)
    try {
      const result = await parseMeal(profileId, mealInput.trim())
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

  function handleNotFoundField(itemIndex, field, value) {
    setParsedItems(prev =>
      prev.map((item, i) => i === itemIndex ? { ...item, [field]: value } : item)
    )
  }

  async function handleConfirm() {
    if (!parsedItems) return
    setSaving(true)
    setSaveError('')
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
    const loggedAt = `${today}T${pad2(mealTime.hour)}:${pad2(mealTime.minute)}:00`
    try {
      await confirmMeal({
        profile_id: profileId,
        description: mealInput.trim(),
        items_json: JSON.stringify(resolvedItems),
        calories: totals.calories,
        protein_g: totals.protein_g,
        fat_g: totals.fat_g,
        fiber_g: totals.fiber_g,
        logged_at: loggedAt,
      })
      setSaveSuccess(true)
      const [updatedSummary, updatedMeals] = await Promise.all([
        getSummary(profileId, today),
        getMeals(profileId, today),
      ])
      setSummary(updatedSummary)
      setMeals(updatedMeals)
      refreshWeekMeals()
      setTimeout(() => {
        setMealInput('')
        setParsedItems(null)
        setSaveSuccess(false)
      }, 1200)
    } catch (err) {
      setSaveError(err.message)
    } finally {
      setSaving(false)
    }
  }

  function handleManualField(e) {
    const { name, value } = e.target
    setManualForm(f => ({ ...f, [name]: value }))
  }

  function handleManualAddItem(e) {
    e.preventDefault()
    if (!manualForm.name.trim()) return
    setManualItems(prev => [...prev, {
      name: manualForm.name.trim(),
      quantity_g: Number(manualForm.quantity_g) || 100,
      calories: Number(manualForm.calories) || 0,
      protein_g: Number(manualForm.protein_g) || 0,
      fat_g: Number(manualForm.fat_g) || 0,
      fiber_g: Number(manualForm.fiber_g) || 0,
    }])
    setManualForm(emptyManualForm())
  }

  function handleManualRemoveItem(index) {
    setManualItems(prev => prev.filter((_, i) => i !== index))
  }

  async function handleManualLog() {
    if (manualItems.length === 0) return
    setManualSaving(true)
    setManualSaveError('')
    const totals = computeTotals(manualItems)
    const description = manualItems.map(i => i.name).join(', ')
    const loggedAt = `${today}T${pad2(mealTime.hour)}:${pad2(mealTime.minute)}:00`
    try {
      await confirmMeal({
        profile_id: profileId,
        description,
        items_json: JSON.stringify(manualItems.map(i => ({ ...i, source: 'manual' }))),
        calories: totals.calories,
        protein_g: totals.protein_g,
        fat_g: totals.fat_g,
        fiber_g: totals.fiber_g,
        logged_at: loggedAt,
      })
      setManualSaveSuccess(true)
      const [updatedSummary, updatedMeals] = await Promise.all([
        getSummary(profileId, today),
        getMeals(profileId, today),
      ])
      setSummary(updatedSummary)
      setMeals(updatedMeals)
      refreshWeekMeals()
      setTimeout(() => {
        setManualItems([])
        setManualSaveSuccess(false)
      }, 1200)
    } catch (err) {
      setManualSaveError(err.message)
    } finally {
      setManualSaving(false)
    }
  }

  async function handleDeleteMeal(mealId) {
    setMealDeleteErrors(prev => ({ ...prev, [mealId]: null }))
    try {
      await deleteMeal(mealId)
      setMeals(prev => prev.filter(m => m.id !== mealId))
      setWeekMeals(prev => prev.filter(m => m.id !== mealId))
      await refreshSummary()
    } catch (err) {
      setMealDeleteErrors(prev => ({ ...prev, [mealId]: err.message }))
    }
  }

  async function handleWeekDeleteMeal(mealId) {
    setWeekDeleteErrors(prev => ({ ...prev, [mealId]: null }))
    try {
      await deleteMeal(mealId)
      setWeekMeals(prev => prev.filter(m => m.id !== mealId))
      setMeals(prev => prev.filter(m => m.id !== mealId))
      await refreshSummary()
    } catch (err) {
      setWeekDeleteErrors(prev => ({ ...prev, [mealId]: err.message }))
    }
  }

  function handleProfileField(e) {
    const { name, value } = e.target
    setProfileForm(f => ({ ...f, [name]: value }))
  }

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

  if (loading) return <Layout><p style={{ padding: '1rem', color: 'var(--color-text-muted)' }}>Loading...</p></Layout>
  if (error) return <Layout><p className={styles.errorMsg} style={{ padding: '1rem' }}>{error}</p></Layout>

  const dateTotals = summary?.date_totals ?? {}
  const weekTotals = summary?.week_totals ?? {}
  const liveTotals = parsedItems ? computeTotals(parsedItems) : null
  const manualTotals = manualItems.length > 0 ? computeTotals(manualItems) : null

  const consumed = dateTotals.calories ?? 0
  const goal = profile.recommended_daily_calories
  const pct = goal ? Math.min(Math.round((consumed / goal) * 100), 100) : 0
  const pctColor = goal ? progressColor((consumed / goal) * 100) : 'green'

  const sortedMeals = [...meals].sort((a, b) => new Date(a.logged_at) - new Date(b.logged_at))
  const mealTotal = meals.reduce((sum, m) => sum + (m.calories ?? 0), 0)

  return (
    <Layout>
      <div className={styles.page}>

        {/* ── Profile heading ── */}
        <Link to="/" className={styles.backLink}>← All Profiles</Link>

        <div className={styles.sectionHeader} style={{ marginTop: '0.5rem' }}>
          <h1 className={styles.pageTitle}>{profile.name}'s Dashboard</h1>
          <button
            className={styles.btnEditProfile}
            onClick={() => { setShowProfileForm(s => !s); setProfileFormError('') }}
          >
            ⚙ {showProfileForm ? 'Close' : 'Edit Profile'}
          </button>
        </div>

        {/* ── Stat cards ── */}
        <div className={styles.statsGrid}>
          <div className={`${styles.statCard} ${styles.statCardGreen}`}>
            <div className={styles.statLabel}>Current Weight</div>
            <div className={styles.statValue}>{profile.current_weight_kg ?? '—'}</div>
            <div className={styles.statUnit}>kg</div>
          </div>
          <div className={`${styles.statCard} ${styles.statCardCyan}`}>
            <div className={styles.statLabel}>Target Weight</div>
            <div className={styles.statValue}>{profile.target_weight_kg ?? '—'}</div>
            <div className={styles.statUnit}>kg</div>
          </div>

          {/* Daily progress card */}
          <div className={`${styles.statCard} ${styles.statCardPurple}`}>
            {goal != null ? (
              <>
                <div className={styles.statLabel}>Today's Calories</div>
                <div className={`${styles.statValue} ${pctColor === 'amber' ? styles.statValueAmber : pctColor === 'red' ? styles.statValueRed : ''}`}>
                  {Math.round(consumed)}
                </div>
                <div className={styles.statUnit}>/ {Math.round(goal)} kcal goal</div>
                <div className={styles.progressBar}>
                  <div
                    className={`${styles.progressBarFill} ${pctColor === 'amber' ? styles.progressBarAmber : pctColor === 'red' ? styles.progressBarRed : ''}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </>
            ) : (
              <>
                <div className={styles.statLabel}>Daily Goal</div>
                <div style={{ marginTop: '0.5rem' }}>
                  <button className={styles.btnLink} onClick={() => setShowProfileForm(true)}>
                    Set up profile to see goal
                  </button>
                </div>
              </>
            )}
          </div>

          <div className={`${styles.statCard} ${styles.statCardAmber}`}>
            <div className={styles.statLabel}>Weeks to Target</div>
            <div className={styles.statValue}>
              {profile.weeks_to_target != null ? Math.ceil(profile.weeks_to_target) : '—'}
            </div>
            {profile.weekly_rate_kg != null ? (
              <div className={styles.statUnit}>at {profile.weekly_rate_kg} kg/week</div>
            ) : (
              <div className={styles.statUnit}>weeks</div>
            )}
          </div>
        </div>

        {/* ── Profile edit form ── */}
        {showProfileForm && profileForm && (
          <div className={styles.formSection}>
            <h2 className={styles.formTitle}>Edit Profile</h2>
            <form onSubmit={handleProfileSave} noValidate>
              <div className={styles.formGroup}>
                <label className={styles.label} htmlFor="pf-name">Name *</label>
                <input className={styles.input} id="pf-name" name="name" type="text" value={profileForm.name} onChange={handleProfileField} />
              </div>
              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label className={styles.label} htmlFor="pf-age">Age</label>
                  <input className={styles.input} id="pf-age" name="age" type="number" min="1" max="120" value={profileForm.age} onChange={handleProfileField} />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Gender</label>
                  <div className={styles.radioGroup}>
                    <label className={styles.radioLabel}>
                      <input type="radio" name="gender" value="male" checked={profileForm.gender === 'male'} onChange={handleProfileField} />
                      Male
                    </label>
                    <label className={styles.radioLabel}>
                      <input type="radio" name="gender" value="female" checked={profileForm.gender === 'female'} onChange={handleProfileField} />
                      Female
                    </label>
                  </div>
                </div>
              </div>
              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label className={styles.label} htmlFor="pf-height">Height (cm)</label>
                  <input className={styles.input} id="pf-height" name="height_cm" type="number" min="50" max="300" value={profileForm.height_cm} onChange={handleProfileField} />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.label} htmlFor="pf-cw">Current Weight (kg)</label>
                  <input className={styles.input} id="pf-cw" name="current_weight_kg" type="number" min="1" step="0.1" value={profileForm.current_weight_kg} onChange={handleProfileField} />
                </div>
              </div>
              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label className={styles.label} htmlFor="pf-tw">Target Weight (kg)</label>
                  <input className={styles.input} id="pf-tw" name="target_weight_kg" type="number" min="1" step="0.1" value={profileForm.target_weight_kg} onChange={handleProfileField} />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.label} htmlFor="pf-activity">Activity Level</label>
                  <select className={styles.select} id="pf-activity" name="activity_level" value={profileForm.activity_level} onChange={handleProfileField}>
                    <option value="">— Select —</option>
                    {ACTIVITY_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label} htmlFor="pf-rate">Weekly Rate (kg/week)</label>
                <select className={styles.select} id="pf-rate" name="weekly_rate_kg" value={profileForm.weekly_rate_kg} onChange={handleProfileField}>
                  <option value="">— Select —</option>
                  {RATE_OPTIONS.map(r => <option key={r} value={r}>{r} kg/week</option>)}
                </select>
              </div>
              {profileFormError && <p className={styles.errorMsg}>{profileFormError}</p>}
              <div className={styles.btnRow}>
                <button type="submit" className={styles.btnPrimary} disabled={profileSaving}>
                  {profileSaving ? 'Saving…' : 'Save'}
                </button>
                <button
                  type="button"
                  className={styles.btnSecondary}
                  onClick={() => { setShowProfileForm(false); setProfileForm(profileToForm(profile)); setProfileFormError('') }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ── Log a Meal ── */}
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Log a Meal</h2>
          <div className={styles.modeTabs}>
            <button
              type="button"
              className={`${styles.modeTab} ${entryMode === 'llm' ? styles.modeTabActive : ''}`}
              onClick={() => switchMode('llm')}
            >
              Analyze
            </button>
            <button
              type="button"
              className={`${styles.modeTab} ${entryMode === 'manual' ? styles.modeTabActive : ''}`}
              onClick={() => switchMode('manual')}
            >
              Enter manually
            </button>
          </div>
        </div>

        {entryMode === 'llm' ? (
          /* ── LLM analyze mode ── */
          <div className={styles.chatContainer}>
            {!parsing && !parsedItems && !parseError && !saveSuccess ? (
              <div className={styles.chatEmptyState}>
                <div className={styles.chatEmptyAvatar}>N</div>
                <h3 className={styles.chatEmptyTitle}>
                  What did you eat{profile?.name ? `, ${profile.name}` : ''}?
                </h3>
                <p className={styles.chatEmptySubtitle}>
                  Describe your meal in plain language and I'll calculate the nutrition for you.
                </p>
                <div className={styles.chatSuggestions}>
                  {[
                    'Oatmeal with banana',
                    'Grilled chicken salad',
                    'Pasta with tomato sauce',
                    'Greek yogurt with honey',
                  ].map(s => (
                    <button
                      key={s}
                      className={styles.chipBtn}
                      type="button"
                      onClick={() => setMealInput(s)}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className={styles.chatThread} ref={chatThreadRef}>

                {(parsing || parsedItems || saveSuccess) && (
                  <div className={`${styles.chatBubble} ${styles.chatBubbleUser}`}>
                    <div className={`${styles.chatBody} ${styles.chatBodyUser}`}>{mealInput}</div>
                  </div>
                )}

                {parsing && (
                  <div className={`${styles.chatBubble} ${styles.chatBubbleAppear}`}>
                    <div className={styles.chatAvatar}>N</div>
                    <div className={`${styles.chatBody} ${styles.chatBodyMuted} ${styles.analyzingText}`}>
                      Analyzing your meal
                    </div>
                  </div>
                )}

                {parsedItems && !saveSuccess && (
                  <div className={`${styles.chatBubble} ${styles.chatBubbleWide} ${styles.chatBubbleAppear}`}>
                    <div className={styles.chatAvatar}>N</div>
                    <div className={`${styles.chatBody} ${styles.chatBodyWide}`}>
                      <p className={styles.chatResponseIntro}>Here's the nutritional breakdown:</p>
                      <table className={styles.table}>
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
                            <tr key={i} className={item.source === 'not_found' ? styles.rowNotFound : ''}>
                              <td>{item.name}</td>
                              <td>{item.quantity_g != null ? `${item.quantity_g}g` : '—'}</td>
                              {item.source === 'not_found' ? (
                                <>
                                  <td><input type="number" className={styles.inputSm} min="0" placeholder="0" value={item._calories} onChange={e => handleNotFoundField(i, '_calories', e.target.value)} /></td>
                                  <td><input type="number" className={styles.inputSm} min="0" placeholder="0" value={item._protein_g} onChange={e => handleNotFoundField(i, '_protein_g', e.target.value)} /></td>
                                  <td><input type="number" className={styles.inputSm} min="0" placeholder="0" value={item._fat_g} onChange={e => handleNotFoundField(i, '_fat_g', e.target.value)} /></td>
                                  <td><input type="number" className={styles.inputSm} min="0" placeholder="0" value={item._fiber_g} onChange={e => handleNotFoundField(i, '_fiber_g', e.target.value)} /></td>
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
                          <tr className={styles.totalsRow}>
                            <td colSpan={2}><strong>Total</strong></td>
                            <td><strong>{Math.round(liveTotals.calories)}</strong></td>
                            <td><strong>{liveTotals.protein_g.toFixed(1)}</strong></td>
                            <td><strong>{liveTotals.fat_g.toFixed(1)}</strong></td>
                            <td><strong>{liveTotals.fiber_g.toFixed(1)}</strong></td>
                            <td></td>
                          </tr>
                        </tbody>
                      </table>

                      {/* Time picker */}
                      <div className={styles.timePicker}>
                        <span className={styles.timePickerLabel}>Logged at</span>
                        <TimeScrollCol
                          value={mealTime.hour}
                          max={23}
                          onChange={h => setMealTime(t => ({ ...t, hour: h }))}
                        />
                        <span className={styles.timePickerSep}>:</span>
                        <TimeScrollCol
                          value={mealTime.minute}
                          max={59}
                          onChange={m => setMealTime(t => ({ ...t, minute: m }))}
                        />
                      </div>

                      {saveError && <p className={styles.errorMsg} style={{ marginTop: '0.5rem' }}>{saveError}</p>}
                      <div className={styles.btnRow}>
                        <button className={styles.btnPrimary} onClick={handleConfirm} disabled={saving}>
                          {saving ? 'Saving…' : 'Save Meal'}
                        </button>
                        <button className={styles.btnSecondary} onClick={() => { setParsedItems(null); setSaveError(''); setMealInput('') }}>
                          Discard
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {saveSuccess && (
                  <div className={`${styles.chatBubble} ${styles.chatBubbleAppear} ${styles.successBubble}`}>
                    <div className={styles.chatAvatar}>✓</div>
                    <div className={`${styles.chatBody} ${styles.chatBodySuccess}`}>Logged!</div>
                  </div>
                )}

                {parseError && (
                  <div className={`${styles.chatBubble} ${styles.chatBubbleAppear}`}>
                    <div className={`${styles.chatAvatar} ${styles.chatAvatarError}`}>!</div>
                    <div className={`${styles.chatBody} ${styles.chatBodyError}`}>{parseError}</div>
                  </div>
                )}
              </div>
            )}

            <form className={styles.chatInputBar} onSubmit={handleParse}>
              <input
                className={styles.chatInput}
                type="text"
                value={mealInput}
                onChange={e => { setMealInput(e.target.value); setParseError('') }}
                placeholder="Describe your meal…"
                disabled={parsing || saving || !!parsedItems || saveSuccess}
                autoComplete="off"
              />
              <button
                type="submit"
                className={styles.chatSendBtn}
                disabled={!mealInput.trim() || parsing || saving || !!parsedItems || saveSuccess}
              >
                ↑
              </button>
            </form>
          </div>
        ) : (
          /* ── Manual entry mode ── */
          <div className={styles.chatContainer}>
            <div className={styles.manualContent}>

              {/* Add item form */}
              <form onSubmit={handleManualAddItem} noValidate>
                <div className={styles.manualFormRow}>
                  <div className={styles.formGroup}>
                    <label className={styles.label} htmlFor="mf-name">Item name *</label>
                    <input
                      className={styles.input}
                      id="mf-name"
                      name="name"
                      type="text"
                      placeholder="e.g. Chicken breast"
                      value={manualForm.name}
                      onChange={handleManualField}
                      autoComplete="off"
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.label} htmlFor="mf-qty">Qty (g)</label>
                    <input
                      className={styles.input}
                      id="mf-qty"
                      name="quantity_g"
                      type="number"
                      min="0"
                      placeholder="100"
                      value={manualForm.quantity_g}
                      onChange={handleManualField}
                    />
                  </div>
                </div>
                <div className={styles.manualFormRowNutrients}>
                  <div className={styles.formGroup}>
                    <label className={styles.label} htmlFor="mf-cal">Calories</label>
                    <input className={styles.input} id="mf-cal" name="calories" type="number" min="0" placeholder="0" value={manualForm.calories} onChange={handleManualField} />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.label} htmlFor="mf-prot">Protein (g)</label>
                    <input className={styles.input} id="mf-prot" name="protein_g" type="number" min="0" step="0.1" placeholder="0" value={manualForm.protein_g} onChange={handleManualField} />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.label} htmlFor="mf-fat">Fat (g)</label>
                    <input className={styles.input} id="mf-fat" name="fat_g" type="number" min="0" step="0.1" placeholder="0" value={manualForm.fat_g} onChange={handleManualField} />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.label} htmlFor="mf-fiber">Fiber (g)</label>
                    <input className={styles.input} id="mf-fiber" name="fiber_g" type="number" min="0" step="0.1" placeholder="0" value={manualForm.fiber_g} onChange={handleManualField} />
                  </div>
                </div>
                <button
                  type="submit"
                  className={styles.btnAddItem}
                  disabled={!manualForm.name.trim()}
                >
                  + Add Item
                </button>
              </form>

              {/* Items list */}
              {manualItems.length > 0 && (
                <>
                  <div className={styles.manualItemsList}>
                    {manualItems.map((item, i) => (
                      <div key={i} className={styles.manualItem}>
                        <span className={styles.manualItemName}>{item.name}</span>
                        <span className={styles.manualItemQty}>{item.quantity_g}g</span>
                        <span className={styles.manualItemCal}>{item.calories} kcal</span>
                        <span className={styles.manualItemMacros}>
                          {item.protein_g.toFixed(1)}P · {item.fat_g.toFixed(1)}F · {item.fiber_g.toFixed(1)}Fi
                        </span>
                        <button
                          type="button"
                          className={styles.manualItemRemove}
                          onClick={() => handleManualRemoveItem(i)}
                          aria-label="Remove item"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Running totals */}
                  <div className={styles.manualTotals}>
                    <span className={styles.manualTotalsCal}>{Math.round(manualTotals.calories)} kcal</span>
                    <span>{manualTotals.protein_g.toFixed(1)}g protein</span>
                    <span>{manualTotals.fat_g.toFixed(1)}g fat</span>
                    <span>{manualTotals.fiber_g.toFixed(1)}g fiber</span>
                  </div>

                  {/* Time picker */}
                  <div className={styles.timePicker}>
                    <span className={styles.timePickerLabel}>Logged at</span>
                    <TimeScrollCol
                      value={mealTime.hour}
                      max={23}
                      onChange={h => setMealTime(t => ({ ...t, hour: h }))}
                    />
                    <span className={styles.timePickerSep}>:</span>
                    <TimeScrollCol
                      value={mealTime.minute}
                      max={59}
                      onChange={m => setMealTime(t => ({ ...t, minute: m }))}
                    />
                  </div>

                  {manualSaveError && <p className={styles.errorMsg}>{manualSaveError}</p>}

                  <div className={styles.btnRow}>
                    <button className={styles.btnPrimary} onClick={handleManualLog} disabled={manualSaving}>
                      {manualSaving ? 'Saving…' : 'Log Meal'}
                    </button>
                    <button
                      type="button"
                      className={styles.btnSecondary}
                      onClick={() => { setManualItems([]); setManualSaveError('') }}
                    >
                      Clear
                    </button>
                  </div>
                </>
              )}

              {manualSaveSuccess && (
                <div className={styles.manualSuccess}>Meal logged!</div>
              )}

              {manualItems.length === 0 && !manualSaveSuccess && (
                <p className={styles.manualHint}>
                  Add one or more food items above, then hit <strong>Log Meal</strong>.
                </p>
              )}
            </div>
          </div>
        )}

        {/* ── Today's Meals ── */}
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Today's Meals</h2>
        </div>

        <div className={styles.card}>
          {sortedMeals.length === 0 ? (
            <div className={styles.mealEmptyState}>
              <div className={styles.mealEmptyIcon}>🍽</div>
              <p className={styles.mealEmptyText}>No meals logged today</p>
              <p className={styles.mealEmptyHint}>Log your first meal above.</p>
            </div>
          ) : (
            <>
              <div className={styles.mealList}>
                {sortedMeals.map(meal => {
                  const kcal = meal.calories != null ? Math.round(meal.calories) : null
                  return (
                    <div key={meal.id} className={styles.mealRow}>
                      <span className={styles.mealTimeChip}>{formatTime(meal.logged_at)}</span>
                      <span className={styles.mealDesc}>{meal.description}</span>
                      {kcal != null && (
                        <span className={`${styles.mealCalPill} ${calPillClass(kcal)}`}>
                          {kcal} kcal
                        </span>
                      )}
                      <div className={styles.mealDeleteWrap}>
                        <button className={styles.btnDanger} onClick={() => handleDeleteMeal(meal.id)}>
                          Delete
                        </button>
                        {mealDeleteErrors[meal.id] && (
                          <p className={styles.errorMsg} style={{ margin: '2px 0 0', fontSize: '0.72rem' }}>
                            {mealDeleteErrors[meal.id]}
                          </p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className={styles.mealListFooter}>
                Total: {Math.round(mealTotal)} kcal today
              </div>
            </>
          )}
        </div>

        {/* ── This Week ── */}
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>This Week</h2>
          <div className={styles.weekNav}>
            <button className={styles.weekNavBtn} onClick={() => setWeekOffset(o => o - 1)}>←</button>
            <span className={styles.weekLabel}>
              {formatWeekLabel(getISOWeekBounds(weekOffset).start, getISOWeekBounds(weekOffset).end)}
            </span>
            <button className={styles.weekNavBtn} onClick={() => setWeekOffset(o => o + 1)} disabled={weekOffset >= 0}>→</button>
          </div>
        </div>

        <div className={styles.card}>
          {weekLoading ? (
            <p className={styles.infoMsg}>Loading…</p>
          ) : weekMeals.length === 0 ? (
            <div className={styles.mealEmptyState}>
              <div className={styles.mealEmptyIcon}>📅</div>
              <p className={styles.mealEmptyText}>No meals logged this week</p>
            </div>
          ) : (() => {
            const groups = groupByDay(weekMeals)
            const days = Object.keys(groups).sort()
            const weekTotal = weekMeals.reduce((sum, m) => sum + (m.calories ?? 0), 0)
            return (
              <>
                {days.map(day => (
                  <div key={day} className={styles.weekDayGroup}>
                    <div className={styles.weekDayHeading}>{formatDayHeading(day)}</div>
                    {groups[day].map(meal => {
                      const kcal = meal.calories != null ? Math.round(meal.calories) : null
                      return (
                        <div key={meal.id} className={styles.mealRow}>
                          <span className={styles.mealTimeChip}>{formatTime(meal.logged_at)}</span>
                          <span className={styles.mealDesc}>{meal.description}</span>
                          {kcal != null && (
                            <span className={`${styles.mealCalPill} ${calPillClass(kcal)}`}>{kcal} kcal</span>
                          )}
                          <div className={styles.mealDeleteWrap}>
                            <button className={styles.btnDanger} onClick={() => handleWeekDeleteMeal(meal.id)}>Delete</button>
                            {weekDeleteErrors[meal.id] && (
                              <p className={styles.errorMsg} style={{ margin: '2px 0 0', fontSize: '0.72rem' }}>{weekDeleteErrors[meal.id]}</p>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ))}
                <div className={styles.mealListFooter}>
                  Week total: {Math.round(weekTotal)} kcal
                </div>
              </>
            )
          })()}
        </div>

        {/* ── Nutrition Totals ── */}
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Nutrition Totals</h2>
        </div>

        <div className={styles.card} style={{ overflowX: 'auto' }}>
          <table className={styles.table}>
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

      </div>
    </Layout>
  )
}
