import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getNotifications, markNotificationRead, markAllNotificationsRead, deleteNotification } from '../api/notifications'
import Loading from '../components/common/Loading'
import { formatRelativeTime } from '../utils/dateTime'

export default function NotificationPage() {
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  const fetchData = async () => {
    try {
      const res = await getNotifications({ limit: 200 })
      setNotifications(res.data || [])
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }

  useEffect(() => {
    fetchData()
    const timer = setInterval(() => { if (document.visibilityState === 'visible') fetchData() }, 30000)
    return () => clearInterval(timer)
  }, [])

  const handleClick = async (notif) => {
    if (!notif.is_read) {
      await markNotificationRead(notif.id)
      setNotifications(prev =>
        prev.map(n => (n.id === notif.id ? { ...n, is_read: true } : n))
      )
    }
    // 聊天通知跳转到聊天页
    if (notif.related_url) {
      navigate(notif.related_url)
    } else if (notif.type === 'chat_message' || notif.type === 'friend_request') {
      navigate('/chat')
    } else if (notif.related_schedule_id) {
      navigate(`/schedules/${notif.related_schedule_id}`)
    }
  }

  const handleMarkRead = async (e, notif) => {
    e.stopPropagation()
    await markNotificationRead(notif.id)
    setNotifications(prev =>
      prev.map(n => (n.id === notif.id ? { ...n, is_read: true } : n))
    )
  }

  const handleDelete = async (e, notif) => {
    e.stopPropagation()
    await deleteNotification(notif.id)
    setNotifications(prev => prev.filter(n => n.id !== notif.id))
  }

  const handleMarkAllRead = async () => {
    await markAllNotificationsRead()
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
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

  const unreadCount = notifications.filter(n => !n.is_read).length

  if (loading) return <Loading />

  return (
    <div className="page-content">
      <div className="notification-page-header">
        <h2>🔔 通知中心</h2>
        {unreadCount > 0 && (
          <button className="btn-mark-all-read" onClick={handleMarkAllRead}>
            全部已读 ({unreadCount})
          </button>
        )}
      </div>
      <div className="notification-list">
        {notifications.length === 0 ? (
          <div className="empty-state">暂无通知</div>
        ) : (
          notifications.map(n => (
            <div
              key={n.id}
              className={`notification-card ${!n.is_read ? 'unread' : ''}`}
              onClick={() => handleClick(n)}
            >
              <div className="notification-icon">{getTypeEmoji(n.type)}</div>
              <div className="notification-body">
                <div className="notification-title">{n.title}</div>
                <div className="notification-text">{n.content}</div>
                <div className="notification-time">{formatRelativeTime(n.created_at)}</div>
              </div>
              {!n.is_read && <div className="notification-dot"></div>}
              <div className="notification-actions">
                {!n.is_read && (
                  <button className="notif-btn-read" onClick={(e) => handleMarkRead(e, n)} title="标记已读">
                    ✓
                  </button>
                )}
                <button className="notif-btn-delete" onClick={(e) => handleDelete(e, n)} title="删除">
                  ✕
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
