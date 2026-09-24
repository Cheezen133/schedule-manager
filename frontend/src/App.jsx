import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import ProtectedRoute from './components/common/ProtectedRoute'
import AppLayout from './components/layout/AppLayout'
import LoginPage from './pages/LoginPage'
import CreateSchedulePage from './pages/CreateSchedulePage'
import ScheduleDetailPage from './pages/ScheduleDetailPage'
import EditSchedulePage from './pages/EditSchedulePage'
import ReviewPage from './pages/ReviewPage'
import ContactsPage from './pages/ContactsPage'
import NotificationPage from './pages/NotificationPage'
import SearchResultPage from './pages/SearchResultPage'
import UserManagementPage from './pages/UserManagementPage'
import RegisterPage from './pages/RegisterPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import Loading from './components/common/Loading'

const CalendarPage = lazy(() => import('./pages/CalendarPage'))
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const MemoOverviewPage = lazy(() => import('./pages/MemoOverviewPage'))
const PersonalMemoPage = lazy(() => import('./pages/PersonalMemoPage'))
const TeamMemoPage = lazy(() => import('./pages/TeamMemoPage'))
const PersonalFilePage = lazy(() => import('./pages/PersonalFilePage'))
const PersonalCollectionPage = lazy(() => import('./pages/PersonalCollectionPage'))
const TeamSectionPage = lazy(() => import('./pages/TeamSectionPage'))
const PatientListPage = lazy(() => import('./pages/PatientListPage'))
const PatientDetailPage = lazy(() => import('./pages/PatientDetailPage'))
const ChatPage = lazy(() => import('./pages/ChatPage'))
const ChatContactsPage = lazy(() => import('./pages/ChatContactsPage'))
const lazyPage = page => <Suspense fallback={<Loading />}>{page}</Suspense>

export default function App() {
  const { loading } = useAuth()

  if (loading) {
    return <Loading text="加载中..." />
  }

  return (
    <Routes>
      {/* 登录页 — 已登录自动跳转 */}
      <Route path="/login" element={<LoginPage />} />

      {/* 注册页 */}
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />

      {/* 受保护页面 */}
      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<Navigate to="/profile/dashboard" replace />} />
        <Route path="/profile" element={<Navigate to="/profile/dashboard" replace />} />
        <Route path="/profile/dashboard" element={lazyPage(<DashboardPage />)} />
        <Route path="/profile/memos" element={lazyPage(<MemoOverviewPage />)} />
        <Route path="/profile/memos/personal" element={lazyPage(<PersonalMemoPage />)} />
        <Route path="/profile/memos/personal/cases" element={lazyPage(<PatientListPage />)} />
        <Route path="/profile/memos/personal/cases/:patientId" element={lazyPage(<PatientDetailPage />)} />
        <Route path="/profile/memos/personal/files" element={lazyPage(<PersonalFilePage />)} />
        <Route path="/profile/memos/personal/favorites" element={lazyPage(<PersonalCollectionPage kind="favorites" />)} />
        <Route path="/profile/memos/personal/shared-files" element={lazyPage(<PersonalCollectionPage kind="shared-files" />)} />
        <Route path="/profile/memos/team" element={lazyPage(<TeamMemoPage />)} />
        <Route path="/profile/memos/team/announcements" element={lazyPage(<TeamSectionPage kind="announcements" />)} />
        <Route path="/profile/memos/team/todos" element={lazyPage(<TeamSectionPage kind="todos" />)} />
        <Route path="/profile/memos/team/shared-files" element={lazyPage(<TeamSectionPage kind="shared-files" />)} />
        <Route path="/" element={lazyPage(<CalendarPage />)} />

        <Route path="/schedules/new" element={<CreateSchedulePage />} />

        <Route path="/schedules/:id" element={<ScheduleDetailPage />} />

        <Route path="/schedules/:id/edit" element={<EditSchedulePage />} />

        {/* 待审核页面：服务端按当前用户的审核权限筛选 */}
        <Route path="/review" element={<ReviewPage />} />

        <Route path="/contacts" element={lazyPage(<ChatContactsPage />)} />
        <Route path="/phonebook" element={<ContactsPage />} />
        <Route path="/notifications" element={<NotificationPage />} />
        <Route path="/search" element={<SearchResultPage />} />
        <Route path="/chat" element={lazyPage(<ChatPage />)} />
        <Route path="/chat/:conversationId" element={lazyPage(<ChatPage />)} />

        {/* 用户管理（管理员专属） */}
        <Route
          path="/users"
          element={
            <ProtectedRoute requiredRole="admin">
              <UserManagementPage />
            </ProtectedRoute>
          }
        />
      </Route>

      {/* 404 */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
