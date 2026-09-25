import { useEffect, useState } from 'react'
import { addReviewMember, removeReviewMember } from '../../api/caseReview'
import { getChatContacts } from '../../api/chat'
import { ConfirmDialog, notify } from '../common/Ui'
import { errorText } from './common'

// 添加成员：先列出好友，也可以按昵称或用户名搜索（与聊天加好友用同一个接口）
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
      <p className="cr-muted">{query.trim() ? '搜索结果' : '好友'}{loading ? '（加载中…）' : ''}</p>
      <ul className="cr-member-list">
        {candidates.map(user => <li key={user.id}><span className="cr-avatar">{(user.nickname || user.username || '?').charAt(0)}</span><span className="cr-member-name">{user.nickname || user.username}<small>@{user.username}</small></span><button type="button" className="btn-secondary" onClick={() => add(user)}>添加</button></li>)}
        {!loading && !candidates.length && <li className="cr-muted">{query.trim() ? '没有找到可添加的用户' : '没有可添加的好友，试试搜索'}</li>}
      </ul>
    </div>
  </div>
}

// 成员列表；项目创建者可以添加、移除成员。pickerOpen 由父组件控制（手机上点导航栏「＋」打开）
export default function ProjectMembers({ project, onChanged, pickerOpen, onPickerClose }) {
  const [showPicker, setShowPicker] = useState(false)
  const [removing, setRemoving] = useState(null)
  const confirmRemove = async () => {
    const member = removing
    setRemoving(null)
    try {
      await removeReviewMember(project.id, member.id)
      onChanged()
    } catch (err) {
      notify(errorText(err, '移除失败'))
    }
  }
  const closePicker = () => { setShowPicker(false); onPickerClose() }
  return <div className="cr-members">
    <div className="cr-reports-head"><p className="cr-muted">只有成员能看到这个项目的病历和汇报。审阅人要先加为成员。</p>{project.can_manage && <button type="button" className="btn-primary cr-desktop-only" onClick={() => setShowPicker(true)}>添加成员</button>}</div>
    <ul className="cr-member-list">
      {project.members.map(member => <li key={member.id}>
        <span className="cr-avatar">{(member.nickname || '?').charAt(0)}</span>
        <span className="cr-member-name">{member.nickname}{member.username && <small>@{member.username}</small>}</span>
        {member.is_creator ? <span className="cr-tag">创建者</span> : project.can_manage && <button type="button" className="text-button cr-danger" onClick={() => setRemoving(member)}>移除</button>}
      </li>)}
    </ul>
    {(showPicker || pickerOpen) && <MemberPicker project={project} onClose={closePicker} onAdded={onChanged} />}
    <ConfirmDialog open={Boolean(removing)} danger title="移除成员" message={`移除「${removing?.nickname}」后，对方将看不到这个项目；其负责审阅的病历会改为未指派，已给出的结论保留。`} confirmText="移除" onConfirm={confirmRemove} onCancel={() => setRemoving(null)} />
  </div>
}
