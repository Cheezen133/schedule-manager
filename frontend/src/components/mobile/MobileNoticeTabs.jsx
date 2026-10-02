import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { getUnreadCount } from '../../api/notifications'
import { getPendingSchedules } from '../../api/schedules'

// 手机端「通知」标签下的分段切换：通知、待审核。待审核属于通知的一类，不再单独占一个底部标签
export default function MobileNoticeTabs() {
  const { pathname } = useLocation()
  const [counts, setCounts] = useState({ unread: 0, pending: 0 })
  const unreadVersion = useRef(0)
  useEffect(() => {
    const version = unreadVersion.current
    getUnreadCount().then(response => { if (version === unreadVersion.current) setCounts(previous => ({ ...previous, unread: response.data?.count || 0 })) }).catch(() => {})
    getPendingSchedules().then(response => setCounts(previous => ({ ...previous, pending: (response.data || []).length }))).catch(() => {})
    const syncUnread = event => {
      unreadVersion.current += 1
      setCounts(previous => ({ ...previous, unread: Number(event.detail) || 0 }))
    }
    window.addEventListener('notification-unread-count', syncUnread)
    return () => window.removeEventListener('notification-unread-count', syncUnread)
  }, [pathname])
  const tabs = [['/notifications', '通知', counts.unread], ['/review', '待审核', counts.pending]]
  return <div className="m-notice-tabs" role="tablist">
    {tabs.map(([to, label, count]) => <Link key={to} to={to} replace role="tab" aria-selected={pathname === to} className={pathname === to ? 'is-active' : undefined}>
      {label}{count > 0 && <span className="m-notice-count">{count > 99 ? '99+' : count}</span>}
    </Link>)}
  </div>
}
