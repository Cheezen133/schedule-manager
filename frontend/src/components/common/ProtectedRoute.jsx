import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import Loading from './Loading'

const ROLE_NAMES = { admin: '管理员', reader: '阅读者', writer: '录入者' }

/**
 * 受保护路由组件
 * 未登录 → 跳转登录页
 * requiredRole: 精确匹配单一角色
 * requiredAnyRole: 满足任一角色即可 (数组)
 */
export default function ProtectedRoute({ children, requiredRole, requiredAnyRole }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return <Loading />
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  // requiredAnyRole 优先级更高
  if (requiredAnyRole && !requiredAnyRole.includes(user.role)) {
    const names = requiredAnyRole.map((r) => ROLE_NAMES[r] || r).join(' / ')
    return <ForbiddenPage names={names} />
  }

  if (requiredRole && user.role !== requiredRole) {
    const name = ROLE_NAMES[requiredRole] || requiredRole
    return <ForbiddenPage names={name} />
  }

  return children
}

function ForbiddenPage({ names }) {
  return (
    <div style={{ padding: '3rem', textAlign: 'center' }}>
      <h2>权限不足</h2>
      <p style={{ color: '#6b7280', marginTop: '0.5rem' }}>
        此页面仅限「{names}」访问
      </p>
      <a href="/" style={{ color: '#4f46e5', marginTop: '1rem', display: 'inline-block' }}>
        返回首页
      </a>
    </div>
  )
}
