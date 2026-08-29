import apiClient from './client'

/**
 * 用户注册
 */
export async function register(username, password, nickname, phone) {
  const res = await apiClient.post('/auth/register', { username, password, nickname, phone })
  return res.data
}

/**
 * 账号密码登录
 */
export async function login(username, password) {
  const res = await apiClient.post('/auth/login', { username, password })
  return res.data
}

/**
 * 获取当前用户信息
 */
export async function getCurrentUser() {
  const res = await apiClient.get('/auth/me')
  return res.data
}
