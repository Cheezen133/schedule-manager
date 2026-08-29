import apiClient from './client'

export async function getMessages(scheduleId, includeHistory = false) {
  const res = await apiClient.get(`/schedules/${scheduleId}/messages`, {
    params: { include_history: includeHistory },
  })
  return res.data
}

export async function sendTextMessage(scheduleId, content, isFromClient = 0) {
  const formData = new FormData()
  formData.append('content', content)
  formData.append('is_from_client', String(isFromClient))
  const res = await apiClient.post(`/schedules/${scheduleId}/messages/text`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return res.data
}

export async function sendVoiceMessage(scheduleId, audioBlob, duration, isFromClient = 0) {
  const formData = new FormData()
  formData.append('voice', audioBlob, 'recording.webm')
  formData.append('duration', String(duration))
  formData.append('is_from_client', String(isFromClient))
  const res = await apiClient.post(`/schedules/${scheduleId}/messages/voice`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return res.data
}

export async function deleteMessage(msgId) {
  const res = await apiClient.delete(`/messages/${msgId}`)
  return res.data
}
