const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8080'

function today() {
  return new Date().toISOString().slice(0, 10)
}

async function request(path, options = {}) {
  let res
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    })
  } catch {
    throw new Error('Cannot reach the server. Is the backend running?')
  }
  if (!res.ok) {
    let msg = res.statusText
    try { const body = await res.json(); msg = body.error || msg } catch {}
    throw new Error(msg)
  }
  return res.json()
}

export const getProfiles = () => request('/profiles')
export const getProfile = (id) => request(`/profiles/${id}`)
export const createProfile = (data) => request('/profiles', { method: 'POST', body: JSON.stringify(data) })
export const updateProfile = (id, data) => request(`/profiles/${id}`, { method: 'PUT', body: JSON.stringify(data) })
export const deleteProfile = (id) => request(`/profiles/${id}`, { method: 'DELETE' })
export const parseMeal = (profileId, description) => request('/meals/parse', { method: 'POST', body: JSON.stringify({ profile_id: profileId, description }) })
export const confirmMeal = (data) => request('/meals', { method: 'POST', body: JSON.stringify(data) })
export const getMeals = (profileId, date = today()) => request(`/meals?${new URLSearchParams({ profile_id: profileId, date })}`)
export const deleteMeal = (id) => request(`/meals/${id}`, { method: 'DELETE' })
export const getSummary = (profileId, date = today()) => request(`/summary?${new URLSearchParams({ profile_id: profileId, date })}`)
