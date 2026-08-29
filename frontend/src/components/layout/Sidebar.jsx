import { useState, useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { getUnreadCount } from '../../api/notifications'
import { getPendingSchedules } from '../../api/schedules'

export default function Sidebar() {
  const { isAdmin, isWriter } = useAuth()
  const location = useLocation()
  const [unreadChat, setUnreadChat] = useState(0)
  const [pendingReviewCount, setPendingReviewCount] = useState(0)
  const [profileOpen, setProfileOpen] = useState(location.pathname.startsWith('/profile'))
  const [memosOpen, setMemosOpen] = useState(location.pathname.startsWith('/profile/memos'))
  useEffect(() => {
    const load = () => getUnreadCount().then(response => setUnreadChat(response.data?.count || 0)).catch(() => {})
    load(); const timer = setInterval(() => { if (document.visibilityState === 'visible') load() }, 30000)
    return () => clearInterval(timer)
  }, [])
  useEffect(() => {
    const load = () => getPendingSchedules().then(response => setPendingReviewCount((response.data || []).length)).catch(() => setPendingReviewCount(0))
    load(); const timer = setInterval(() => { if (document.visibilityState === 'visible') load() }, 10000)
    return () => clearInterval(timer)
  }, [])
  useEffect(() => { if (location.pathname.startsWith('/profile')) setProfileOpen(true) }, [location.pathname])
  useEffect(() => { if (location.pathname.startsWith('/profile/memos')) setMemosOpen(true) }, [location.pathname])
  const cls = ({ isActive }) => isActive ? 'active' : ''
  return <aside className="sidebar"><div className="sidebar-logo">📅 日程管理系统</div><nav className="sidebar-nav">
    <div className={`sidebar-menu-group ${profileOpen ? 'open' : ''}`}><button className={`sidebar-parent ${location.pathname.startsWith('/profile') ? 'active' : ''}`} type="button" onClick={() => setProfileOpen(open => !open)}><span>个人主页</span><span className="sidebar-caret">⌄</span></button><div className="sidebar-subnav"><NavLink to="/profile/dashboard" className={cls}>仪表盘</NavLink><div className={`sidebar-menu-group sidebar-nested ${memosOpen ? 'open' : ''}`}><button className={`sidebar-parent ${location.pathname.startsWith('/profile/memos') ? 'active' : ''}`} type="button" onClick={() => setMemosOpen(open => !open)}><span>备忘录</span><span className="sidebar-caret">⌄</span></button><div className="sidebar-subnav"><NavLink to="/profile/memos/personal" className={cls}>个人备忘录</NavLink><NavLink to="/profile/memos/team" className={cls}>团队群聊备忘录</NavLink></div></div></div></div>
    <NavLink to="/" end className={cls}>日历视图</NavLink>
    {(isAdmin || isWriter) && <NavLink to="/schedules/new" className={cls}>新建日程</NavLink>}
    <NavLink to="/review" className={cls}>待审核 {pendingReviewCount > 0 && <span className="badge">{pendingReviewCount > 99 ? '99+' : pendingReviewCount}</span>}</NavLink>
    {isAdmin && <NavLink to="/categories" className={cls}>分类管理</NavLink>}
    <NavLink to="/chat" className={cls}>消息 {unreadChat > 0 && <span className="badge">{unreadChat > 99 ? '99+' : unreadChat}</span>}</NavLink>
    <NavLink to="/contacts" className={cls}>联系人</NavLink><NavLink to="/notifications" className={cls}>通知中心 {unreadChat > 0 && <span className="badge">{unreadChat > 99 ? '99+' : unreadChat}</span>}</NavLink>
    {isAdmin && <NavLink to="/users" className={cls}>用户管理</NavLink>}
  </nav></aside>
}
