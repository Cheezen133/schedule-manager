import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import { toBeijingCalendarValue } from '../../utils/dateTime'

/**
 * 根据状态和分类获取日历事件颜色
 */
function getEventColors(schedule) {
  if (schedule.is_busy_placeholder) {
    return { bg: '#e5e7eb', border: '#9ca3af', text: '#6b7280' }
  }
  if (schedule.is_important) {
    return { bg: '#fee2e2', border: '#dc2626', text: '#991b1b' }
  }
  // 已确认日程固定显示为绿色，避免被分类色覆盖。
  if (schedule.status === 'confirmed') {
    return { bg: '#dcfce7', border: '#16a34a', text: '#166534' }
  }
  // 有分类时使用分类颜色
  if (schedule.category_color) {
    return { bg: schedule.category_color + '20', border: schedule.category_color, text: schedule.category_color }
  }
  switch (schedule.status) {
    case 'pending':
      return { bg: '#fef3c7', border: '#f59e0b', text: '#92400e' }
    case 'rejected':
      return { bg: '#f3f4f6', border: '#d1d5db', text: '#9ca3af' }
    default:
      return { bg: '#dbeafe', border: '#4f46e5', text: '#1e40af' }
  }
}

export default function CalendarView({ schedules, onEventClick, onDateClick }) {
  const events = schedules.map((s) => {
    const colors = getEventColors(s)
    return {
      id: String(s.id),
      title: (s.is_busy_placeholder ? '◼ ' : '') + s.title,
      start: toBeijingCalendarValue(s.start_time),
      end: toBeijingCalendarValue(s.end_time),
      allDay: s.is_all_day,
      backgroundColor: colors.bg,
      borderColor: colors.border,
      textColor: colors.text,
      classNames: [
        s.is_important ? 'important-event' : '',
        `status-${s.status}`,
      ],
      extendedProps: {
        status: s.status,
        isImportant: s.is_important,
        isBusyPlaceholder: Boolean(s.is_busy_placeholder),
      },
    }
  })

  return (
    <FullCalendar
      plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
      initialView="dayGridMonth"
      headerToolbar={{
        left: 'prev,next today',
        center: 'title',
        right: 'dayGridMonth,timeGridWeek,timeGridDay',
      }}
      buttonText={{
        today: '今天',
        month: '月视图',
        week: '周视图',
        day: '日视图',
      }}
      events={events}
      eventClick={(info) => {
        if (info.event.extendedProps.isBusyPlaceholder) return
        if (onEventClick) onEventClick(info.event.id)
      }}
      dateClick={(info) => {
        if (onDateClick) onDateClick(info.dateStr)
      }}
      height="auto"
      locale="zh-cn"
      firstDay={1}
      allDayText="全天"
      noEventsText="暂无日程"
    />
  )
}
