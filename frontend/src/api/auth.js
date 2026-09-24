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

export async function verifyPasswordRecovery(username, nickname) {
  const res = await apiClient.post('/auth/password-recovery/verify', { username, nickname })
  return res.data
}

export async function resetRecoveredPassword(recoveryToken, newPassword) {
  const res = await apiClient.post('/auth/password-recovery/reset', {
    recovery_token: recoveryToken,
    new_password: newPassword,
  })
  return res.data
}

/**
 * 获取当前用户信息
 */
export async function getCurrentUser() {
  const res = await apiClient.get('/auth/me')
  return res.data
}
