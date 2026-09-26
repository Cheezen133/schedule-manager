import { useEffect, useState } from 'react'
import { addReviewMember, removeReviewMember, updateReviewMember } from '../../api/caseReview'
import { getChatContacts } from '../../api/chat'
import { ConfirmDialog, notify } from '../common/Ui'
import { errorText } from './common'

// 添加成员：先列出好友，也可以按昵称或用户名搜索（与聊天加好友用同一个接口）。新成员默认身份为录入员
function MemberPicker({ project, onClose, onAdded }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const memberIds = new Set(project.members.map(member => member.id))
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const timer = setTimeout(() => {
      getChatContacts(!query.trim(), query)
        .then(result => { if (!cancelled) setResults(result.data || []) })
        .catch(() => { if (!cancelled) setResults([]) })
        .finally(() => { if (!cancelled) setLoading(false) })
    }, 250)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [query])
  const add = async user => {
    try {
      await addReviewMember(project.id, user.id)
      onAdded()
    } catch (err) {
      notify(errorText(err, '添加失败'))
    }
  }
  const candidates = results.filter(user => !memberIds.has(user.id))
  return <div className="modal-overlay">
    <div className="modal cr-modal">
      <div className="modal-header"><h3>添加成员</h3><button type="button" className="text-button" onClick={onClose}>完成</button></div>
      <input className="cr-member-search" autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索昵称或用户名" />
      <p className="cr-muted">{query.trim() ? '搜索结果' : '好友'}{loading ? '（加载中…）' : ''} · 新成员默认是「录入员」，加入后可以再改</p>
      <ul className="cr-member-list">
        {candidates.map(user => <li key={user.id}><span className="cr-avatar">{(user.nickname || user.username || '?').charAt(0)}</span><span className="cr-member-name">{user.nickname || user.username}<small>@{user.username}</small></span><button type="button" className="btn-secondary" onClick={() => add(user)}>添加</button></li>)}
        {!loading && !candidates.length && <li className="cr-muted">{query.trim() ? '没有找到可添加的用户' : '没有可添加的好友，试试搜索'}</li>}
      </ul>
    </div>
  </div>
}

// 设置成员的身份（可多选）和功能权限：勾选身份时，权限自动换成这些身份默认权限的并集，之后可以逐项调整
function MemberEditor({ project, member, onClose, onSaved, onRemove }) {
  const defaultsOf = roles => new Set(project.role_options.filter(option => roles.includes(option.key)).flatMap(option => option.permissions))
  const [roles, setRoles] = useState(member.roles)
  const [permissions, setPermissions] = useState(new Set(member.permissions))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const defaults = defaultsOf(roles)
  const isDefault = permissions.size === defaults.size && [...permissions].every(key => defaults.has(key))
  const toggleRole = key => {
    const next = roles.includes(key) ? roles.filter(role => role !== key) : [...roles, key]
    setRoles(next)
    setPermissions(defaultsOf(next))
  }
  const togglePermission = key => setPermissions(previous => {
    const next = new Set(previous)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return next
  })
  const save = async event => {
    event.preventDefault()
    setSaving(true); setError('')
    try {
      // 与身份默认一致时不存自定义，以后身份默认调整了会自动跟上
      await updateReviewMember(project.id, member.id, roles, isDefault ? null : [...permissions])
      onSaved()
    } catch (err) {
      setError(errorText(err))
      setSaving(false)
    }
  }
  return <div className="modal-overlay">
    <form className="modal cr-modal" onSubmit={save}>
      <div className="modal-header"><h3>{member.nickname} 的身份和权限</h3><button type="button" className="text-button" onClick={onClose}>取消</button></div>
      {error && <div className="error-message">{error}</div>}
      <div className="cr-field"><span>身份（可多选）</span><div className="cr-chip-group">
        {project.role_options.map(option => <button type="button" key={option.key} className={roles.includes(option.key) ? 'is-active' : ''} aria-pressed={roles.includes(option.key)} onClick={() => toggleRole(option.key)}>{option.label}</button>)}
      </div></div>
      <div className="cr-field"><span>功能权限{isDefault ? '（按身份默认）' : '（已自定义）'}</span><div className="cr-permission-list">
        {project.permission_options.map(option => <label key={option.key} className="cr-permission"><span>{option.label}</span><input type="checkbox" role="switch" checked={permissions.has(option.key)} onChange={() => togglePermission(option.key)} /></label>)}
      </div></div>
      <p className="cr-muted">所有成员都能查看项目内容。去掉「下结论」后，这位成员负责审阅的病历会改为未指派。</p>
      <div className="modal-actions">
        <button type="button" className="text-button cr-danger cr-member-remove" onClick={onRemove}>移出项目</button>
        <button className="btn-primary" disabled={saving || !roles.length}>{saving ? '保存中…' : '保存'}</button>
      </div>
    </form>
  </div>
}

// 成员列表；有管理权限的人可以添加成员、设置身份和权限、移出成员。pickerOpen 由父组件控制（手机上点导航栏「＋」打开）
export default function ProjectMembers({ project, onChanged, pickerOpen, onPickerClose }) {
  const [showPicker, setShowPicker] = useState(false)
  const [editing, setEditing] = useState(null)
  const [removing, setRemoving] = useState(null)
  const confirmRemove = async () => {
    const member = removing
    setRemoving(null)
    setEditing(null)
    try {
      await removeReviewMember(project.id, member.id)
      onChanged()
    } catch (err) {
      notify(errorText(err, '移除失败'))
    }
  }
  const closePicker = () => { setShowPicker(false); onPickerClose() }
  return <div className="cr-members">
    <div className="cr-reports-head"><p className="cr-muted">只有成员能看到这个项目的病历和汇报。审阅人需要有「下结论」权限。</p>{project.can_manage && <button type="button" className="btn-primary cr-desktop-only" onClick={() => setShowPicker(true)}>添加成员</button>}</div>
    <ul className="cr-member-list">
      {project.members.map(member => <li key={member.id}>
        <span className="cr-avatar">{(member.nickname || '?').charAt(0)}</span>
        <span className="cr-member-name">{member.nickname}{member.username && <small>@{member.username}</small>}
          <span className="cr-role-tags">{member.is_creator ? <span className="cr-tag">创建者 · 全部权限</span> : member.role_labels.map(label => <span className="cr-tag" key={label}>{label}</span>)}{member.custom_permissions && <span className="cr-tag cr-tag-muted">自定义权限</span>}</span>
        </span>
        {!member.is_creator && project.can_manage && <button type="button" className="text-button" onClick={() => setEditing(member)}>设置</button>}
      </li>)}
    </ul>
    {(showPicker || pickerOpen) && <MemberPicker project={project} onClose={closePicker} onAdded={onChanged} />}
    {editing && <MemberEditor key={editing.id} project={project} member={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); onChanged() }} onRemove={() => setRemoving(editing)} />}
    <ConfirmDialog open={Boolean(removing)} danger title="移出项目" message={`移出「${removing?.nickname}」后，对方将看不到这个项目；其负责审阅的病历会改为未指派，已给出的结论保留。`} confirmText="移出" onConfirm={confirmRemove} onCancel={() => setRemoving(null)} />
  </div>
}
