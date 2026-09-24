import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getConversations } from '../api/chat'
import Loading from '../components/common/Loading'

export default function ChatContactsPage() {
  const navigate = useNavigate()
  const [conversations, setConversations] = useState([])
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const response = await getConversations()
      setConversations(response.data || [])
      setError('')
    } catch (err) {
      setError(err.userMessage || '联系人加载失败，请稍后重试。')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const friends = conversations.filter(item => !item.partner?.is_group)
  const groups = conversations.filter(item => item.partner?.is_group)
  const visibleItems = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    return conversations
      .filter(item => kind === 'all' || (kind === 'groups' ? item.partner?.is_group : !item.partner?.is_group))
      .filter(item => !keyword || `${item.partner?.display_name || ''} ${item.partner?.nickname || ''} ${item.partner?.username || ''}`.toLowerCase().includes(keyword))
      .sort((left, right) => (left.partner?.display_name || '').localeCompare(right.partner?.display_name || '', 'zh-CN'))
  }, [conversations, kind, query])

  if (loading) return <Loading text="正在加载联系人…" />

  return <div className="chat-contacts-page">
    <header className="chat-contacts-header">
      <div><span className="file-eyebrow">消息通讯录</span><h2>联系人</h2><p>好友和群聊集中显示，点击即可进入对话。</p></div>
      <button type="button" className="btn-secondary" onClick={load}>刷新</button>
    </header>

    {error && <div className="error-message">{error}</div>}

    <section className="chat-contact-toolbar">
      <label className="ui-search-field"><span>⌕</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索好友昵称、用户名或群名称" /></label>
      <div className="chat-contact-tabs">
        <button type="button" className={kind === 'all' ? 'active' : ''} onClick={() => setKind('all')}>全部 <b>{conversations.length}</b></button>
        <button type="button" className={kind === 'friends' ? 'active' : ''} onClick={() => setKind('friends')}>好友 <b>{friends.length}</b></button>
        <button type="button" className={kind === 'groups' ? 'active' : ''} onClick={() => setKind('groups')}>群聊 <b>{groups.length}</b></button>
      </div>
    </section>

    <div className="chat-contact-grid">
      {visibleItems.map(item => {
        const partner = item.partner || {}
        const name = partner.display_name || partner.nickname || partner.username || '未命名会话'
        return <button type="button" className="chat-contact-card" key={item.id} onClick={() => navigate(`/chat/${item.id}`)}>
          <span className={`chat-contact-avatar ${partner.is_group ? 'group' : ''}`}>{partner.is_group ? '群' : name.charAt(0).toUpperCase()}</span>
          <span className="chat-contact-copy"><strong>{name}</strong><small>{partner.is_group ? '群聊' : `@${partner.username || '未设置用户名'}`}</small></span>
          {item.has_unread && <span className="chat-contact-unread">新消息</span>}
          <span className="chat-contact-enter">进入对话 ›</span>
        </button>
      })}
      {!visibleItems.length && <div className="chat-contact-empty">{query ? '没有找到匹配的联系人' : kind === 'groups' ? '暂未加入群聊' : kind === 'friends' ? '还没有添加好友' : '还没有好友或群聊'}</div>}
    </div>
  </div>
}
