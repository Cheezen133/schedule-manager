// 病历审阅板块共用的小工具：状态标签、选项、文件大小、错误与进度文字、北京时间的今天
export const STATUS_OPTIONS = [['', '全部'], ['waiting', '待审阅'], ['pending', '待定'], ['included', '已纳入'], ['excluded', '未纳入'], ['unassigned', '未指派']]
export const DECISION_OPTIONS = [['include', '纳入'], ['exclude', '不纳入'], ['pending', '待定']]

export function StatusPill({ status, label }) {
  return <span className={`cr-status cr-status-${status}`}>{label}</span>
}

export function formatSize(bytes) {
  if (bytes == null) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

export const errorText = (error, fallback = '操作失败，请稍后重试') => error?.userMessage || fallback

export const progressText = event => (event?.total ? `${Math.round((event.loaded / event.total) * 100)}%` : '')

export const beijingToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date())
