import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createConversation, getChatContacts, getConversations } from '../api/chat'
import Loading from '../components/common/Loading'
import useDebouncedValue from '../hooks/useDebouncedValue'

export default function ChatContactsPage() {
  const navigate = useNavigate()
  const [conversations, setConversations] = useState([])
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [showAddFriend, setShowAddFriend] = useState(false)
  const [friendQuery, setFriendQuery] = useState('')
  const [friendResults, setFriendResults] = useState([])
  const [friendSearching, setFriendSearching] = useState(false)
  const debouncedFriendQuery = useDebouncedValue(showAddFriend ? friendQuery.trim() : '', 400)

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

  const searchFriends = useCallback(async (keyword) => {
    const value = keyword.trim()
    if (!value) {
      setFriendResults([])
      setFriendSearching(false)
      return
    }
    setFriendSearching(true)
    try {
      const response = await getChatContacts(false, value)
      setFriendResults(response.data || [])
    } catch (err) {
      setFriendResults([])
      setError(err.userMessage || '搜索好友失败，请稍后重试。')
    } finally {
      setFriendSearching(false)
    }
  }, [])

  useEffect(() => {
    if (!showAddFriend) return
    searchFriends(debouncedFriendQuery)
  }, [debouncedFriendQuery, searchFriends, showAddFriend])

  const openAddFriend = () => {
    setFriendQuery('')
    setFriendResults([])
    setNotice('')
    setShowAddFriend(true)
  }

  const handleAddFriend = async (contact) => {
    try {
      const response = await createConversation(contact.id)
      if (response.data?.id) {
        navigate(`/chat/${response.data.id}`)
        return
      }
      setFriendResults(items => items.filter(item => item.id !== contact.id))
      setNotice(response.message || '好友申请已发送')
    } catch (err) {
      setError(err.userMessage || '好友申请发送失败。')
    }
  }

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
      <div style={{ display: 'flex', gap: '.5rem' }}>
        <button type="button" className="btn-primary" onClick={openAddFriend}>＋ 添加好友</button>
        <button type="button" className="btn-secondary" onClick={load}>刷新</button>
      </div>
    </header>

    {error && <div className="error-message">{error}</div>}
    {notice && <div className="success-message">{notice}</div>}

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

    {showAddFriend && (
      <div className="modal-overlay" onMouseDown={() => setShowAddFriend(false)}>
        <section className="modal" onMouseDown={event => event.stopPropagation()}>
          <div className="modal-header">
            <h3>添加好友</h3>
            <button type="button" className="btn-cancel-sm" onClick={() => setShowAddFriend(false)}>关闭</button>
          </div>
          <div style={{ display: 'flex', gap: '.5rem', marginBottom: '.75rem' }}>
            <input
              className="search-input"
              value={friendQuery}
              onChange={event => setFriendQuery(event.target.value)}
              onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); searchFriends(friendQuery) } }}
              placeholder="输入用户名或昵称"
              autoFocus
              style={{ flex: 1, minWidth: 0 }}
            />
            <button type="button" className="btn-submit" disabled={!friendQuery.trim() || friendSearching} onClick={() => searchFriends(friendQuery)}>搜索</button>
          </div>
          {notice && <div className="success-message">{notice}</div>}
          <div className="contact-select-list">
            {!friendQuery.trim() && <div className="empty-state">请输入用户名或昵称搜索好友</div>}
            {friendQuery.trim() && friendSearching && <div className="empty-state">正在搜索…</div>}
            {!friendSearching && friendResults.map(contact => (
              <button type="button" key={contact.id} className="contact-select-item" onClick={() => handleAddFriend(contact)}>
                <div className="chat-conv-avatar">{(contact.nickname || contact.username || '?').charAt(0).toUpperCase()}</div>
                <div className="chat-conv-info">
                  <div className="chat-conv-name">{contact.nickname || contact.username}</div>
                  <div className="chat-conv-preview">@{contact.username}</div>
                </div>
                <span style={{ marginLeft: 'auto', color: 'var(--primary)', fontSize: '.8rem', fontWeight: 600 }}>添加</span>
              </button>
            ))}
            {friendQuery.trim() && !friendSearching && friendResults.length === 0 && <div className="empty-state">没有找到可添加的用户</div>}
          </div>
        </section>
      </div>
    )}
  </div>
}
