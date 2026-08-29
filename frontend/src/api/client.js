import axios from 'axios'

// 模块级 token，不受其他标签页 sessionStorage 覆盖影响
let _token = sessionStorage.getItem('access_token')

export function setToken(token) {
  _token = token
  if (token) {
    sessionStorage.setItem('access_token', token)
  } else {
    sessionStorage.removeItem('access_token')
    sessionStorage.removeItem('user')
  }
}

export function getToken() {
  return _token
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
      _token = null
      sessionStorage.removeItem('access_token')
      sessionStorage.removeItem('user')
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
