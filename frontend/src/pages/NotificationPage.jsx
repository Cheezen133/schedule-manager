import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { getNotifications, getUnreadCount, markNotificationRead, markAllNotificationsRead, deleteNotification } from '../api/notifications'
import Loading from '../components/common/Loading'
import { notify } from '../components/common/Ui'
import { useMobileNav } from '../components/mobile/MobileNavBar'
import useIsMobile from '../hooks/useIsMobile'
import { formatRelativeTime } from '../utils/dateTime'

export default function NotificationPage() {
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [unreadCount, setUnreadCount] = useState(0)
  const [markingAll, setMarkingAll] = useState(false)
  const changeVersion = useRef(0)
  const isMobile = useIsMobile()
  const navigate = useNavigate()

  const publishUnreadCount = count => {
    setUnreadCount(count)
    window.dispatchEvent(new CustomEvent('notification-unread-count', { detail: count }))
  }
  const refreshUnreadCount = async () => {
    const version = changeVersion.current
    const response = await getUnreadCount()
    if (version === changeVersion.current) publishUnreadCount(response.data?.count || 0)
  }
  const fetchData = async () => {
    const version = changeVersion.current
    try {
      const [res, count] = await Promise.all([getNotifications({ limit: 200 }), getUnreadCount()])
      if (version !== changeVersion.current) return
      setNotifications(res.data || [])
      publishUnreadCount(count.data?.count || 0)
    } catch { /* The next visible refresh retries. */ }
    finally { setLoading(false) }
  }

  useEffect(() => {
    fetchData()
    const timer = setInterval(() => { if (document.visibilityState === 'visible') fetchData() }, 30000)
    return () => clearInterval(timer)
  }, [])

  const handleClick = async (notif) => {
    if (!notif.is_read) {
      try {
        await markNotificationRead(notif.id)
        changeVersion.current += 1
        setNotifications(prev => prev.map(n => (n.id === notif.id ? { ...n, is_read: true } : n)))
      } catch (error) { notify(error.userMessage || '标记已读失败'); return }
      refreshUnreadCount().catch(() => {})
    }
    // 聊天通知跳转到聊天页
    if (notif.related_url) {
      navigate(notif.related_url)
    } else if (notif.type === 'chat_message' || notif.type === 'chat_mention' || notif.type === 'friend_request') {
      navigate('/chat')
    } else if (notif.related_schedule_id) {
      navigate(`/schedules/${notif.related_schedule_id}`)
    }
  }

  const handleMarkRead = async (e, notif) => {
    e.stopPropagation()
    try {
      await markNotificationRead(notif.id)
      changeVersion.current += 1
      setNotifications(prev => prev.map(n => (n.id === notif.id ? { ...n, is_read: true } : n)))
    } catch (error) { notify(error.userMessage || '标记已读失败'); return }
    refreshUnreadCount().catch(() => {})
  }

  const handleDelete = async (e, notif) => {
    e.stopPropagation()
    try {
      await deleteNotification(notif.id)
      changeVersion.current += 1
      setNotifications(prev => prev.filter(n => n.id !== notif.id))
    } catch (error) { notify(error.userMessage || '删除通知失败'); return }
    refreshUnreadCount().catch(() => {})
  }

  const handleMarkAllRead = async () => {
    if (markingAll) return
    setMarkingAll(true)
    try {
      await markAllNotificationsRead()
      changeVersion.current += 1
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
      publishUnreadCount(0)
    } catch (error) { notify(error.userMessage || '全部标记已读失败') }
    finally { setMarkingAll(false) }
  }

  useMobileNav({ rightLabel: isMobile && unreadCount > 0 ? markingAll ? '处理中…' : '全部已读' : null, onRight: handleMarkAllRead, rightDisabled: markingAll })

  const getTypeEmoji = (type) => {
    const map = {
      schedule_created: '📅',
      schedule_approved: '✅',
      schedule_rejected: '❌',
      reminder: '⏰',
      system: '📢',
      chat_message: '💬',
      chat_mention: '💬',
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

  if (loading) return <Loading />

  return (
    <div className="page-content">
      <div className="notification-page-header">
        <h2>🔔 通知中心</h2>
        {!isMobile && unreadCount > 0 && (
          <button className="btn-mark-all-read" onClick={handleMarkAllRead} disabled={markingAll}>
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
