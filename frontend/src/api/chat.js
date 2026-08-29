import apiClient from './client'

export async function getConversations() {
  const res = await apiClient.get('/chat/conversations')
  return res.data
}

export async function createConversation(userId) {
  const res = await apiClient.post('/chat/conversations', { user_id: userId })
  return res.data
}

export async function createGroup(name, userIds) {
  const res = await apiClient.post('/chat/groups', { name, user_ids: userIds })
  return res.data
}

export async function setRemark(convId, remark) {
  const res = await apiClient.put(`/chat/conversations/${convId}/remark`, { remark })
  return res.data
}

export async function getMessages(convId, beforeId, limit = 30) {
  const params = { limit }
  if (beforeId) params.before_id = beforeId
  const res = await apiClient.get(`/chat/conversations/${convId}/messages`, { params })
  return res.data
}

export async function sendTextMessage(convId, content) {
  const res = await apiClient.post(`/chat/conversations/${convId}/messages/text`, { content })
  return res.data
}

export async function sendMediaMessage(convId, file, content = '') {
  const form = new FormData()
  form.append('file', file)
  form.append('content', content)
  const res = await apiClient.post(`/chat/conversations/${convId}/messages/media`, form)
  return res.data
}

export async function deleteMessage(msgId) {
  const res = await apiClient.delete(`/chat/messages/${msgId}`)
  return res.data
}

export async function recallMessage(msgId) {
  const res = await apiClient.post(`/chat/messages/${msgId}/recall`)
  return res.data
}

export async function getChatContacts(friendsOnly = false) {
  const res = await apiClient.get('/chat/contacts', { params: { friends_only: friendsOnly } })
  return res.data
}

export function getMediaUrl(filename) {
  return `/api/v1/chat/messages/media/${filename}`
}

export function getDownloadUrl(filename) {
  return `/api/v1/chat/messages/download/${filename}`
}

// 图片、视频和下载接口需要 JWT。原生 img/video/window.open 不会附带 Authorization，
// 因此统一通过 Axios 获取 Blob，再交给浏览器展示或保存。
export async function getAuthorizedMediaBlob(filename) {
  const res = await apiClient.get(`/chat/messages/media/${encodeURIComponent(filename)}`, { responseType: 'blob' })
  return res.data
}

export async function downloadAuthorizedChatFile(filename, suggestedName) {
  const res = await apiClient.get(`/chat/messages/download/${encodeURIComponent(filename)}`, { responseType: 'blob' })
  const url = URL.createObjectURL(res.data)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = suggestedName || filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function addFavorite(msgId) {
  const res = await apiClient.post(`/chat/favorites/${msgId}`)
  return res.data
}

export async function removeFavorite(msgId) {
  const res = await apiClient.delete(`/chat/favorites/${msgId}`)
  return res.data
}

export async function getFavorites() {
  const res = await apiClient.get('/chat/favorites')
  return res.data
}

export async function markConversationRead(convId) {
  const res = await apiClient.put(`/chat/conversations/${convId}/read`)
  return res.data
}

// 好友请求
export async function getFriendRequests() {
  const res = await apiClient.get('/chat/friend-requests')
  return res.data
}

export async function acceptFriendRequest(reqId) {
  const res = await apiClient.put(`/chat/friend-requests/${reqId}/accept`)
  return res.data
}

export async function rejectFriendRequest(reqId) {
  const res = await apiClient.put(`/chat/friend-requests/${reqId}/reject`)
  return res.data
}

// 共享文件
export async function getSharedFiles(convId, tag = null) {
  const params = {}
  if (tag) params.tag = tag
  const res = await apiClient.get(`/chat/conversations/${convId}/files`, { params })
  return res.data
}

export async function addSharedFileFromMsg(convId, msgId, tag = null, note = null) {
  const form = new FormData()
  form.append('msg_id', msgId)
  if (tag) form.append('tag', tag)
  if (note) form.append('note', note)
  const res = await apiClient.post(`/chat/conversations/${convId}/files`, form)
  return res.data
}

export async function uploadSharedFile(convId, file, tag = null, note = null) {
  const form = new FormData()
  form.append('file', file)
  if (tag) form.append('tag', tag)
  if (note) form.append('note', note)
  const res = await apiClient.post(`/chat/conversations/${convId}/files`, form)
  return res.data
}

export async function deleteSharedFile(fileId) {
  const res = await apiClient.delete(`/chat/files/${fileId}`)
  return res.data
}

export async function getGroupMembers(convId) {
  const res = await apiClient.get(`/chat/conversations/${convId}/members`)
  return res.data
}

export async function renameGroup(convId, name) {
  const res = await apiClient.put(`/chat/conversations/${convId}/group-name`, { name })
  return res.data
}

export async function setGroupMemberRole(convId, userId, role) {
  const res = await apiClient.put(`/chat/conversations/${convId}/members/${userId}/role`, { role })
  return res.data
}

export async function removeGroupMember(convId, userId) {
  const res = await apiClient.delete(`/chat/conversations/${convId}/members/${userId}`)
  return res.data
}

export async function dissolveGroup(convId) {
  const res = await apiClient.delete(`/chat/conversations/${convId}`)
  return res.data
}

export async function getGroupAnnouncements(convId) {
  const res = await apiClient.get(`/chat/conversations/${convId}/announcements`)
  return res.data
}

export async function createGroupAnnouncement(convId, data) {
  const res = await apiClient.post(`/chat/conversations/${convId}/announcements`, data)
  return res.data
}

export async function deleteGroupAnnouncement(announcementId) {
  const res = await apiClient.delete(`/chat/announcements/${announcementId}`)
  return res.data
}

export async function getGroupTodos(convId) {
  const res = await apiClient.get(`/chat/conversations/${convId}/todos`)
  return res.data
}

export async function createGroupTodo(convId, data) {
  const res = await apiClient.post(`/chat/conversations/${convId}/todos`, data)
  return res.data
}

export async function toggleGroupTodo(todoId) {
  const res = await apiClient.put(`/chat/todos/${todoId}/toggle`)
  return res.data
}

export async function deleteGroupTodo(todoId) {
  const res = await apiClient.delete(`/chat/todos/${todoId}`)
  return res.data
}

// 搜索
export async function searchChat(query) {
  const res = await apiClient.get('/chat/search', { params: { q: query } })
  return res.data
}
