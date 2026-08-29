import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../api/client'
import { BackButton } from '../components/memo/MemoNav'

export default function PersonalCollectionPage({ kind }) {
  const shared = kind === 'shared-files', title = shared ? '个人共享文件' : '收藏夹'
  const [items, setItems] = useState([]), [q, setQ] = useState(''), [type, setType] = useState(''), [error, setError] = useState('')
  const load = useCallback(async () => { try { const response = await api.get(`/memos/${kind}`, { params: { ...(q ? { q } : {}), ...(type ? (shared ? { file_type: type } : { msg_type: type }) : {}) } }); setItems(response.data?.data || []) } catch { setError(`无法加载${title}。`) } }, [kind, q, type, shared, title])
  useEffect(() => { load() }, [load])
  return <div className="memo-page"><BackButton fallback="/profile/memos/personal" /><div className="memo-header"><div><h2>{title}</h2><p>按关键词与类型查找聊天资料。</p></div></div>{error && <div className="error-message">{error}</div>}<form className="memo-filters" onSubmit={event => { event.preventDefault(); load() }}><input placeholder="搜索名称或内容" value={q} onChange={event => setQ(event.target.value)} /><select value={type} onChange={event => setType(event.target.value)}><option value="">全部类型</option><option value="text">文字</option><option value="image">图片</option><option value="video">视频</option><option value="file">文件</option></select><button className="btn-secondary">筛选</button></form><div className="memo-list">{items.map(item => <article className="memo-list-item" key={item.id}><strong>{shared ? item.file_name : (item.file_name || item.content || '收藏消息')}</strong><p>{item.conversation_name} · {item.msg_type} · {item.sender_name || '未知发送者'} · {item.created_at || '未知时间'}</p><div className="memo-item-actions"><Link to={`/chat/${item.conversation_id}`}>前往对应聊天</Link>{item.file_url && <a href={item.file_url} target="_blank" rel="noreferrer">打开</a>}{item.download_url && <a href={item.download_url}>下载</a>}</div></article>)}{!items.length && <div className="empty-state-small">暂无匹配内容</div>}</div></div>
}
