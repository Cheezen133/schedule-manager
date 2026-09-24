import apiClient from './client'

function apiPath(url) {
  if (!url) throw new Error('文件地址不存在')
  const parsed = new URL(url, window.location.origin)
  if (parsed.origin !== window.location.origin) throw new Error('不支持外部文件地址')
  const prefix = '/api/v1'
  const path = parsed.pathname.startsWith(prefix) ? parsed.pathname.slice(prefix.length) : parsed.pathname
  return `${path || '/'}${parsed.search}`
}

export async function getAuthorizedFileBlob(url) {
  const response = await apiClient.get(apiPath(url), { responseType: 'blob' })
  return response.data
}

export async function downloadAuthorizedFile(url, suggestedName = '下载文件') {
  const blob = await getAuthorizedFileBlob(url)
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = suggestedName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
}

export async function openAuthorizedFile(url) {
  // 先同步打开空页，避免等待网络响应后被浏览器当作弹窗拦截。
  const previewWindow = window.open('about:blank', '_blank')
  if (!previewWindow) {
    const error = new Error('文件预览窗口被拦截')
    error.userMessage = '文件预览窗口被浏览器拦截，请允许弹窗后重试，或使用“下载”按钮。'
    throw error
  }
  previewWindow.opener = null
  try {
    const blob = await getAuthorizedFileBlob(url)
    const objectUrl = URL.createObjectURL(blob)
    previewWindow.location.href = objectUrl
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
  } catch (error) {
    previewWindow?.close()
    throw error
  }
}
