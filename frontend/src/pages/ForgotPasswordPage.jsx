import { useState } from 'react'
import { Link } from 'react-router-dom'
import { resetRecoveredPassword, verifyPasswordRecovery } from '../api/auth'

function validatePassword(password) {
  if (password.length < 8) return '密码长度不能少于8位'
  if (password.length > 16) return '密码长度不能超过16位'
  if (!/[a-zA-Z]/.test(password)) return '密码必须包含字母'
  if (!/\d/.test(password)) return '密码必须包含数字'
  return null
}

export default function ForgotPasswordPage() {
  const [step, setStep] = useState(1)
  const [username, setUsername] = useState('')
  const [nickname, setNickname] = useState('')
  const [recoveryToken, setRecoveryToken] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const verifyIdentity = async event => {
    event.preventDefault()
    setError('')
    const cleanUsername = username.trim()
    const cleanNickname = nickname.trim()
    if (!cleanUsername || !cleanNickname) {
      setError('请输入用户名和当前系统显示昵称')
      return
    }
    setLoading(true)
    try {
      const result = await verifyPasswordRecovery(cleanUsername, cleanNickname)
      setRecoveryToken(result.data?.recovery_token || '')
      setStep(2)
    } catch (requestError) {
      setError(requestError.userMessage || '用户名或显示昵称不正确')
    } finally {
      setLoading(false)
    }
  }

  const resetPassword = async event => {
    event.preventDefault()
    setError('')
    const passwordError = validatePassword(password)
    if (passwordError) { setError(passwordError); return }
    if (password !== confirmPassword) { setError('两次输入的密码不一致'); return }
    if (!recoveryToken) { setError('验证已失效，请返回上一步重新验证'); return }
    setLoading(true)
    try {
      await resetRecoveredPassword(recoveryToken, password)
      setRecoveryToken('')
      setPassword('')
      setConfirmPassword('')
      setSuccess(true)
    } catch (requestError) {
      setError(requestError.userMessage || '密码重置失败，请重新验证')
    } finally {
      setLoading(false)
    }
  }

  const restartVerification = () => {
    setStep(1)
    setRecoveryToken('')
    setPassword('')
    setConfirmPassword('')
    setError('')
  }

  return (
    <div className="login-page">
      <div className="login-card" style={{ maxWidth: 440 }}>
        <h1>🔑 找回密码</h1>
        <p className="subtitle">{success ? '密码已经重置' : step === 1 ? '验证账号信息' : '设置新的登录密码'}</p>

        {error && <div className="error-message">{error}</div>}
        {success ? (
          <div>
            <div className="success-message">密码重置成功，请使用新密码登录。</div>
            <Link className="btn-primary" to="/login" style={{ display: 'block', marginTop: '1rem', textAlign: 'center', textDecoration: 'none' }}>返回登录</Link>
          </div>
        ) : step === 1 ? (
          <form onSubmit={verifyIdentity}>
            <div className="form-group">
              <label>用户名</label>
              <input autoFocus value={username} onChange={event => setUsername(event.target.value)} maxLength={50} placeholder="请输入登录用户名" />
            </div>
            <div className="form-group">
              <label>当前系统显示昵称</label>
              <input value={nickname} onChange={event => setNickname(event.target.value)} maxLength={50} placeholder="请输入账号当前显示的昵称" />
              <p className="field-hint">昵称必须与系统中当前显示的名称完全一致。</p>
            </div>
            <button className="btn-primary" disabled={loading}>{loading ? '验证中...' : '下一步'}</button>
          </form>
        ) : (
          <form onSubmit={resetPassword}>
            <div className="success-message">账号信息验证成功，临时凭证将在 10 分钟后失效。</div>
            <div className="form-group">
              <label>新密码</label>
              <input autoFocus type="password" value={password} onChange={event => setPassword(event.target.value)} maxLength={16} placeholder="8-16位，必须包含字母和数字" />
            </div>
            <div className="form-group">
              <label>确认新密码</label>
              <input type="password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} maxLength={16} placeholder="再次输入新密码" />
            </div>
            <button className="btn-primary" disabled={loading}>{loading ? '重置中...' : '重置密码'}</button>
            <button type="button" className="btn-cancel" onClick={restartVerification} style={{ width: '100%', marginTop: '0.75rem' }}>返回上一步</button>
          </form>
        )}

        {!success && <p style={{ marginTop: '1.25rem', fontSize: '0.85rem', color: '#6b7280', textAlign: 'center' }}><Link to="/login" style={{ color: '#4f46e5', fontWeight: 500 }}>返回登录</Link></p>}
      </div>
    </div>
  )
}
