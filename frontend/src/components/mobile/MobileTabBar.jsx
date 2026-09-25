import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { getPendingSchedules } from '../../api/schedules'
import { getCaseReviewSummary } from '../../api/caseReview'

// 手机端底部标签栏：常用入口，其余功能收进「我的」。
// 「病历审阅」只给参与了审阅项目的人显示（optional）；「待审核」属于通知，并入「通知」标签（also）
const TABS = [
  { to: '/', label: '日历', icon: 'calendar' },
  { to: '/case-review', label: '病历审阅', icon: 'caseReview', optional: true },
  { to: '/chat', label: '消息', icon: 'chat' },
  { to: '/notifications', label: '通知', icon: 'bell', also: ['/review'] },
  { to: '/me', label: '我的', icon: 'me' },
]

const isTabActive = (tab, pathname) => tab.to === pathname || Boolean(tab.also?.includes(pathname))
export const isTabPath = pathname => TABS.some(tab => isTabActive(tab, pathname))

// 仿 SF Symbols 的线性图标，选中时换成实心样式
function TabIcon({ name, active }) {
  const fill = active ? 'currentColor' : 'none'
  const inner = active ? '#fff' : 'currentColor'
  switch (name) {
    case 'calendar':
      return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="3.2" fill={fill} /><path d="M3.5 10h17" stroke={inner} /><path d="M8 3v4M16 3v4" /></svg>
    case 'caseReview':
      return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3.5H7.2a1.7 1.7 0 0 0-1.7 1.7v13.6a1.7 1.7 0 0 0 1.7 1.7h9.6a1.7 1.7 0 0 0 1.7-1.7V8z" fill={fill} /><path d="M14 3.5V8h4.5" stroke={inner} /><path d="M9 14.3l2 2 4-4.3" stroke={inner} /></svg>
    case 'chat':
      return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4.5c-4.7 0-8.5 3-8.5 6.9 0 2.2 1.2 4.1 3.1 5.4-.2 1.2-.8 2.3-1.7 3.2 1.9-.1 3.5-.8 4.6-1.8.8.2 1.6.3 2.5.3 4.7 0 8.5-3.1 8.5-7.1S16.7 4.5 12 4.5z" fill={fill} /></svg>
    case 'bell':
      return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z" fill={fill} /><path d="M10 20.5a2 2 0 0 0 4 0" /></svg>
    default:
      return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill={fill} /><circle cx="12" cy="10" r="3.2" stroke={inner} /><path d="M6.6 18.3c1.3-1.9 3.2-3 5.4-3s4.1 1.1 5.4 3" stroke={inner} /></svg>
  }
}

const Badge = ({ count }) => count > 0 ? <span className="m-tab-badge">{count > 99 ? '99+' : count}</span> : null

export default function MobileTabBar({ notificationCount = 0, chatUnreadCount = 0 }) {
  const { pathname } = useLocation()
  const [pendingReviewCount, setPendingReviewCount] = useState(0)
  const [caseReview, setCaseReview] = useState({ waiting_count: 0, project_count: 0 })
  useEffect(() => {
    const load = () => {
      getPendingSchedules().then(response => setPendingReviewCount((response.data || []).length)).catch(() => setPendingReviewCount(0))
      getCaseReviewSummary().then(setCaseReview).catch(() => {})
    }
    load(); const timer = setInterval(() => { if (document.visibilityState === 'visible') load() }, 30000)
    return () => clearInterval(timer)
  }, [])
  // 「通知」的角标 = 未读通知 + 待审核日程
  const counts = { caseReview: caseReview.waiting_count, chat: chatUnreadCount, bell: notificationCount + pendingReviewCount }
  const tabs = TABS.filter(tab => !tab.optional || caseReview.project_count > 0)
  return <nav className="m-tabbar">{tabs.map(tab => {
    const active = isTabActive(tab, pathname)
    return <Link key={tab.to} to={tab.to} className={active ? 'active' : undefined} aria-current={active ? 'page' : undefined}>
      <span className="m-tab-icon"><TabIcon name={tab.icon} active={active} /><Badge count={counts[tab.icon] || 0} /></span>
      <span className="m-tab-label">{tab.label}</span>
    </Link>
  })}</nav>
}
