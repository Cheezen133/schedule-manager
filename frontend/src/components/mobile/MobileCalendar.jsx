import { useMemo, useRef, useState } from 'react'
import { getEventColors } from '../calendar/CalendarView'
import { beijingNowInputValue, toBeijingCalendarValue } from '../../utils/dateTime'
import { useMobileNav } from './MobileNavBar'
import MobilePickerSheet from './MobilePickerSheet'

// 手机端日历（仿 iOS「日历」）：上方月历，有日程的日子标圆点；点某天在下方列出当天日程。
// 数据和操作（切换日历对象、查看详情、新建、导出）都由 CalendarPage 传入，与网页端共用同一套逻辑。
const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']
const WEEKDAY_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
const STATUS_LABELS = { pending: '待审核', rejected: '已驳回' }
const LEGEND = [
  ['已确认', getEventColors({ status: 'confirmed' }).border, 'confirmed'],
  ['待审核', getEventColors({ status: 'pending' }).border, 'pending'],
  ['已驳回', getEventColors({ status: 'rejected' }).border, null],
  ['重要', getEventColors({ is_important: true }).border, 'important'],
]

const pad = n => String(n).padStart(2, '0')
const dayKey = (year, monthIndex, day) => {
  const date = new Date(Date.UTC(year, monthIndex, day))
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}
const shiftDay = (key, delta) => dayKey(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10)) + delta)

// 把日程按北京时间摊到它覆盖的每一天（跨天日程每天都显示）
function groupByDay(schedules) {
  const days = new Map()
  for (const schedule of schedules) {
    const start = toBeijingCalendarValue(schedule.start_time)
    if (!start) continue
    const end = toBeijingCalendarValue(schedule.end_time) || start
    const startDay = start.slice(0, 10)
    let endDay = end.slice(0, 10)
    // 结束在某天 00:00 的日程不算入那一天
    if (endDay > startDay && end.slice(11, 16) === '00:00') endDay = shiftDay(endDay, -1)
    if (endDay < startDay) endDay = startDay
    for (let day = startDay, count = 0; day <= endDay && count < 366; day = shiftDay(day, 1), count += 1) {
      if (!days.has(day)) days.set(day, [])
      days.get(day).push({ schedule, start, end })
    }
  }
  // 全天日程排在前面，其余按开始时间排序
  for (const items of days.values()) items.sort((a, b) => (b.schedule.is_all_day - a.schedule.is_all_day) || a.start.localeCompare(b.start))
  return days
}

// 右侧时间：当天开始/结束的时刻；跨天日程在中间几天显示「全天」
function timeLabels({ schedule, start, end }, day) {
  const startDay = start.slice(0, 10), endDay = end.slice(0, 10)
  if (schedule.is_all_day || (startDay < day && endDay > day)) return ['全天', '']
  return [startDay < day ? '00:00' : start.slice(11, 16), endDay > day ? '24:00' : end.slice(11, 16)]
}

const Chevron = ({ direction = 'right' }) => <svg className="m-chevron" viewBox="0 0 8 14" aria-hidden="true"><path d={direction === 'left' ? 'M7 1L1 7l6 6' : 'M1 1l6 6-6 6'} /></svg>

export default function MobileCalendar({ schedules, error, selectedUserId, managedUsers, onSelectUser, onEventClick, onCreate, onExport, counts }) {
  const today = beijingNowInputValue().slice(0, 10)
  const [month, setMonth] = useState(() => ({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) - 1 }))
  const [selectedDay, setSelectedDay] = useState(today)
  const [pickerOpen, setPickerOpen] = useState(false)
  const touchStart = useRef(null)
  const eventsByDay = useMemo(() => groupByDay(schedules), [schedules])

  // 切到今天所在的月份时选中今天，否则选中 1 号（与 iOS 一致）
  const goToMonth = (year, monthIndex) => {
    const date = new Date(Date.UTC(year, monthIndex, 1))
    const next = { year: date.getUTCFullYear(), month: date.getUTCMonth() }
    const firstDay = dayKey(next.year, next.month, 1)
    setMonth(next)
    setSelectedDay(today.slice(0, 7) === firstDay.slice(0, 7) ? today : firstDay)
  }

  useMobileNav({
    title: `${month.year}年${month.month + 1}月`,
    onAdd: () => onCreate(selectedDay),
    onToday: () => goToMonth(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1),
  })

  // 左右滑动切换月份；从屏幕左边缘开始的滑动留给系统「返回」手势
  const handleTouchStart = event => {
    const touch = event.touches[0]
    touchStart.current = touch.clientX < 24 ? null : { x: touch.clientX, y: touch.clientY }
  }
  const handleTouchEnd = event => {
    if (!touchStart.current) return
    const touch = event.changedTouches[0]
    const dx = touch.clientX - touchStart.current.x, dy = touch.clientY - touchStart.current.y
    touchStart.current = null
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) goToMonth(month.year, month.month + (dx < 0 ? 1 : -1))
  }

  // 月历格子：周一为第一列，月初之前、月末之后留空
  const firstWeekday = (new Date(Date.UTC(month.year, month.month, 1)).getUTCDay() + 6) % 7
  const daysInMonth = new Date(Date.UTC(month.year, month.month + 1, 0)).getUTCDate()
  const cells = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, index) => index + 1)]
  while (cells.length % 7) cells.push(null)
  const weeks = Array.from({ length: cells.length / 7 }, (_, index) => cells.slice(index * 7, index * 7 + 7))

  const selectedWeekday = WEEKDAY_NAMES[new Date(`${selectedDay}T00:00:00Z`).getUTCDay()]
  const dayItems = eventsByDay.get(selectedDay) || []
  const selectedUser = selectedUserId ? managedUsers.find(user => user.owner_id === selectedUserId) : null
  const targetLabel = selectedUserId ? `${selectedUser?.nickname || '其他用户'} 的日程` : '我的日程'
  const pickerOptions = [
    { id: null, label: '我的日程', pinned: true },
    ...managedUsers.map(user => ({ id: user.owner_id, label: `${user.nickname} 的日程`, sub: user.management?.status === 'approved' ? '可管理' : '仅忙碌', keywords: [user.nickname, user.username] })),
  ]
  const choose = id => { onSelectUser(id); setPickerOpen(false) }

  return <div className="m-cal">
    <div className="m-cal-toolbar">
      <button type="button" className="m-cal-target" onClick={() => setPickerOpen(true)}>
        <span>{targetLabel}</span><svg viewBox="0 0 14 8" aria-hidden="true"><path d="M1 1l6 6 6-6" /></svg>
      </button>
      <span className="m-cal-month-nav">
        <button type="button" aria-label="上个月" onClick={() => goToMonth(month.year, month.month - 1)}><Chevron direction="left" /></button>
        <button type="button" aria-label="下个月" onClick={() => goToMonth(month.year, month.month + 1)}><Chevron /></button>
      </span>
    </div>

    {error && <div className="error-message">{error}</div>}

    <div className="m-cal-grid" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      <div className="m-cal-weekdays">{WEEKDAYS.map(day => <span key={day}>{day}</span>)}</div>
      {weeks.map((week, weekIndex) => <div className="m-cal-week" key={weekIndex}>{week.map((day, index) => {
        if (!day) return <span key={index} />
        const key = dayKey(month.year, month.month, day)
        const dots = (eventsByDay.get(key) || []).slice(0, 3)
        const classes = ['m-cal-day', index >= 5 && 'is-weekend', key === today && 'is-today', key === selectedDay && 'is-selected'].filter(Boolean).join(' ')
        return <button type="button" key={index} className={classes} onClick={() => setSelectedDay(key)} aria-label={`${month.month + 1}月${day}日`}>
          <span className="m-cal-num">{day}</span>
          <span className="m-cal-dots">{dots.map(item => <i key={item.schedule.id} style={{ background: getEventColors(item.schedule).border }} />)}</span>
        </button>
      })}</div>)}
    </div>

    <div className="m-cal-legend">
      {LEGEND.map(([label, color, countKey]) => <span key={label}><i style={{ background: color }} />{label}{countKey && ` ${counts[countKey]}`}</span>)}
    </div>

    <div className="m-section-header">{Number(selectedDay.slice(5, 7))}月{Number(selectedDay.slice(8, 10))}日 {selectedWeekday}</div>
    <section className="m-list">
      {dayItems.map(item => {
        const { schedule } = item
        const [from, to] = timeLabels(item, selectedDay)
        const meta = [schedule.is_busy_placeholder && '忙碌', STATUS_LABELS[schedule.status], schedule.is_important && '重要', schedule.category_name].filter(Boolean).join(' · ')
        const content = <>
          <span className="m-cal-event-bar" style={{ background: getEventColors(schedule).border }} />
          <span className="m-cal-event-main">
            <span className="m-cal-event-title">{schedule.title}</span>
            {meta && <span className="m-cal-event-meta">{meta}</span>}
          </span>
          <span className="m-cal-event-time">{from}{to && <small>{to}</small>}</span>
        </>
        // 好友的「忙碌」占位不能查看详情，与网页端一致
        return schedule.is_busy_placeholder
          ? <div key={schedule.id} className="m-cell m-cal-event">{content}</div>
          : <button type="button" key={schedule.id} className="m-cell m-cal-event" onClick={() => onEventClick(schedule.id)}>{content}<Chevron /></button>
      })}
      {dayItems.length === 0 && <div className="m-cell m-cell-empty">无日程</div>}
      <button type="button" className="m-cell m-cal-action" onClick={() => onCreate(selectedDay)}>新建日程</button>
    </section>

    <section className="m-list">
      <button type="button" className="m-cell m-cal-action" onClick={onExport}>导出本月日历（iCal）</button>
    </section>

    {pickerOpen && <MobilePickerSheet title="选择日历" searchPlaceholder="搜索好友姓名或用户名" options={pickerOptions} selectedId={selectedUserId} onSelect={choose} onClose={() => setPickerOpen(false)} />}
  </div>
}
