import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getProfiles, createProfile, deleteProfile, getSummary } from '../api/client'
import styles from './LandingPage.module.css'

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

const AVATAR_COLORS = ['#e11d48', '#7c3aed', '#0284c7', '#d97706', '#059669', '#db2777']

const ACTIVITY_OPTIONS = [
  { label: 'Sedentary', value: 'sedentary' },
  { label: 'Lightly Active', value: 'lightly_active' },
  { label: 'Moderately Active', value: 'moderately_active' },
  { label: 'Very Active', value: 'very_active' },
]
const RATE_OPTIONS = ['0.25', '0.5', '0.75', '1.0']
const EMPTY_FORM = {
  name: '', age: '', gender: '', height_cm: '',
  current_weight_kg: '', target_weight_kg: '', activity_level: '', weekly_rate_kg: '',
}

function buildProfileBody(form) {
  const body = { name: form.name }
  if (form.age !== '' && !isNaN(Number(form.age))) body.age = Number(form.age)
  if (form.gender !== '') body.gender = form.gender
  if (form.height_cm !== '' && !isNaN(Number(form.height_cm))) body.height_cm = Number(form.height_cm)
  if (form.current_weight_kg !== '' && !isNaN(Number(form.current_weight_kg))) body.current_weight_kg = Number(form.current_weight_kg)
  if (form.target_weight_kg !== '' && !isNaN(Number(form.target_weight_kg))) body.target_weight_kg = Number(form.target_weight_kg)
  if (form.activity_level !== '') body.activity_level = form.activity_level
  if (form.weekly_rate_kg !== '' && !isNaN(Number(form.weekly_rate_kg))) body.weekly_rate_kg = Number(form.weekly_rate_kg)
  return body
}

export default function LandingPage() {
  const navigate = useNavigate()
  const [profiles, setProfiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [nameError, setNameError] = useState('')
  const [submitError, setSubmitError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [selectingId, setSelectingId] = useState(null)
  const [profileSummaries, setProfileSummaries] = useState({})

  useEffect(() => {
    getProfiles()
      .then(profileList => {
        setProfiles(profileList)
        const today = todayStr()
        Promise.allSettled(
          profileList.map(p => getSummary(p.id, today))
        ).then(results => {
          const summaries = {}
          profileList.forEach((p, i) => {
            if (results[i].status === 'fulfilled') {
              summaries[p.id] = results[i].value
            }
          })
          setProfileSummaries(summaries)
        })
      })
      .catch(() => setError('Could not load profiles — is the backend running?'))
      .finally(() => setLoading(false))
  }, [])

  function handleField(e) {
    const { name, value } = e.target
    setForm(f => ({ ...f, [name]: value }))
    if (name === 'name') setNameError('')
  }

  async function handleCreate(e) {
    e.preventDefault()
    if (!form.name.trim()) { setNameError('Name is required.'); return }
    setSubmitting(true)
    setSubmitError('')
    try {
      const newProfile = await createProfile(buildProfileBody(form))
      setProfiles(prev => [...prev, newProfile])
      setShowForm(false)
      setForm(EMPTY_FORM)
      handleSelect(newProfile)
    } catch (err) {
      setSubmitError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(e, profile) {
    e.stopPropagation()
    if (!window.confirm(`Delete ${profile.name}? This will permanently remove all their meal history. This cannot be undone.`)) return
    try {
      await deleteProfile(profile.id)
      setProfiles(prev => prev.filter(p => p.id !== profile.id))
    } catch (err) {
      alert(err.message)
    }
  }

  function handleSelect(profile) {
    setSelectingId(profile.id)
    setTimeout(() => navigate(`/dashboard/${profile.id}`), 320)
  }

  if (loading) return (
    <div className={styles.page}>
      <p className={styles.infoMsg}>Loading...</p>
    </div>
  )

  if (error) return (
    <div className={styles.page}>
      <p className={styles.errorMsg}>{error}</p>
    </div>
  )

  return (
    <div className={styles.page}>
      <div className={styles.brand}>
        <h1 className={styles.brandName}>NutriLog</h1>
        <p className={styles.brandSub}>AI-powered nutrition tracking</p>
      </div>

      {!showForm ? (
        <>
          {profiles.length === 0 ? (
            <p className={styles.emptyState}>Welcome to NutriLog. Create your first profile to get started.</p>
          ) : (
            <h2 className={styles.heading}>Who's tracking?</h2>
          )}
          <div className={styles.grid}>
            {profiles.map((profile, i) => (
              <div
                key={profile.id}
                className={`${styles.avatarCard}${selectingId === profile.id ? ' ' + styles.selecting : ''}`}
                onClick={() => handleSelect(profile)}
              >
                <div
                  className={styles.avatarCircle}
                  style={{ background: AVATAR_COLORS[i % AVATAR_COLORS.length] }}
                >
                  {profile.name.charAt(0).toUpperCase()}
                </div>
                <span className={styles.avatarName}>{profile.name}</span>
                {profileSummaries[profile.id] != null && (
                  <span className={styles.cardCalories}>
                    {Math.round(profileSummaries[profile.id]?.date_totals?.calories ?? 0)} kcal today
                  </span>
                )}
                <div className={styles.cardActions}>
                  <button
                    className={styles.deleteBtn}
                    onClick={(e) => handleDelete(e, profile)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
            <button className={styles.addCard} onClick={() => setShowForm(true)}>
              <div className={styles.addCircle}>+</div>
              <span className={styles.addLabel}>Add Profile</span>
            </button>
          </div>
        </>
      ) : (
        <div className={styles.formPanel}>
          <h2 className={styles.formTitle}>New Profile</h2>
          <form onSubmit={handleCreate} noValidate>
            <div className={styles.formGroup}>
              <label className={styles.label} htmlFor="name">Name *</label>
              <input
                className={styles.input}
                id="name" name="name" type="text"
                value={form.name} onChange={handleField} autoFocus
              />
              {nameError && <span className={styles.errorMsg}>{nameError}</span>}
            </div>
            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label className={styles.label} htmlFor="age">Age</label>
                <input className={styles.input} id="age" name="age" type="number" min="1" max="120" value={form.age} onChange={handleField} />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>Gender</label>
                <div className={styles.radioGroup}>
                  <label className={styles.radioLabel}>
                    <input type="radio" name="gender" value="male" checked={form.gender === 'male'} onChange={handleField} /> Male
                  </label>
                  <label className={styles.radioLabel}>
                    <input type="radio" name="gender" value="female" checked={form.gender === 'female'} onChange={handleField} /> Female
                  </label>
                </div>
              </div>
            </div>
            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label className={styles.label} htmlFor="height_cm">Height (cm)</label>
                <input className={styles.input} id="height_cm" name="height_cm" type="number" min="50" max="300" value={form.height_cm} onChange={handleField} />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label} htmlFor="current_weight_kg">Current Weight (kg)</label>
                <input className={styles.input} id="current_weight_kg" name="current_weight_kg" type="number" min="1" step="0.1" value={form.current_weight_kg} onChange={handleField} />
              </div>
            </div>
            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label className={styles.label} htmlFor="target_weight_kg">Target Weight (kg)</label>
                <input className={styles.input} id="target_weight_kg" name="target_weight_kg" type="number" min="1" step="0.1" value={form.target_weight_kg} onChange={handleField} />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label} htmlFor="activity_level">Activity Level</label>
                <select className={styles.select} id="activity_level" name="activity_level" value={form.activity_level} onChange={handleField}>
                  <option value="">— Select —</option>
                  {ACTIVITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label} htmlFor="weekly_rate_kg">Weekly Rate (kg/week)</label>
              <select className={styles.select} id="weekly_rate_kg" name="weekly_rate_kg" value={form.weekly_rate_kg} onChange={handleField}>
                <option value="">— Select —</option>
                {RATE_OPTIONS.map(r => <option key={r} value={r}>{r} kg/week</option>)}
              </select>
            </div>
            {submitError && <p className={styles.errorMsg}>{submitError}</p>}
            <div className={styles.btnRow}>
              <button type="submit" className={styles.btnPrimary} disabled={submitting}>
                {submitting ? 'Creating…' : 'Create Profile'}
              </button>
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() => { setShowForm(false); setForm(EMPTY_FORM); setNameError(''); setSubmitError('') }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
