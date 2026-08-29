import { useEffect, useState } from 'react'
import { getUsers, updateUserRole, toggleUserActive, updateUserNickname } from '../api/users'
import { useAuth } from '../contexts/AuthContext'
import Loading from '../components/common/Loading'
import { Button, ConfirmDialog, FilterBar } from '../components/common/Ui'

const ROLE_MAP = { admin: '管理员', reader: '阅读者', writer: '录入者' }
const ROLE_COLORS = { admin: 'role-admin', reader: 'role-reader', writer: 'role-writer' }

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
  const formatDate = value => value ? new Date(value).toLocaleDateString('zh-CN') : '—'
  if (loading && !users.length) return <Loading />
  return <div className="page-content"><div className="page-heading"><div><span>系统管理</span><h2>用户管理</h2></div></div>
    <FilterBar className="user-filter-bar"><label>角色<select value={roleFilter} onChange={event => { setRoleFilter(event.target.value); setPage(1) }}><option value="">全部角色</option><option value="admin">管理员</option><option value="reader">阅读者</option><option value="writer">录入者</option></select></label><span className="user-total">共 {total} 人</span></FilterBar>
    {error && <div className="error-message">{error}</div>}
    <div className="user-table-wrapper"><table className="user-table"><thead><tr><th>ID</th><th>用户名</th><th>昵称</th><th>角色</th><th>状态</th><th>注册时间</th><th>操作</th></tr></thead><tbody>{users.map(user => <tr key={user.id} className={!user.is_active ? 'user-inactive' : ''}><td>{user.id}</td><td>{user.username || user.phone || '—'}</td><td>{editingNickname === user.id ? <div className="nickname-edit-row"><input value={newNickname} onChange={event => setNewNickname(event.target.value)} autoFocus /><Button variant="primary" onClick={() => saveNickname(user.id)}>保存</Button><Button onClick={() => setEditingNickname(null)}>取消</Button></div> : <span className="nickname-display">{user.nickname || '—'}<Button variant="text" onClick={() => { setEditingNickname(user.id); setNewNickname(user.nickname || '') }}>编辑</Button></span>}</td><td>{user.id === me?.id ? <span className={`role-badge ${ROLE_COLORS[user.role]}`}>{ROLE_MAP[user.role]}</span> : <select value={user.role} onChange={event => setPendingAction({ type: 'role', userId: user.id, role: event.target.value, name: user.nickname || user.username })}><option value="admin">管理员</option><option value="reader">阅读者</option><option value="writer">录入者</option></select>}</td><td><span className={`user-status-badge ${user.is_active ? 'active' : 'inactive'}`}>{user.is_active ? '正常' : '已禁用'}</span></td><td>{formatDate(user.created_at)}</td><td>{user.id !== me?.id && <Button variant={user.is_active ? 'danger' : 'secondary'} onClick={() => setPendingAction({ type: 'active', userId: user.id, active: user.is_active, name: user.nickname || user.username })}>{user.is_active ? '禁用' : '启用'}</Button>}</td></tr>)}</tbody></table></div>
    {totalPages > 1 && <div className="pagination"><Button disabled={page <= 1} onClick={() => setPage(value => value - 1)}>上一页</Button><span>第 {page}/{totalPages} 页</span><Button disabled={page >= totalPages} onClick={() => setPage(value => value + 1)}>下一页</Button></div>}
    <ConfirmDialog open={!!pendingAction} danger={pendingAction?.type === 'active' && pendingAction.active} title={pendingAction?.type === 'role' ? '修改用户角色' : pendingAction?.active ? '禁用用户' : '启用用户'} message={pendingAction?.type === 'role' ? `确定将“${pendingAction?.name || ''}”设为${ROLE_MAP[pendingAction?.role] || ''}吗？` : `确定${pendingAction?.active ? '禁用' : '启用'}“${pendingAction?.name || ''}”吗？`} confirmText="确认" onCancel={() => { setPendingAction(null); fetchUsers(page) }} onConfirm={executeAction} />
  </div>
}
