import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'
import { toggleGroupTodo } from '../api/chat'
import { BackButton } from '../components/memo/MemoNav'

const TITLES = { announcements: '群公告', todos: '群待办', 'shared-files': '群共享文件' }
export default function TeamSectionPage({ kind }) {
  const navigate = useNavigate()
  const [items, setItems] = useState([]), [groups, setGroups] = useState([]), [q, setQ] = useState(''), [groupId, setGroupId] = useState(''), [type, setType] = useState(''), [error, setError] = useState('')
  const load = useCallback(async () => {
    try {
      const response = await api.get(`/memos/team/${kind}`, { params: { ...(q ? { q } : {}), ...(groupId ? { group_id: groupId } : {}), ...(type ? kind === 'todos' ? { completed: type === 'done' } : kind === 'shared-files' ? { file_type: type } : {} : {}) } })
      const data = response.data?.data || []; setItems(data); setGroups([...new Map(data.filter(item => item.group_id).map(item => [item.group_id, item.group_name])).entries()]); setError('')
    } catch { setError(`无法加载${TITLES[kind]}。`) }
  }, [kind, q, groupId, type])
  useEffect(() => { load() }, [load])
  const toggleTodo = async id => { try { await toggleGroupTodo(id); load() } catch { setError('更新待办失败。') } }
  return <div className="memo-page team-section-page"><BackButton fallback="/profile/memos/team" /><div className="memo-header"><div><span className="file-eyebrow">团队群聊备忘录</span><h2>{TITLES[kind]}</h2><p>汇总当前账号可访问群聊中的协作内容。</p></div></div>{error && <div className="error-message">{error}</div>}<form className="ui-filter-bar" onSubmit={event => { event.preventDefault(); load() }}><label>搜索<input placeholder="标题、正文或文件名" value={q} onChange={event => setQ(event.target.value)} /></label><label>群聊<select value={groupId} onChange={event => setGroupId(event.target.value)}><option value="">所有群聊</option>{groups.map(([id, name]) => <option value={id} key={id}>{name}</option>)}</select></label>{kind === 'todos' && <label>状态<select value={type} onChange={event => setType(event.target.value)}><option value="">全部状态</option><option value="done">已完成</option><option value="open">未完成</option></select></label>}{kind === 'shared-files' && <label>类型<select value={type} onChange={event => setType(event.target.value)}><option value="">全部类型</option><option value="file">文件</option><option value="image">图片</option><option value="video">视频</option></select></label>}<button className="btn-primary">应用筛选</button></form><div className="memo-list group-memo-list">{items.map(item => <article className={`memo-list-item ${kind === 'todos' && item.is_completed ? 'completed' : ''}`} key={item.id}>{kind === 'todos' && <button className="todo-check" onClick={() => toggleTodo(item.id)} aria-label={item.is_completed ? '恢复待办' : '完成待办'}>{item.is_completed ? '✓' : ''}</button>}<div className="group-memo-item-main"><strong>{item.title || item.file_name}</strong><p>{item.group_name} · {item.creator_name || item.sender_name || '群成员'} · {(item.updated_at || item.created_at || '').slice(0, 16).replace('T', ' ')}</p>{item.content && <p>{item.content}</p>}{item.source_message_id && <button className="text-button" onClick={() => navigate(`/chat/${item.group_id}`)}>查看来源消息</button>}{item.file_url && <div className="memo-item-actions"><a href={item.file_url} target="_blank" rel="noreferrer">打开</a>{item.download_url && <a href={item.download_url}>下载</a>}</div>}</div></article>)}{!items.length && <div className="empty-state-small">暂无匹配内容</div>}</div></div>
}
