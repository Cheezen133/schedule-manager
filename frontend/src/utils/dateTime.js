const BEIJING_TIME_ZONE = 'Asia/Shanghai'

function parseScheduleDate(value) {
  if (!value) return null
  const text = String(value)
  // datetime-local 预填值本身就是北京时间；旧接口的秒级无时区值按 UTC 兼容。
  const normalized = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(text)
    ? `${text}:00+08:00`
    : /[zZ]$|[+-]\d{2}:?\d{2}$/.test(text) ? text : `${text}Z`
  const date = new Date(normalized)
  return Number.isNaN(date.getTime()) ? null : date
}

export function parseBeijingDate(value) {
  return parseScheduleDate(value)
}

function beijingParts(value) {
  const date = parseScheduleDate(value)
  if (!date) return null
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BEIJING_TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date)
  return Object.fromEntries(parts.map(part => [part.type, part.value]))
}

export function toBeijingInputValue(value) {
  if (!value) return ''
  const text = String(value)
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(text)) return text
  const parts = beijingParts(value)
  return parts ? `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}` : text.slice(0, 16)
}

export function beijingInputToUtcIso(value) {
  if (!value) return null
  const withSeconds = value.length === 16 ? `${value}:00` : value
  const date = new Date(`${withSeconds}+08:00`)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}

// 出生日期是纯日期，不参与浏览器或 UTC 时区换算。
export function dateOnlyToNaiveIso(value) {
  return value ? `${String(value).slice(0, 10)}T00:00:00` : null
}

export function toBeijingCalendarValue(value) {
  const input = toBeijingInputValue(value)
  return input ? `${input}:00` : value
}

export function formatBeijingDateTime(value, { includeYear = true } = {}) {
  const parts = beijingParts(value)
  if (!parts) return String(value || '').slice(0, 16).replace('T', ' ')
  const datePart = includeYear
    ? `${parts.year}-${parts.month}-${parts.day}`
    : `${parts.month}-${parts.day}`
  return `${datePart} ${parts.hour}:${parts.minute}`
}

export function formatBeijingDate(value) {
  const parts = beijingParts(value)
  return parts ? `${parts.year}-${parts.month}-${parts.day}` : String(value || '').slice(0, 10)
}

export function formatBeijingTime(value) {
  const parts = beijingParts(value)
  return parts ? `${parts.hour}:${parts.minute}` : ''
}

export function formatBeijingShortDateTime(value) {
  return formatBeijingDateTime(value, { includeYear: false })
}

export function isBeijingToday(value) {
  const valueParts = beijingParts(value)
  const nowParts = beijingParts(new Date().toISOString())
  return Boolean(valueParts && nowParts && valueParts.year === nowParts.year && valueParts.month === nowParts.month && valueParts.day === nowParts.day)
}

export function beijingNowInputValue() {
  return toBeijingInputValue(new Date().toISOString())
}

export function getBeijingCurrentMonthRange() {
  const parts = beijingParts(new Date().toISOString())
  if (!parts) return { startDate: '', endDate: '' }
  const year = Number(parts.year)
  const month = Number(parts.month)
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return {
    startDate: `${parts.year}-${parts.month}-01`,
    endDate: `${parts.year}-${parts.month}-${String(lastDay).padStart(2, '0')}`,
  }
}

export function formatRelativeTime(value) {
  const date = parseScheduleDate(value)
  if (!date) return ''
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000))
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes}分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}小时前`
  return `${Math.floor(hours / 24)}天前`
}

export function formatBeijingLocale(value) {
  const date = parseScheduleDate(value)
  if (!date) return String(value || '')
  return date.toLocaleString('zh-CN', {
    timeZone: BEIJING_TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
}
