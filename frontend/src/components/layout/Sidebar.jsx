import { useState, useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { getPendingSchedules } from '../../api/schedules'
import { getCaseReviewSummary } from '../../api/caseReview'

export default function Sidebar({ notificationCount = 0, chatUnreadCount = 0 }) {
  const { isAdmin } = useAuth()
  const location = useLocation()
  const [pendingReviewCount, setPendingReviewCount] = useState(0)
  const [caseReviewCount, setCaseReviewCount] = useState(0)
  const [profileOpen, setProfileOpen] = useState(location.pathname.startsWith('/profile'))
  const [memosOpen, setMemosOpen] = useState(location.pathname.startsWith('/profile/memos'))
  useEffect(() => {
    const load = () => {
      getPendingSchedules().then(response => setPendingReviewCount((response.data || []).length)).catch(() => setPendingReviewCount(0))
      getCaseReviewSummary().then(summary => setCaseReviewCount(summary.waiting_count)).catch(() => setCaseReviewCount(0))
    }
    load(); const timer = setInterval(() => { if (document.visibilityState === 'visible') load() }, 30000)
    return () => clearInterval(timer)
  }, [])
  useEffect(() => { if (location.pathname.startsWith('/profile')) setProfileOpen(true) }, [location.pathname])
  useEffect(() => { if (location.pathname.startsWith('/profile/memos')) setMemosOpen(true) }, [location.pathname])
  const cls = ({ isActive }) => isActive ? 'active' : ''
  return <aside className="sidebar"><div className="sidebar-logo">📅 日程管理系统</div><nav className="sidebar-nav">
    <div className={`sidebar-menu-group ${profileOpen ? 'open' : ''}`}><button className={`sidebar-parent ${location.pathname.startsWith('/profile') ? 'active' : ''}`} type="button" onClick={() => setProfileOpen(open => !open)}><span>个人主页</span><span className="sidebar-caret">⌄</span></button><div className="sidebar-subnav"><NavLink to="/profile/dashboard" className={cls}>仪表盘</NavLink><div className={`sidebar-menu-group sidebar-nested ${memosOpen ? 'open' : ''}`}><button className={`sidebar-parent ${location.pathname.startsWith('/profile/memos') ? 'active' : ''}`} type="button" onClick={() => setMemosOpen(open => !open)}><span>备忘录</span><span className="sidebar-caret">⌄</span></button><div className="sidebar-subnav"><NavLink to="/profile/memos/personal" className={cls}>个人备忘录</NavLink><NavLink to="/profile/memos/team" className={cls}>团队群聊备忘录</NavLink></div></div></div></div>
    <NavLink to="/" end className={cls}>日历视图</NavLink>
    <NavLink to="/schedules/new" className={cls}>新建日程</NavLink>
    <NavLink to="/review" className={cls}>待审核 {pendingReviewCount > 0 && <span className="badge">{pendingReviewCount > 99 ? '99+' : pendingReviewCount}</span>}</NavLink>
    <NavLink to="/case-review" className={cls}>病历审阅 {caseReviewCount > 0 && <span className="badge">{caseReviewCount > 99 ? '99+' : caseReviewCount}</span>}</NavLink>
    <NavLink to="/chat" className={cls}>消息{chatUnreadCount > 0 && <span className="badge">{chatUnreadCount > 99 ? '99+' : chatUnreadCount}</span>}</NavLink>
    <NavLink to="/contacts" className={cls}>联系人</NavLink>
    <NavLink to="/phonebook" className={cls}>电话簿</NavLink>
    <NavLink to="/notifications" className={cls}>通知中心 {notificationCount > 0 && <span className="badge">{notificationCount > 99 ? '99+' : notificationCount}</span>}</NavLink>
    {isAdmin && <NavLink to="/users" className={cls}>用户管理</NavLink>}
  </nav></aside>
}
