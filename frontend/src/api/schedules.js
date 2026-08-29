import apiClient from './client'

/**
 * 获取日程列表
 */
export async function getSchedules(params = {}) {
  const res = await apiClient.get('/schedules', { params })
  return res.data
}

/**
 * 创建日程
 * @param {object} data - 日程数据
 * @param {number|null} forUser - 替谁创建（日程码管理）
 */
export async function createSchedule(data, forUser = null) {
  const params = {}
  if (forUser) params.for_user = forUser
  const res = await apiClient.post('/schedules', data, { params })
  return res.data
}

/**
 * 获取日程详情
 */
export async function getScheduleDetail(id) {
  const res = await apiClient.get(`/schedules/${id}`)
  return res.data
}

/**
 * 编辑日程
 */
export async function updateSchedule(id, data) {
  const res = await apiClient.put(`/schedules/${id}`, data)
  return res.data
}

/**
 * 删除日程
 */
export async function deleteSchedule(id) {
  const res = await apiClient.delete(`/schedules/${id}`)
  return res.data
}

/**
 * 获取待审核列表
 */
export async function getPendingSchedules() {
  const res = await apiClient.get('/review/pending')
  return res.data
}

/**
 * 批准日程
 */
export async function approveSchedule(id, comment = '') {
  const res = await apiClient.post(`/review/${id}/approve`, { comment })
  return res.data
}

/**
 * 驳回日程
 */
export async function rejectSchedule(id, comment = '') {
  const res = await apiClient.post(`/review/${id}/reject`, { comment })
  return res.data
}

/**
 * 导出 iCal
 */
export function getIcalExportUrl(startDate, endDate) {
  const params = new URLSearchParams()
  if (startDate) params.set('start_date', startDate)
  if (endDate) params.set('end_date', endDate)
  return `/api/v1/schedules/export/ical?${params.toString()}`
}

/**
 * 切换完成状态
 */
export async function toggleComplete(id) {
  const res = await apiClient.post(`/schedules/${id}/toggle-complete`)
  return res.data
}

/**
 * 修改完成人（管理员）
 */
export async function setCompleter(id, completerName) {
  const res = await apiClient.put(`/schedules/${id}/completer`, { comment: completerName })
  return res.data
}

/**
 * 获取外部联系人列表
 */
export async function getContacts() {
  const res = await apiClient.get('/contacts')
  return res.data
}
