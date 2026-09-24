import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'
import { downloadAuthorizedFile, openAuthorizedFile } from '../api/files'
import { createGroupAnnouncement, updateGroupAnnouncement, deleteGroupAnnouncement, createGroupTodo, updateGroupTodo, toggleGroupTodo, deleteGroupTodo, uploadSharedFile, updateSharedFile, deleteSharedFile } from '../api/chat'
import { BackButton } from '../components/memo/MemoNav'
import useDebouncedValue from '../hooks/useDebouncedValue'
import { formatBeijingDateTime } from '../utils/dateTime'

const TITLES = { announcements: '群公告', todos: '群待办', 'shared-files': '群共享文件' }

export default function TeamSectionPage({ kind }) {
  const navigate = useNavigate()
  const [items, setItems] = useState([]), [groups, setGroups] = useState([]), [q, setQ] = useState(''), [groupId, setGroupId] = useState(''), [type, setType] = useState(''), [error, setError] = useState(''), [editor, setEditor] = useState(null)
  const fileInputRef = useRef(null)
  const debouncedQ = useDebouncedValue(q)
  const load = useCallback(async () => {
    try {
      const params = { ...(debouncedQ ? { q: debouncedQ } : {}), ...(groupId ? { group_id: groupId } : {}), ...(type && kind === 'shared-files' ? { file_type: type } : {}) }
      const [itemsRes, groupsRes] = await Promise.all([api.get(`/memos/team/${kind}`, { params }), api.get('/memos/team/groups')])
      setItems(itemsRes.data?.data || []); setGroups(groupsRes.data?.data || []); setError('')
    } catch { setError(`无法加载${TITLES[kind]}。`) }
  }, [kind, debouncedQ, groupId, type])
  useEffect(() => { load() }, [load])
  const toggleTodo = async id => { try { await toggleGroupTodo(id); load() } catch { setError('更新待办失败。') } }
  const remove = async item => { if (!window.confirm('确定删除此内容吗？')) return; try { if (kind === 'announcements') await deleteGroupAnnouncement(item.id); else await deleteGroupTodo(item.id); load() } catch { setError('删除失败。') } }
  const save = async event => {
    event.preventDefault(); if (!editor?.title?.trim()) return
    try {
      const body = { title: editor.title.trim(), ...(kind === 'announcements' ? { content: editor.content || '' } : {}) }
      if (editor.id) { if (kind === 'announcements') await updateGroupAnnouncement(editor.id, body); else await updateGroupTodo(editor.id, body) }
      else { if (!editor.groupId) { setError('请选择群聊。'); return }; if (kind === 'announcements') await createGroupAnnouncement(editor.groupId, body); else await createGroupTodo(editor.groupId, body) }
      setEditor(null); load()
    } catch { setError('保存失败。') }
  }
  const editable = kind !== 'shared-files'
  const managedGroups = groups.filter(group => group.can_manage)
  const canManageItem = item => groups.some(group => group.id === item.group_id && group.can_manage)
  const uploadGroupFile = async event => {
    const file = event.target.files?.[0]; event.target.value = ''
    if (!file) return
    if (!groupId) { setError('请先选择一个群聊，再上传群共享文件。'); return }
    const tag = window.prompt('请输入文件标签（可留空）', '')
    if (tag === null) return
    try { await uploadSharedFile(groupId, file, tag || null); await load() } catch { setError('上传群共享文件失败。') }
  }
  const editSharedFile = async item => {
    const tag = window.prompt('修改文件标签', item.tag || '')
    if (tag === null) return
    try { await updateSharedFile(item.id, { tag, note: item.note || null }); await load() } catch { setError('修改文件标签失败。') }
  }
  const removeSharedFile = async item => {
    if (!window.confirm(`确定删除“${item.file_name}”吗？`)) return
    try { await deleteSharedFile(item.id); await load() } catch { setError('删除共享文件失败。') }
  }
  const handleFileAction = async (action, url, name) => {
    try { await action(url, name); setError('') }
    catch (err) { setError(err.userMessage || '文件操作失败，请重新登录后重试。') }
  }
  return <div className="memo-page team-section-page"><BackButton fallback="/profile/memos/team" />
    <div className="memo-header"><div><span className="file-eyebrow">团队群聊备忘录</span><h2>{TITLES[kind]}</h2><p>{editable ? '群主和群管理员维护内容，所有成员均可查看，群待办可由成员完成。' : '群成员共同使用群共享文件。'}</p></div>{editable ? managedGroups.length > 0 && <button className="btn-primary" onClick={() => setEditor({ groupId: managedGroups.some(group => String(group.id) === String(groupId)) ? groupId : '', title: '', content: '' })}>新建{TITLES[kind]}</button> : <><button className="btn-primary" onClick={() => fileInputRef.current?.click()}>上传群文件</button><input ref={fileInputRef} hidden type="file" onChange={uploadGroupFile} /></>}</div>
    {error && <div className="error-message">{error}</div>}
    <form className="ui-filter-bar" onSubmit={event => { event.preventDefault(); load() }}><label>搜索<input placeholder="标题、正文或文件名" value={q} onChange={event => setQ(event.target.value)} /></label><label>群聊<select value={groupId} onChange={event => setGroupId(event.target.value)}><option value="">所有群聊</option>{groups.map(group => <option value={group.id} key={group.id}>{group.name}</option>)}</select></label>{kind === 'shared-files' && <label>类型<select value={type} onChange={event => setType(event.target.value)}><option value="">全部类型</option><option value="file">文件</option><option value="image">图片</option><option value="video">视频</option></select></label>}<button className="btn-primary">应用筛选</button></form>
    <div className="memo-list group-memo-list">{items.map(item => <article className="memo-list-item" key={item.id}>{kind === 'todos' && <button className="todo-check" onClick={() => toggleTodo(item.id)} aria-label="完成待办"></button>}<div className="group-memo-item-main"><strong>{item.msg_type === 'text' ? '文字消息' : (item.title || item.file_name)}</strong><p>{item.group_name} · {item.creator_name || item.sender_name || '群成员'} · {formatBeijingDateTime(item.updated_at || item.created_at)}</p>{item.tag && <p>标签：{item.tag}</p>}{item.content && <p className={item.msg_type === 'text' ? 'shared-text-content' : ''}>{item.content}</p>}{item.source_message_id && <button className="text-button" onClick={() => navigate(`/chat/${item.group_id}`)}>查看来源消息</button>}{!editable && <div className="memo-item-actions">{item.file_url && <button type="button" className="text-button" onClick={() => handleFileAction(openAuthorizedFile, item.file_url)}>打开</button>}{item.download_url && <button type="button" className="text-button" onClick={() => handleFileAction(downloadAuthorizedFile, item.download_url, item.file_name || '下载文件')}>下载</button>}<button className="text-button" onClick={() => editSharedFile(item)}>修改标签</button><button className="text-button danger" onClick={() => removeSharedFile(item)}>删除</button></div>}{editable && canManageItem(item) && <div className="memo-item-actions"><button className="text-button" onClick={() => setEditor({ id: item.id, groupId: item.group_id, title: item.title, content: item.content || '' })}>编辑</button><button className="text-button danger" onClick={() => remove(item)}>删除</button></div>}</div></article>)}{!items.length && <div className="empty-state-small">暂无匹配内容</div>}</div>
    {editor && <div className="modal-overlay"><form className="modal compact-modal" onSubmit={save}><div className="modal-header"><h3>{editor.id ? '编辑' : '新建'}{TITLES[kind]}</h3><button type="button" className="text-button" onClick={() => setEditor(null)}>关闭</button></div>{!editor.id && <label>群聊<select required value={editor.groupId} onChange={event => setEditor({ ...editor, groupId: event.target.value })}><option value="">请选择群聊</option>{managedGroups.map(group => <option value={group.id} key={group.id}>{group.name}</option>)}</select></label>}<label>标题<input required value={editor.title} onChange={event => setEditor({ ...editor, title: event.target.value })} /></label>{kind === 'announcements' && <label>正文<textarea value={editor.content} onChange={event => setEditor({ ...editor, content: event.target.value })} /></label>}<div className="modal-actions"><button type="button" className="btn-secondary" onClick={() => setEditor(null)}>取消</button><button className="btn-primary">保存</button></div></form></div>}
  </div>
}
