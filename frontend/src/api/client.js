import axios from 'axios'

const TOKEN_KEY = 'access_token'
const USER_KEY = 'user'

// 自动登录优先使用 localStorage；普通登录仅在当前浏览器会话中有效。
let _persistent = Boolean(localStorage.getItem(TOKEN_KEY))
let _token = localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY)

function clearStoredAuth() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
  sessionStorage.removeItem(TOKEN_KEY)
  sessionStorage.removeItem(USER_KEY)
}

export function setToken(token, persistent = false) {
  clearStoredAuth()
  _token = token
  _persistent = Boolean(token && persistent)
  if (token) {
    const storage = _persistent ? localStorage : sessionStorage
    storage.setItem(TOKEN_KEY, token)
  }
}

export function getToken() {
  return _token
}

export function getStoredUser() {
  const storage = _persistent ? localStorage : sessionStorage
  return storage.getItem(USER_KEY)
}

export function setStoredUser(user) {
  const storage = _persistent ? localStorage : sessionStorage
  if (user) {
    storage.setItem(USER_KEY, JSON.stringify(user))
  } else {
    storage.removeItem(USER_KEY)
  }
}

const apiClient = axios.create({
  baseURL: '/api/v1',
  timeout: 15000,
})

// 请求拦截器：自动附加 JWT Token
apiClient.interceptors.request.use(
  (config) => {
    if (_token) {
      config.headers.Authorization = `Bearer ${_token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// 响应拦截器：处理错误
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    // 401 → 跳转登录
    if (error.response?.status === 401) {
      setToken(null)
      if (window.location.pathname !== '/login') {
        window.location.href = '/login'
      }
    }
    // 规范化错误消息，防止 [object Object]
    const detail = error.response?.data?.detail
    if (typeof detail === 'string') {
      error.userMessage = detail
    } else if (Array.isArray(detail)) {
      error.userMessage = detail.map(d => d.msg || '').filter(Boolean).join('; ') || '请求参数错误'
    } else {
      error.userMessage = '操作失败'
    }
    return Promise.reject(error)
  }
)

export default apiClient
