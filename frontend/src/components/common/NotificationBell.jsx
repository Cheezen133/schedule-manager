import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { getNotifications, markAllNotificationsRead, markNotificationRead, deleteNotification } from '../../api/notifications'
import { formatRelativeTime } from '../../utils/dateTime'

export default function NotificationBell({ unreadCount = 0, setUnreadCount }) {
  const [notifications, setNotifications] = useState([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [loading, setLoading] = useState(false)
  const dropdownRef = useRef(null)
  const navigate = useNavigate()

  const fetchNotifications = async () => {
    try {
      setLoading(true)
      const res = await getNotifications({ limit: 10 })
      setNotifications(res.data || [])
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }

  // 点击外部关闭下拉
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleToggle = () => {
    if (!showDropdown) {
      fetchNotifications()
    }
    setShowDropdown(!showDropdown)
  }

  const handleMarkAllRead = async () => {
    await markAllNotificationsRead()
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
    setUnreadCount(0)
  }

  const handleClickNotif = async (notif) => {
    if (!notif.is_read) {
      await markNotificationRead(notif.id)
      setNotifications(prev =>
        prev.map(n => (n.id === notif.id ? { ...n, is_read: true } : n))
      )
      setUnreadCount(prev => Math.max(0, prev - 1))
    }
    setShowDropdown(false)
    // 聊天通知跳转到聊天页
    if (notif.related_url) {
      navigate(notif.related_url)
    } else if (notif.type === 'chat_message' || notif.type === 'friend_request') {
      navigate('/chat')
    } else if (notif.related_schedule_id) {
      navigate(`/schedules/${notif.related_schedule_id}`)
    } else {
      navigate('/notifications')
    }
  }

  const handleDeleteNotif = async (e, notif) => {
    e.stopPropagation()
    await deleteNotification(notif.id)
    if (!notif.is_read) setUnreadCount(prev => Math.max(0, prev - 1))
    setNotifications(prev => prev.filter(n => n.id !== notif.id))
  }

  const getTypeEmoji = (type) => {
    const map = {
      schedule_created: '📅',
      schedule_approved: '✅',
      schedule_rejected: '❌',
      reminder: '⏰',
      system: '📢',
      chat_message: '💬',
      friend_request: '👥',
      management_request: '📅',
      management_approved: '✅',
      management_rejected: '⛔',
      management_revoked: '🔒',
      group_announcement: '📢',
      group_todo: '☑️',
    }
    return map[type] || '🔔'
  }

  return (
    <div className="notification-bell-wrapper" ref={dropdownRef}>
      <button className="notification-bell" onClick={handleToggle} title="通知">
        🔔
        {unreadCount > 0 && (
          <span className="notification-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
        )}
      </button>

      {showDropdown && (
        <div className="notification-dropdown">
          <div className="notification-dropdown-header">
            <span>通知</span>
            {unreadCount > 0 && (
              <button className="btn-mark-all-read" onClick={handleMarkAllRead}>
                全部已读
              </button>
            )}
          </div>
          <div className="notification-dropdown-body">
            {loading ? (
              <div className="notification-empty">加载中...</div>
            ) : notifications.length === 0 ? (
              <div className="notification-empty">暂无通知</div>
            ) : (
              notifications.map(n => (
                <div
                  key={n.id}
                  className={`notification-item ${!n.is_read ? 'unread' : ''}`}
                  onClick={() => handleClickNotif(n)}
                >
                  <span className="notification-icon">{getTypeEmoji(n.type)}</span>
                  <div className="notification-content">
                    <div className="notification-title">{n.title}</div>
                    <div className="notification-text">{n.content}</div>
                    <div className="notification-time">{formatRelativeTime(n.created_at)}</div>
                  </div>
                  <button className="notif-bell-delete" onClick={(e) => handleDeleteNotif(e, n)} title="删除">✕</button>
                </div>
              ))
            )}
          </div>
          <div
            className="notification-dropdown-footer"
            onClick={() => { setShowDropdown(false); navigate('/notifications') }}
          >
            查看全部通知
          </div>
        </div>
      )}
    </div>
  )
}
