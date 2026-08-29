import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import ProtectedRoute from './components/common/ProtectedRoute'
import AppLayout from './components/layout/AppLayout'
import LoginPage from './pages/LoginPage'
import CalendarPage from './pages/CalendarPage'
import CreateSchedulePage from './pages/CreateSchedulePage'
import ScheduleDetailPage from './pages/ScheduleDetailPage'
import EditSchedulePage from './pages/EditSchedulePage'
import ReviewPage from './pages/ReviewPage'
import ContactsPage from './pages/ContactsPage'
import CategoriesPage from './pages/CategoriesPage'
import DashboardPage from './pages/DashboardPage'
import NotificationPage from './pages/NotificationPage'
import SearchResultPage from './pages/SearchResultPage'
import UserManagementPage from './pages/UserManagementPage'
import RegisterPage from './pages/RegisterPage'
import PersonalMemoPage from './pages/PersonalMemoPage'
import MemoOverviewPage from './pages/MemoOverviewPage'
import TeamMemoPage from './pages/TeamMemoPage'
import PersonalFilePage from './pages/PersonalFilePage'
import PersonalCollectionPage from './pages/PersonalCollectionPage'
import TeamSectionPage from './pages/TeamSectionPage'
import PatientListPage from './pages/PatientListPage'
import PatientDetailPage from './pages/PatientDetailPage'
import ChatPage from './pages/ChatPage'
import Loading from './components/common/Loading'

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
        <Route path="/profile/dashboard" element={<DashboardPage />} />
        <Route path="/profile/memos" element={<MemoOverviewPage />} />
        <Route path="/profile/memos/personal" element={<PersonalMemoPage />} />
        <Route path="/profile/memos/personal/cases" element={<PatientListPage />} />
        <Route path="/profile/memos/personal/cases/:patientId" element={<PatientDetailPage />} />
        <Route path="/profile/memos/personal/files" element={<PersonalFilePage />} />
        <Route path="/profile/memos/personal/favorites" element={<PersonalCollectionPage kind="favorites" />} />
        <Route path="/profile/memos/personal/shared-files" element={<PersonalCollectionPage kind="shared-files" />} />
        <Route path="/profile/memos/team" element={<TeamMemoPage />} />
        <Route path="/profile/memos/team/announcements" element={<TeamSectionPage kind="announcements" />} />
        <Route path="/profile/memos/team/todos" element={<TeamSectionPage kind="todos" />} />
        <Route path="/profile/memos/team/shared-files" element={<TeamSectionPage kind="shared-files" />} />
        <Route path="/" element={<CalendarPage />} />

        {/* 新建日程（管理员 + 录入者） */}
        <Route
          path="/schedules/new"
          element={
            <ProtectedRoute requiredAnyRole={['admin', 'writer']}>
              <CreateSchedulePage />
            </ProtectedRoute>
          }
        />

        <Route path="/schedules/:id" element={<ScheduleDetailPage />} />

        {/* 编辑日程（管理员 + 录入者） */}
        <Route
          path="/schedules/:id/edit"
          element={
            <ProtectedRoute requiredAnyRole={['admin', 'writer']}>
              <EditSchedulePage />
            </ProtectedRoute>
          }
        />

        {/* 待审核页面：服务端按当前用户的审核权限筛选 */}
        <Route path="/review" element={<ReviewPage />} />

        {/* 分类管理（管理员专属） */}
        <Route
          path="/categories"
          element={
            <ProtectedRoute requiredRole="admin">
              <CategoriesPage />
            </ProtectedRoute>
          }
        />

        <Route path="/contacts" element={<ContactsPage />} />
        <Route path="/notifications" element={<NotificationPage />} />
        <Route path="/search" element={<SearchResultPage />} />
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/chat/:conversationId" element={<ChatPage />} />

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
