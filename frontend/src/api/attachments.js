import apiClient from './client'

/**
 * 获取日程附件列表
 */
export async function getAttachments(scheduleId, includeHistory = false) {
  const res = await apiClient.get(`/schedules/${scheduleId}/attachments`, {
    params: { include_history: includeHistory },
  })
  return res.data
}

/**
 * 上传附件
 */
export async function uploadAttachment(scheduleId, file, description = '') {
  const formData = new FormData()
  formData.append('file', file)
  if (description) formData.append('description', description)
  const res = await apiClient.post(`/schedules/${scheduleId}/attachments`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return res.data
}

/**
 * 下载附件（返回 URL）
 */
export function getAttachmentDownloadUrl(attachmentId) {
  return `/api/v1/attachments/${attachmentId}/download`
}

/**
 * 删除附件
 */
export async function deleteAttachment(attachmentId) {
  const res = await apiClient.delete(`/attachments/${attachmentId}`)
  return res.data
}
