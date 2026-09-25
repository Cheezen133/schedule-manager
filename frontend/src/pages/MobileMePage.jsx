import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { deleteMyAccount } from '../api/users'
import useIsMobile from '../hooks/useIsMobile'

// 手机端「我的」：收纳底部标签栏之外的入口（与网页端侧边栏一致），以及退出登录、注销账号
const ICONS = {
  dashboard: <path d="M6 18v-5M12 18V6M18 18v-8" />,
  personalMemo: <><rect x="5.5" y="4" width="13" height="16" rx="2" /><path d="M9 9h6M9 13h6M9 17h3" /></>,
  teamMemo: <><circle cx="9" cy="9" r="2.8" /><path d="M3.8 18.5c.8-2.6 2.8-4 5.2-4s4.4 1.4 5.2 4" /><circle cx="16.5" cy="8.5" r="2.3" /><path d="M15.8 13.6c2 .1 3.7 1.4 4.4 3.6" /></>,
  contacts: <><circle cx="12" cy="9" r="3.4" /><path d="M5.5 19.5c1.1-3.2 3.6-5 6.5-5s5.4 1.8 6.5 5" /></>,
  phonebook: <path d="M7 4h2.6l1.3 3.7-1.8 1.2a10 10 0 0 0 5.9 5.9l1.2-1.8 3.8 1.3V17a2 2 0 0 1-2.1 2A15 15 0 0 1 5 6.1 2 2 0 0 1 7 4z" />,
  users: <><path d="M12 3.5l6.5 2.7v4.6c0 4.2-2.8 7.7-6.5 8.9-3.7-1.2-6.5-4.7-6.5-8.9V6.2z" /><path d="M9.2 12l2 2 3.6-3.8" /></>,
}

export default function MobileMePage() {
  const { user, isAdmin, isReader, logoutUser } = useAuth()
  const isMobile = useIsMobile()
  const navigate = useNavigate()
  const [deleting, setDeleting] = useState(false)

  // 网页端没有「我的」页，退回个人主页
  if (!isMobile) return <Navigate to="/profile/dashboard" replace />
  if (!user) return null

  const handleLogout = () => {
    logoutUser()
    navigate('/login')
  }

  const handleDeleteAccount = async () => {
    if (!window.confirm('确定要注销账号吗？此操作不可撤销，所有数据将被永久删除。')) return
    if (!window.confirm('再次确认：注销后所有日程、聊天记录和个人资料等数据将被清除。确定继续？')) return
    setDeleting(true)
    try {
      await deleteMyAccount()
      logoutUser()
      navigate('/login')
    } catch (err) {
      alert(err.userMessage || '注销失败')
    } finally {
      setDeleting(false)
    }
  }

  const initial = (user.nickname || user.username || '?').charAt(0).toUpperCase()
  const roleLabel = isAdmin ? '管理员' : isReader ? '阅读者' : '录入者'
  const groups = [
    [['/profile/dashboard', '仪表盘', 'dashboard', '#007aff'], ['/profile/memos/personal', '个人备忘录', 'personalMemo', '#ff9500'], ['/profile/memos/team', '团队群聊备忘录', 'teamMemo', '#34c759']],
    [['/contacts', '联系人', 'contacts', '#5856d6'], ['/phonebook', '电话簿', 'phonebook', '#30b0c7']],
    ...(isAdmin ? [[['/users', '用户管理', 'users', '#8e8e93']]] : []),
  ]

  return <div className="m-me">
    <section className="m-list">
      <div className="m-profile">
        <span className="m-avatar">{initial}</span>
        <div>
          <div className="m-profile-name">{user.nickname}</div>
          <div className="m-profile-sub">@{user.username} · {roleLabel}</div>
        </div>
      </div>
    </section>
    {groups.map((items, index) => <section className="m-list" key={index}>{items.map(([to, label, icon, color]) =>
      <Link key={to} to={to} className="m-cell m-cell-icon">
        <span className="m-icon-tile" style={{ background: color }}><svg viewBox="0 0 24 24" aria-hidden="true">{ICONS[icon]}</svg></span>
        <span className="m-cell-label">{label}</span>
        <svg className="m-chevron" viewBox="0 0 8 14" aria-hidden="true"><path d="M1 1l6 6-6 6" /></svg>
      </Link>)}</section>)}
    <section className="m-list">
      <button type="button" className="m-cell m-cell-danger" onClick={handleLogout}>退出登录</button>
      <button type="button" className="m-cell m-cell-danger" onClick={handleDeleteAccount} disabled={deleting}>{deleting ? '注销中…' : '注销账号'}</button>
    </section>
  </div>
}
