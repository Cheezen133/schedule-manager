import apiClient from './client'

/**
 * 获取通知列表
 */
export async function getNotifications(params = {}) {
  const res = await apiClient.get('/notifications', { params })
  return res.data
}

/**
 * 获取未读通知数量
 */
export async function getUnreadCount() {
  const res = await apiClient.get('/notifications/unread-count')
  return res.data
}

/**
 * 标记单条已读
 */
export async function markNotificationRead(id) {
  const res = await apiClient.put(`/notifications/${id}/read`)
  return res.data
}

/**
 * 全部标记已读
 */
export async function markAllNotificationsRead() {
  const res = await apiClient.put('/notifications/read-all')
  return res.data
}

/**
 * 删除一条通知
 */
export async function deleteNotification(id) {
  const res = await apiClient.delete(`/notifications/${id}`)
  return res.data
}
