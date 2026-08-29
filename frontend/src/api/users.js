import apiClient from './client'

/**
 * 获取用户列表（管理员）
 */
export async function getUsers(params = {}) {
  const res = await apiClient.get('/users', { params })
  return res.data
}

/**
 * 修改用户角色（管理员）
 */
export async function updateUserRole(userId, role) {
  const res = await apiClient.put(`/users/${userId}/role`, { role })
  return res.data
}

/**
 * 切换用户启用/禁用（管理员）
 */
export async function toggleUserActive(userId) {
  const res = await apiClient.put(`/users/${userId}/toggle-active`)
  return res.data
}

/**
 * 修改用户昵称（管理员）
 */
export async function updateUserNickname(userId, nickname) {
  const res = await apiClient.put(`/users/${userId}/nickname`, { nickname })
  return res.data
}

/**
 * 修改自己的昵称
 */
export async function updateMyNickname(nickname) {
  const res = await apiClient.post('/users/me/nickname', { nickname })
  return res.data
}

/**
 * 注销自己的账号
 */
export async function deleteMyAccount() {
  const res = await apiClient.delete('/users/me')
  return res.data
}
