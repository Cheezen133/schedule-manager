import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { register } from '../api/auth'

export default function RegisterPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [nickname, setNickname] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const validatePassword = (pwd) => {
    if (pwd.length < 8) return '密码长度不能少于8位'
    if (pwd.length > 16) return '密码长度不能超过16位'
    if (!/[a-zA-Z]/.test(pwd)) return '密码必须包含字母'
    if (!/\d/.test(pwd)) return '密码必须包含数字'
    return null
  }

  const handleRegister = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (!username.trim() || username.trim().length < 3) {
      setError('用户名至少需要3个字符')
      return
    }

    const pwdErr = validatePassword(password)
    if (pwdErr) {
      setError(pwdErr)
      return
    }

    if (password !== confirmPassword) {
      setError('两次输入的密码不一致')
      return
    }

    if (!nickname.trim()) {
      setError('请输入显示名称')
      return
    }

    setLoading(true)
    try {
      await register(username.trim(), password, nickname.trim(), phone.trim() || null)
      setSuccess('注册成功！')
      // 不清除账号密码，方便用户记录
    } catch (err) {
      setError(err.userMessage ||'注册失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  // 密码强度指示
  const getPasswordStrength = () => {
    if (!password) return { level: 0, text: '', color: '#e5e7eb' }
    const hasLetter = /[a-zA-Z]/.test(password)
    const hasDigit = /\d/.test(password)
    const lenOk = password.length >= 8 && password.length <= 16
    const score = [hasLetter, hasDigit, lenOk].filter(Boolean).length
    const levels = [
      { text: '弱', color: '#dc2626' },
      { text: '中', color: '#d97706' },
      { text: '强', color: '#16a34a' },
    ]
    return { level: score, text: levels[score - 1]?.text || '', color: levels[score - 1]?.color || '#e5e7eb' }
  }

  const strength = getPasswordStrength()

  return (
    <div className="login-page">
      <div className="login-card" style={{ maxWidth: 440 }}>
        <h1>📝 注册新账号</h1>
        <p className="subtitle">创建账号，开始高效管理日程</p>

        {error && <div className="error-message">{error}</div>}
        {success && <div className="success-message">{success} <Link to="/login" style={{ color: '#4f46e5', fontWeight: 600 }}>立即登录 →</Link></div>}

        <form onSubmit={handleRegister}>
          <div className="form-group">
            <label>用户名 <span style={{ color: '#dc2626' }}>*</span></label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="3-50位字符"
              maxLength={50}
              autoFocus
            />
          </div>

          <div className="form-group">
            <label>显示名称 <span style={{ color: '#dc2626' }}>*</span></label>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="在系统中显示的名称"
              maxLength={50}
            />
          </div>

          <div className="form-group">
            <label>密码 <span style={{ color: '#dc2626' }}>*</span></label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="8-16位，需包含字母和数字"
              maxLength={16}
            />
            {password && (
              <div className="password-strength">
                <div className="strength-bar-track">
                  <div
                    className="strength-bar-fill"
                    style={{ width: `${(strength.level / 3) * 100}%`, backgroundColor: strength.color }}
                  ></div>
                </div>
                <span className="strength-text" style={{ color: strength.color }}>{strength.text}</span>
              </div>
            )}
            <p className="field-hint">8-16位，必须包含字母和数字</p>
          </div>

          <div className="form-group">
            <label>确认密码 <span style={{ color: '#dc2626' }}>*</span></label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="再次输入密码"
              maxLength={16}
            />
          </div>

          <div className="form-group">
            <label>手机号 <span style={{ color: '#9ca3af' }}>(选填)</span></label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
              placeholder="11位手机号"
              maxLength={11}
            />
          </div>

          <button
            type="submit"
            className="btn-primary"
            disabled={loading}
          >
            {loading ? '注册中...' : '注 册'}
          </button>
        </form>

        <p style={{ marginTop: '1.25rem', fontSize: '0.85rem', color: '#6b7280', textAlign: 'center' }}>
          已有账号？
          <Link to="/login" style={{ color: '#4f46e5', fontWeight: 500 }}>立即登录</Link>
        </p>
      </div>
    </div>
  )
}
