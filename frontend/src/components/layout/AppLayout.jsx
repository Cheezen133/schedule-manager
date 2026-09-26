import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Header from './Header'
import Sidebar from './Sidebar'
import MobileNavBar, { MobileNavProvider } from '../mobile/MobileNavBar'
import MobileTabBar, { isTabPath } from '../mobile/MobileTabBar'
import MobileNoticeTabs from '../mobile/MobileNoticeTabs'
import useIsMobile from '../../hooks/useIsMobile'
import { getUnreadCount } from '../../api/notifications'
import { getConversations } from '../../api/chat'

export default function AppLayout() {
  const location = useLocation()
  const isMobile = useIsMobile()
  const [notificationCount, setNotificationCount] = useState(0)
  const [chatUnreadCount, setChatUnreadCount] = useState(0)

  useEffect(() => {
    const loadNotifications = () => getUnreadCount()
      .then(response => setNotificationCount(response.data?.count || 0))
      .catch(() => {})
    const loadChats = () => getConversations()
      .then(response => setChatUnreadCount((response.data || []).filter(item => item.has_unread).length))
      .catch(() => {})
    const whenVisible = callback => { if (document.visibilityState === 'visible') callback() }

    loadNotifications()
    const inChatPage = location.pathname === '/chat' || location.pathname.startsWith('/chat/')
    if (!inChatPage) loadChats()
    const notificationTimer = setInterval(() => whenVisible(loadNotifications), 30000)
    const chatTimer = inChatPage ? null : setInterval(() => whenVisible(loadChats), 15000)
    const syncChatUnread = event => setChatUnreadCount(Number(event.detail) || 0)
    window.addEventListener('chat-unread-count', syncChatUnread)
    return () => {
      clearInterval(notificationTimer)
      if (chatTimer) clearInterval(chatTimer)
      window.removeEventListener('chat-unread-count', syncChatUnread)
    }
  }, [location.pathname])

  // 手机端：iOS 风格的顶部导航栏 + 底部标签栏，替代侧边栏和网页端顶栏
  if (isMobile) {
    const showTabBar = isTabPath(location.pathname)
    return (
      <MobileNavProvider>
        <div className={`app-layout m-layout${showTabBar ? ' m-has-tabbar' : ''}`}>
          <div className="main-content">
            <MobileNavBar />
            <main className="page-content m-page">
              {(location.pathname === '/notifications' || location.pathname === '/review') && <MobileNoticeTabs />}
              <Outlet />
            </main>
          </div>
          {showTabBar && <MobileTabBar notificationCount={notificationCount} chatUnreadCount={chatUnreadCount} />}
        </div>
      </MobileNavProvider>
    )
  }

  return (
    <div className="app-layout">
      <Sidebar notificationCount={notificationCount} chatUnreadCount={chatUnreadCount} />
      <div className="main-content">
        <Header notificationCount={notificationCount} setNotificationCount={setNotificationCount} />
        <main className="page-content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
