import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { getCurrentUser } from '../api/auth'
import { setToken, getToken } from '../api/client'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  // 初始化：从 localStorage 恢复登录状态
  useEffect(() => {
    const token = getToken()
    const savedUser = localStorage.getItem('user')
    if (token && savedUser) {
      try {
        setUser(JSON.parse(savedUser))
      } catch {
        localStorage.removeItem('user')
        setToken(null)
      }
    }
    setLoading(false)

    // 如果已登录，从服务器刷新用户信息
    if (token) {
      getCurrentUser()
        .then((data) => {
          setUser(data)
          localStorage.setItem('user', JSON.stringify(data))
        })
        .catch(() => {
          setToken(null)
          setUser(null)
        })
    }
  }, [])

  const loginUser = useCallback((token, userInfo) => {
    setToken(token)
    localStorage.setItem('user', JSON.stringify(userInfo))
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
