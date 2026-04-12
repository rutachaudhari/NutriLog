const BASE_URL = 'http://localhost:8080'

function today() {
  return new Date().toISOString().slice(0, 10)
}

async function request(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
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
export const getMeals = (profileId, date = today()) => request(`/meals?profile_id=${profileId}&date=${date}`)
export const deleteMeal = (id) => request(`/meals/${id}`, { method: 'DELETE' })
export const getSummary = (profileId, date = today()) => request(`/summary?profile_id=${profileId}&date=${date}`)
