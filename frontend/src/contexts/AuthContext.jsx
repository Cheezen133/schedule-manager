import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { getCurrentUser } from '../api/auth'
import { setToken, getToken, getStoredUser, setStoredUser } from '../api/client'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  // 初始化：根据登录方式从 sessionStorage 或 localStorage 恢复登录状态。
  useEffect(() => {
    let active = true
    const token = getToken()
    const savedUser = getStoredUser()
    if (token && savedUser) {
      try {
        setUser(JSON.parse(savedUser))
      } catch {
        setToken(null)
      }
    }

    // 如果已登录，从服务器刷新用户信息
    if (token) {
      getCurrentUser()
        .then((data) => {
          if (!active) return
          setUser(data)
          setStoredUser(data)
        })
        .catch((error) => {
          if (!active) return
          // 只有认证失败才清除长期登录；断网或服务异常时保留凭证。
          if (error.response?.status === 401) {
            setToken(null)
            setUser(null)
          }
        })
        .finally(() => {
          if (active) setLoading(false)
        })
    } else {
      setLoading(false)
    }

    const handleStorage = (event) => {
      // localStorage 只用于自动登录；在一个标签页退出时同步退出其他标签页。
      if (event.storageArea === localStorage && event.key === 'access_token' && event.newValue === null) {
        setToken(null)
        setUser(null)
      }
    }
    window.addEventListener('storage', handleStorage)
    return () => {
      active = false
      window.removeEventListener('storage', handleStorage)
    }
  }, [])

  const loginUser = useCallback((token, userInfo, persistent = false) => {
    setToken(token, persistent)
    setStoredUser(userInfo)
    setUser(userInfo)
  }, [])

  const logoutUser = useCallback(() => {
    setToken(null)
    setUser(null)
  }, [])

  const isAdmin = user?.role === 'admin'
  const isReader = user?.role === 'reader'
  const isWriter = user?.role === 'writer'

  return (
    <AuthContext.Provider value={{ user, loading, isAdmin, isReader, isWriter, loginUser, logoutUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return ctx
}
