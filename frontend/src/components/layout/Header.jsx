import { useState, useRef, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import SearchBar from '../common/SearchBar'
import NotificationBell from '../common/NotificationBell'
import { deleteMyAccount } from '../../api/users'

export default function Header({ notificationCount, setNotificationCount }) {
  const { user, isAdmin, isReader, isWriter, logoutUser } = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

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

  if (!user) return null

  const initials = user.nickname ? user.nickname.charAt(0).toUpperCase() : (user.username || '?').charAt(0).toUpperCase()

  const roleLabel = isAdmin ? '管理员' : isReader ? '阅读者' : '录入者'

  return (
    <header className="header">
      <div className="header-left">
        欢迎回来，{user.nickname}
      </div>
      <div className="header-center">
        <SearchBar />
      </div>
      <div className="header-right">
        <NotificationBell unreadCount={notificationCount} setUnreadCount={setNotificationCount} />

        {/* 右上角用户菜单 */}
        <div className="header-user-menu" ref={menuRef}>
          <div className="header-user-trigger" onClick={() => setMenuOpen(!menuOpen)}>
            <span className="header-user-avatar">{initials}</span>
            <span className="header-user-name">{user.nickname}</span>
            <span className={`header-role-tag ${isAdmin ? 'role-admin' : isReader ? 'role-reader' : 'role-writer'}`}>
              {roleLabel}
            </span>
            <span className="header-menu-arrow">{menuOpen ? '▲' : '▼'}</span>
          </div>

          {menuOpen && (
            <div className="header-dropdown">
              <div className="header-dropdown-user">
                <div className="header-dropdown-avatar">{initials}</div>
                <div>
                  <div className="header-dropdown-name">{user.nickname}</div>
                  <div className="header-dropdown-username">@{user.username}</div>
                  <div className={`header-dropdown-role ${isAdmin ? 'role-admin' : isReader ? 'role-reader' : 'role-writer'}`}>
                    {roleLabel}
                  </div>
                </div>
              </div>
              <div className="header-dropdown-divider" />
              <div className="header-dropdown-item" onClick={() => { setMenuOpen(false); navigate('/notifications') }}>
                <span>🔔</span> 通知中心
              </div>
              <div className="header-dropdown-divider" />
              <div className="header-dropdown-item" onClick={handleLogout}>
                <span>🚪</span> 退出登录
              </div>
              <div className="header-dropdown-item header-dropdown-danger" onClick={() => { setMenuOpen(false); handleDeleteAccount() }}>
                <span>🗑</span> {deleting ? '注销中...' : '注销账号'}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
