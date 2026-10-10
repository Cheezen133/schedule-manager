import { useEffect, useState } from 'react'
import { getUsers, updateUserRole, toggleUserActive, updateUserNickname, listInviteCodes, createInviteCode, toggleInviteCode } from '../api/users'
import { useAuth } from '../contexts/AuthContext'
import Loading from '../components/common/Loading'
import { Button, ConfirmDialog, FilterBar } from '../components/common/Ui'
import { formatBeijingDate } from '../utils/dateTime'

const ROLE_MAP = { admin: '管理员', reader: '阅读者', writer: '录入者' }
const ROLE_COLORS = { admin: 'role-admin', reader: 'role-reader', writer: 'role-writer' }

// 邀请码管理：生成、查看用量、停用/启用
function InviteCodesPanel() {
  const [codes, setCodes] = useState([])
  const [maxUses, setMaxUses] = useState(1)
  const [note, setNote] = useState('')
  const [generated, setGenerated] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const load = async () => {
    try { const res = await listInviteCodes(); setCodes(res.data || []); setError('') } catch { setError('邀请码列表加载失败') }
  }
  useEffect(() => { load() }, [])
  const generate = async () => {
    setBusy(true)
    try {
      const res = await createInviteCode(Number(maxUses) || 1, note.trim() || null)
      setGenerated(res.data); setNote(''); load()
    } catch (err) { setError(err.userMessage || '生成失败') } finally { setBusy(false) }
  }
  const toggle = async id => {
    try { await toggleInviteCode(id); load() } catch (err) { setError(err.userMessage || '操作失败') }
  }
  return <div className="invite-panel" style={{ margin: '1.25rem 0', padding: '1rem 1.25rem', border: '1px solid #e5e7eb', borderRadius: 10 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
      <strong style={{ fontSize: '1rem' }}>注册邀请码</strong>
      <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>新成员注册需持有效邀请码</span>
    </div>
    {error && <div className="error-message">{error}</div>}
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
      <label style={{ fontSize: '0.85rem', color: '#374151' }}>可用次数
        <select value={maxUses} onChange={event => setMaxUses(event.target.value)} style={{ marginLeft: 6 }}>
          {[1, 3, 5, 10, 20, 50].map(n => <option key={n} value={n}>{n} 次</option>)}
        </select>
      </label>
      <input value={note} onChange={event => setNote(event.target.value)} placeholder="备注（选填，如：发给张医生）" maxLength={100}
        style={{ flex: '1 1 200px', minWidth: 180, padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6 }} />
      <Button variant="primary" onClick={generate} disabled={busy}>{busy ? '生成中…' : '生成邀请码'}</Button>
    </div>
    {generated && <div className="success-message" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      新邀请码：<strong style={{ fontSize: '1.1rem', letterSpacing: 2 }}>{generated.code}</strong>
      <span>（可用 {generated.max_uses} 次）</span>
      <Button variant="text" onClick={() => navigator.clipboard?.writeText(generated.code).then(() => setGenerated({ ...generated, copied: true }))}>
        {generated.copied ? '已复制 ✓' : '复制'}
      </Button>
    </div>}
    {codes.length > 0 && <table className="user-table"><thead><tr><th>邀请码</th><th>用量</th><th>备注</th><th>状态</th><th>创建时间</th><th>操作</th></tr></thead>
      <tbody>{codes.map(c => <tr key={c.id}>
        <td style={{ letterSpacing: 1, fontFamily: 'monospace' }}>{c.code}</td>
        <td>{c.used_count} / {c.max_uses}</td>
        <td>{c.note || '—'}</td>
        <td>{c.disabled ? '已停用' : c.is_available ? '可用' : '已用完'}</td>
        <td>{c.created_at ? formatBeijingDate(c.created_at) : '—'}</td>
        <td>{!c.disabled && c.is_available && <Button variant="danger" onClick={() => toggle(c.id)}>停用</Button>}
            {c.disabled && <Button variant="secondary" onClick={() => toggle(c.id)}>启用</Button>}</td>
      </tr>)}</tbody></table>}
    {!codes.length && <p style={{ fontSize: '0.85rem', color: '#9ca3af' }}>还没有生成过邀请码。</p>}
  </div>
}

export default function UserManagementPage() {
  const { user: me } = useAuth()
  const [users, setUsers] = useState([]), [total, setTotal] = useState(0), [page, setPage] = useState(1), [loading, setLoading] = useState(true)
  const [roleFilter, setRoleFilter] = useState(''), [editingNickname, setEditingNickname] = useState(null), [newNickname, setNewNickname] = useState(''), [pendingAction, setPendingAction] = useState(null), [error, setError] = useState('')
  const fetchUsers = async (nextPage = 1) => {
    try { setLoading(true); const params = { page: nextPage, page_size: 20, ...(roleFilter ? { role: roleFilter } : {}) }; const res = await getUsers(params); setUsers(res.data?.items || []); setTotal(res.data?.total || 0); setError('') } catch { setError('无法加载用户列表。') } finally { setLoading(false) }
  }
  useEffect(() => { fetchUsers(page) }, [page, roleFilter])
  const executeAction = async () => {
    if (!pendingAction) return
    try {
      if (pendingAction.type === 'role') await updateUserRole(pendingAction.userId, pendingAction.role)
      if (pendingAction.type === 'active') await toggleUserActive(pendingAction.userId)
      setPendingAction(null); fetchUsers(page)
    } catch (err) { setError(err.userMessage || '操作失败，请稍后重试。') }
  }
  const saveNickname = async userId => {
    if (!newNickname.trim()) return
    try { await updateUserNickname(userId, newNickname.trim()); setEditingNickname(null); fetchUsers(page) } catch (err) { setError(err.userMessage || '保存失败。') }
  }
  const totalPages = Math.ceil(total / 20)
  const formatDate = value => value ? formatBeijingDate(value) : '—'
  if (loading && !users.length) return <Loading />
  return <div className="page-content"><div className="page-heading"><div><span>系统管理</span><h2>用户管理</h2></div></div>
    <FilterBar className="user-filter-bar"><label>角色<select value={roleFilter} onChange={event => { setRoleFilter(event.target.value); setPage(1) }}><option value="">全部角色</option><option value="admin">管理员</option><option value="reader">阅读者</option><option value="writer">录入者</option></select></label><span className="user-total">共 {total} 人</span></FilterBar>
    {me?.role === 'admin' && <InviteCodesPanel />}
    {error && <div className="error-message">{error}</div>}
    <div className="user-table-wrapper"><table className="user-table"><thead><tr><th>ID</th><th>用户名</th><th>昵称</th><th>角色</th><th>状态</th><th>注册时间</th><th>操作</th></tr></thead><tbody>{users.map(user => <tr key={user.id} className={!user.is_active ? 'user-inactive' : ''}><td>{user.id}</td><td>{user.username || user.phone || '—'}</td><td>{editingNickname === user.id ? <div className="nickname-edit-row"><input value={newNickname} onChange={event => setNewNickname(event.target.value)} autoFocus /><Button variant="primary" onClick={() => saveNickname(user.id)}>保存</Button><Button onClick={() => setEditingNickname(null)}>取消</Button></div> : <span className="nickname-display">{user.nickname || '—'}<Button variant="text" onClick={() => { setEditingNickname(user.id); setNewNickname(user.nickname || '') }}>编辑</Button></span>}</td><td>{user.id === me?.id ? <span className={`role-badge ${ROLE_COLORS[user.role]}`}>{ROLE_MAP[user.role]}</span> : <select value={user.role} onChange={event => setPendingAction({ type: 'role', userId: user.id, role: event.target.value, name: user.nickname || user.username })}><option value="admin">管理员</option><option value="reader">阅读者</option><option value="writer">录入者</option></select>}</td><td><span className={`user-status-badge ${user.is_active ? 'active' : 'inactive'}`}>{user.is_active ? '正常' : '已禁用'}</span></td><td>{formatDate(user.created_at)}</td><td>{user.id !== me?.id && <Button variant={user.is_active ? 'danger' : 'secondary'} onClick={() => setPendingAction({ type: 'active', userId: user.id, active: user.is_active, name: user.nickname || user.username })}>{user.is_active ? '禁用' : '启用'}</Button>}</td></tr>)}</tbody></table></div>
    {totalPages > 1 && <div className="pagination"><Button disabled={page <= 1} onClick={() => setPage(value => value - 1)}>上一页</Button><span>第 {page}/{totalPages} 页</span><Button disabled={page >= totalPages} onClick={() => setPage(value => value + 1)}>下一页</Button></div>}
    <ConfirmDialog open={!!pendingAction} danger={pendingAction?.type === 'active' && pendingAction.active} title={pendingAction?.type === 'role' ? '修改用户角色' : pendingAction?.active ? '禁用用户' : '启用用户'} message={pendingAction?.type === 'role' ? `确定将“${pendingAction?.name || ''}”设为${ROLE_MAP[pendingAction?.role] || ''}吗？` : `确定${pendingAction?.active ? '禁用' : '启用'}“${pendingAction?.name || ''}”吗？`} confirmText="确认" onCancel={() => { setPendingAction(null); fetchUsers(page) }} onConfirm={executeAction} />
  </div>
}
