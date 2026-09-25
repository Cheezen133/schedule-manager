import apiClient from './client'

// 病历审阅板块的接口。上传、下载病历不设超时（PDF 不限大小，慢网络下可能要很久）
const base = '/case-review'
const data = response => response.data.data
const NO_TIMEOUT = { timeout: 0 }

export const getCaseReviewSummary = () => apiClient.get(`${base}/summary`).then(data)

export const listReviewProjects = () => apiClient.get(`${base}/projects`).then(data)
export const createReviewProject = values => apiClient.post(`${base}/projects`, values).then(data)
export const getReviewProject = projectId => apiClient.get(`${base}/projects/${projectId}`).then(data)
export const updateReviewProject = (projectId, values) => apiClient.put(`${base}/projects/${projectId}`, values)
export const deleteReviewProject = projectId => apiClient.delete(`${base}/projects/${projectId}`)
export const addReviewMember = (projectId, userId) => apiClient.post(`${base}/projects/${projectId}/members`, { user_id: userId })
export const removeReviewMember = (projectId, userId) => apiClient.delete(`${base}/projects/${projectId}/members/${userId}`)

export const listReviewCases = (projectId, params) => apiClient.get(`${base}/projects/${projectId}/cases`, { params }).then(data)
export const createReviewCase = (projectId, values) => apiClient.post(`${base}/projects/${projectId}/cases`, values).then(data)
export const getReviewCase = caseId => apiClient.get(`${base}/cases/${caseId}`).then(data)
export const updateReviewCase = (caseId, values) => apiClient.put(`${base}/cases/${caseId}`, values)
export const deleteReviewCase = caseId => apiClient.delete(`${base}/cases/${caseId}`)
export const saveReviewConclusion = (caseId, values) => apiClient.put(`${base}/cases/${caseId}/conclusion`, values)

export function uploadCaseFiles(caseId, files, onProgress) {
  const form = new FormData()
  files.forEach(file => form.append('files', file))
  return apiClient.post(`${base}/cases/${caseId}/files`, form, { ...NO_TIMEOUT, onUploadProgress: onProgress })
}
export const deleteCaseFile = fileId => apiClient.delete(`${base}/files/${fileId}`)
export const caseFileUrl = fileId => `/api/v1${base}/files/${fileId}/content`
// 取回 PDF 原始字节交给 PDF.js；onProgress 用来显示下载进度
export const fetchCaseFile = (fileId, onProgress) => apiClient.get(`${base}/files/${fileId}/content`, { ...NO_TIMEOUT, responseType: 'arraybuffer', onDownloadProgress: onProgress }).then(response => response.data)

export const listAnnotations = fileId => apiClient.get(`${base}/files/${fileId}/annotations`).then(data)
export const createAnnotation = (fileId, values) => apiClient.post(`${base}/files/${fileId}/annotations`, values).then(data)
export const updateAnnotation = (annotationId, content) => apiClient.put(`${base}/annotations/${annotationId}`, { content })
export const deleteAnnotation = annotationId => apiClient.delete(`${base}/annotations/${annotationId}`)

export const listDailyReports = (projectId, params) => apiClient.get(`${base}/projects/${projectId}/daily-reports`, { params }).then(data)
export function createDailyReport(projectId, { reportDate, content, files }, onProgress) {
  const form = new FormData()
  if (reportDate) form.append('report_date', reportDate)
  if (content) form.append('content', content)
  files.forEach(file => form.append('files', file))
  return apiClient.post(`${base}/projects/${projectId}/daily-reports`, form, { ...NO_TIMEOUT, onUploadProgress: onProgress })
}
export const updateDailyReport = (reportId, values) => apiClient.put(`${base}/daily-reports/${reportId}`, values)
export function addDailyReportFiles(reportId, files, onProgress) {
  const form = new FormData()
  files.forEach(file => form.append('files', file))
  return apiClient.post(`${base}/daily-reports/${reportId}/files`, form, { ...NO_TIMEOUT, onUploadProgress: onProgress })
}
export const deleteDailyReport = reportId => apiClient.delete(`${base}/daily-reports/${reportId}`)
export const deleteDailyReportFile = fileId => apiClient.delete(`${base}/daily-report-files/${fileId}`)
export const dailyReportFileUrl = fileId => `/api/v1${base}/daily-report-files/${fileId}/content`

export const exportUrl = projectId => `/api/v1${base}/projects/${projectId}/export`
