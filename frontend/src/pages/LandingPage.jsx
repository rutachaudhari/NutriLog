import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import { getProfiles, createProfile, deleteProfile } from '../api/client'

const ACTIVITY_OPTIONS = [
  { label: 'Sedentary', value: 'sedentary' },
  { label: 'Lightly Active', value: 'lightly_active' },
  { label: 'Moderately Active', value: 'moderately_active' },
  { label: 'Very Active', value: 'very_active' },
]

const RATE_OPTIONS = ['0.25', '0.5', '0.75', '1.0']

const EMPTY_FORM = {
  name: '',
  age: '',
  gender: '',
  height_cm: '',
  current_weight_kg: '',
  target_weight_kg: '',
  activity_level: '',
  weekly_rate_kg: '',
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

  const [deleteErrors, setDeleteErrors] = useState({})

  useEffect(() => {
    getProfiles()
      .then(setProfiles)
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
    if (!form.name.trim()) {
      setNameError('Name is required.')
      return
    }
    setSubmitting(true)
    setSubmitError('')
    try {
      const newProfile = await createProfile(buildProfileBody(form))
      setProfiles(prev => [...prev, newProfile])
      setShowForm(false)
      setForm(EMPTY_FORM)
      navigate(`/dashboard/${newProfile.id}`)
    } catch (err) {
      setSubmitError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(profile) {
    if (!window.confirm(`Delete ${profile.name}? This will remove all their meal history.`)) return
    setDeleteErrors(prev => ({ ...prev, [profile.id]: null }))
    try {
      await deleteProfile(profile.id)
      setProfiles(prev => prev.filter(p => p.id !== profile.id))
    } catch (err) {
      setDeleteErrors(prev => ({ ...prev, [profile.id]: err.message }))
    }
  }

  return (
    <Layout>
      <div className="section-header">
        <h1 style={{ margin: 0 }}>Profiles</h1>
        <button
          className="btn-primary"
          onClick={() => { setShowForm(s => !s); setSubmitError(''); setNameError('') }}
        >
          {showForm ? 'Cancel' : 'Add Profile'}
        </button>
      </div>

      {showForm && (
        <div className="form-section">
          <h2 style={{ marginTop: 0 }}>New Profile</h2>
          <form onSubmit={handleCreate} noValidate>
            <div className="form-group">
              <label htmlFor="name">Name *</label>
              <input
                id="name"
                name="name"
                type="text"
                value={form.name}
                onChange={handleField}
                autoFocus
              />
              {nameError && <span className="error-msg">{nameError}</span>}
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="age">Age</label>
                <input id="age" name="age" type="number" min="1" max="120" value={form.age} onChange={handleField} />
              </div>
              <div className="form-group">
                <label>Gender</label>
                <div className="radio-group">
                  <label>
                    <input type="radio" name="gender" value="male" checked={form.gender === 'male'} onChange={handleField} />
                    Male
                  </label>
                  <label>
                    <input type="radio" name="gender" value="female" checked={form.gender === 'female'} onChange={handleField} />
                    Female
                  </label>
                </div>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="height_cm">Height (cm)</label>
                <input id="height_cm" name="height_cm" type="number" min="50" max="300" value={form.height_cm} onChange={handleField} />
              </div>
              <div className="form-group">
                <label htmlFor="current_weight_kg">Current Weight (kg)</label>
                <input id="current_weight_kg" name="current_weight_kg" type="number" min="1" step="0.1" value={form.current_weight_kg} onChange={handleField} />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="target_weight_kg">Target Weight (kg)</label>
                <input id="target_weight_kg" name="target_weight_kg" type="number" min="1" step="0.1" value={form.target_weight_kg} onChange={handleField} />
              </div>
              <div className="form-group">
                <label htmlFor="activity_level">Activity Level</label>
                <select id="activity_level" name="activity_level" value={form.activity_level} onChange={handleField}>
                  <option value="">— Select —</option>
                  {ACTIVITY_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="weekly_rate_kg">Weekly Rate (kg/week)</label>
              <select id="weekly_rate_kg" name="weekly_rate_kg" value={form.weekly_rate_kg} onChange={handleField}>
                <option value="">— Select —</option>
                {RATE_OPTIONS.map(r => <option key={r} value={r}>{r} kg/week</option>)}
              </select>
            </div>

            {submitError && <p className="error-msg">{submitError}</p>}

            <div className="btn-row">
              <button type="submit" className="btn-primary" disabled={submitting}>
                {submitting ? 'Creating…' : 'Create Profile'}
              </button>
              <button type="button" className="btn-secondary" onClick={() => { setShowForm(false); setForm(EMPTY_FORM); setNameError(''); setSubmitError('') }}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {loading && <p>Loading...</p>}
      {error && <p className="error-msg">{error}</p>}

      {!loading && !error && profiles.length === 0 && !showForm && (
        <p className="info-msg">No profiles yet — create your first one</p>
      )}

      {!loading && !error && profiles.length > 0 && (
        <div className="card-grid">
          {profiles.map(profile => (
            <div key={profile.id} className="profile-card">
              <span className="profile-card-name" onClick={() => navigate(`/dashboard/${profile.id}`)}>
                {profile.name}
              </span>
              <div>
                <button
                  className="btn-danger"
                  onClick={() => handleDelete(profile)}
                >
                  Delete
                </button>
                {deleteErrors[profile.id] && (
                  <p className="error-msg" style={{ margin: '4px 0 0' }}>{deleteErrors[profile.id]}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Layout>
  )
}
