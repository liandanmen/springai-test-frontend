import axios from 'axios'

const TOKEN_KEY = 'authToken'
const USER_KEY = 'authUser'

export const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8081',
  timeout: 30000
})

http.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY)
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

http.interceptors.response.use((response) => {
  const rotatedToken = response.headers.authorization
  if (rotatedToken) localStorage.setItem(TOKEN_KEY, rotatedToken.replace(/^Bearer\s+/i, ''))
  return response
}, (error) => {
  if (error.response?.status === 401) {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    window.dispatchEvent(new CustomEvent('auth-expired'))
  }
  return Promise.reject(error)
})

export function unwrapResult(response) {
  const result = response.data
  if (result?.code !== 1) throw new Error(result?.msg || '请求失败')
  return result.data
}

export function saveAuth(user) {
  localStorage.setItem(TOKEN_KEY, user.token)
  localStorage.setItem(USER_KEY, JSON.stringify({ id: user.id, username: user.username }))
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

export function readAuthUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || 'null')
  } catch {
    return null
  }
}

export const userApi = {
  login: (credentials) => http.post('/login', credentials),
  register: (credentials) => http.post('/register', credentials)
}
