import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../api/client'
import { downloadAuthorizedFile, openAuthorizedFile } from '../api/files'
import { BackButton } from '../components/memo/MemoNav'
import useDebouncedValue from '../hooks/useDebouncedValue'
import { formatBeijingDateTime } from '../utils/dateTime'

export default function PersonalCollectionPage({ kind }) {
  const shared = kind === 'shared-files', title = shared ? '个人共享文件' : '收藏夹'
  const [items, setItems] = useState([]), [q, setQ] = useState(''), [type, setType] = useState(''), [error, setError] = useState('')
  const debouncedQ = useDebouncedValue(q)
  const load = useCallback(async () => { try { const response = await api.get(`/memos/${kind}`, { params: { ...(debouncedQ ? { q: debouncedQ } : {}), ...(type ? (shared ? { file_type: type } : { msg_type: type }) : {}) } }); setItems(response.data?.data || []) } catch { setError(`无法加载${title}。`) } }, [kind, debouncedQ, type, shared, title])
  useEffect(() => { load() }, [load])
  const handleFileAction = async (action, url, name) => {
    try { await action(url, name); setError('') }
    catch (err) { setError(err.userMessage || '文件操作失败，请重新登录后重试。') }
  }
  return <div className="memo-page"><BackButton fallback="/profile/memos/personal" /><div className="memo-header"><div><h2>{title}</h2><p>按关键词与类型查找聊天资料。</p></div></div>{error && <div className="error-message">{error}</div>}<form className="memo-filters" onSubmit={event => { event.preventDefault(); load() }}><input placeholder="搜索名称或内容" value={q} onChange={event => setQ(event.target.value)} /><select value={type} onChange={event => setType(event.target.value)}><option value="">全部类型</option><option value="text">文字</option><option value="image">图片</option><option value="video">视频</option><option value="file">文件</option></select><button className="btn-secondary">筛选</button></form><div className="memo-list">{items.map(item => <article className="memo-list-item" key={item.id}><strong>{item.msg_type === 'text' ? '文字消息' : (item.file_name || '收藏消息')}</strong>{item.content && <p className="shared-text-content">{item.content}</p>}<p>{item.conversation_name} · {item.msg_type} · {item.sender_name || '未知发送者'} · {item.created_at ? formatBeijingDateTime(item.created_at) : '未知时间'}</p><div className="memo-item-actions"><Link to={`/chat/${item.conversation_id}`}>前往对应聊天</Link>{item.file_url && <button type="button" className="text-button" onClick={() => handleFileAction(openAuthorizedFile, item.file_url)}>打开</button>}{item.download_url && <button type="button" className="text-button" onClick={() => handleFileAction(downloadAuthorizedFile, item.download_url, item.file_name || '下载文件')}>下载</button>}</div></article>)}{!items.length && <div className="empty-state-small">暂无匹配内容</div>}</div></div>
}
