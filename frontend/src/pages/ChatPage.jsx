import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import {
  getConversations, createConversation, createGroup, setRemark,
  getMessages, sendTextMessage, sendMediaMessage, deleteMessage, recallMessage,
  getChatContacts, deleteFriend, getAuthorizedMediaBlob, downloadAuthorizedChatFile,
  addFavorite, removeFavorite, getFavorites,
  markConversationRead,
  getFriendRequests, acceptFriendRequest, rejectFriendRequest,
  getSharedFiles, addSharedFileFromMsg, uploadSharedFile, deleteSharedFile,
  searchChat,
  getGroupMembers, getGroupAnnouncements, createGroupAnnouncement,
  deleteGroupAnnouncement, getGroupTodos, createGroupTodo, toggleGroupTodo, deleteGroupTodo,
  renameGroup, addGroupMembers, setGroupMemberRole, removeGroupMember, dissolveGroup,
} from '../api/chat'
import { getNotifications } from '../api/notifications'
import { ConfirmDialog } from '../components/common/Ui'
import { requestManagement } from '../api/scheduleManagement'
import { longPressProps } from '../components/common/longPress'
import useDebouncedValue from '../hooks/useDebouncedValue'
import { formatBeijingDate, formatBeijingDateTime, formatBeijingShortDateTime, formatBeijingTime, isBeijingToday, parseBeijingDate } from '../utils/dateTime'

function formatFileSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024*1024) return `${(bytes/1024).toFixed(1)}KB`
  return `${(bytes/(1024*1024)).toFixed(1)}MB`
}

function ProtectedChatMedia({ filename, type, alt = '图片' }) {
  const [url, setUrl] = useState('')
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let active = true
    let objectUrl = ''
    setUrl(''); setFailed(false)
    getAuthorizedMediaBlob(filename)
      .then(blob => {
        objectUrl = URL.createObjectURL(blob)
        if (active) setUrl(objectUrl)
        else URL.revokeObjectURL(objectUrl)
      })
      .catch(() => { if (active) setFailed(true) })
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [filename])

  if (failed) return <div className="chat-media-error">媒体加载失败，请重新登录后重试</div>
  if (!url) return <div className="chat-media-loading">正在加载媒体…</div>
  if (type === 'video') return <video controls className="chat-msg-video" preload="metadata" src={url} />
  return <img src={url} alt={alt} className="chat-msg-image" onClick={() => window.open(url, '_blank', 'noopener')} />
}

const FILE_TAGS = ['日常', '请求', '文件', '谈话', '查房', '约定']

function TagSelectModal({ fileName, onConfirm, onClose }) {
  const [tag, setTag] = useState('')
  const [customTag, setCustomTag] = useState('')
  const [note, setNote] = useState('')
  const [showCustomInput, setShowCustomInput] = useState(false)

  const finalTag = showCustomInput ? customTag : tag

  const handleConfirm = () => {
    if (!finalTag.trim()) return
    onConfirm(finalTag.trim(), note.trim() || null)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 400 }}>
        <div className="modal-header">
          <h3>📁 添加共享文件</h3>
          <button className="btn-cancel-sm" onClick={onClose}>关闭</button>
        </div>
        <div style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: '1rem' }}>
          文件：<strong>{fileName}</strong>
        </div>
        <div className="form-group">
          <label>标签 <span style={{ color: '#dc2626' }}>*</span></label>
          {!showCustomInput ? (
            <select value={tag} onChange={(e) => { if (e.target.value === '__custom') { setShowCustomInput(true); setTag('') } else { setTag(e.target.value); setCustomTag('') } }}
              style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.9rem', marginBottom: '0.5rem' }}>
              <option value="">-- 请选择标签 --</option>
              {FILE_TAGS.map(t => <option key={t} value={t}>{t}</option>)}
              <option value="__custom">✏️ 自定义输入...</option>
            </select>
          ) : (
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <input value={customTag} onChange={(e) => setCustomTag(e.target.value)} placeholder="输入自定义标签"
                style={{ flex: 1, padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.9rem' }} autoFocus />
              <button className="btn-cancel-sm" onClick={() => { setShowCustomInput(false); setCustomTag('') }}>返回</button>
            </div>
          )}
        </div>
        <div className="form-group">
          <label>备注 <span style={{ color: '#9ca3af' }}>(选填)</span></label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="添加备注说明..."
            rows={2} style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.85rem', resize: 'vertical' }} maxLength={500} />
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
          <button className="btn-cancel" onClick={onClose}>取消</button>
          <button className="btn-submit" onClick={handleConfirm} disabled={!finalTag.trim()}>确认添加</button>
        </div>
      </div>
    </div>
  )
}

function GroupPublishModal({ mode, source, onClose, onSubmit }) {
  const [title, setTitle] = useState(source?.title || '')
  const [content, setContent] = useState(source?.content || '')
  const isAnnouncement = mode === 'announcement'
  return <div className="modal-overlay" onMouseDown={onClose}><form className="modal group-publish-modal" onMouseDown={event => event.stopPropagation()} onSubmit={event => { event.preventDefault(); if (title.trim()) onSubmit({ title: title.trim(), content: content.trim() || null, source_message_id: source?.messageId || null }) }}><div className="modal-header"><div><span className="file-eyebrow">群聊协作</span><h3>{isAnnouncement ? '发布群公告' : '创建群待办'}</h3></div><button type="button" className="text-button" onClick={onClose}>关闭</button></div><label>标题<input autoFocus required value={title} onChange={event => setTitle(event.target.value)} placeholder={isAnnouncement ? '请输入公告标题' : '请输入待办事项'} maxLength={200} /></label>{isAnnouncement && <label>正文<textarea value={content} onChange={event => setContent(event.target.value)} placeholder="补充公告详情（可选）" maxLength={5000} rows={5} /></label>}{source && <p className="group-source-hint">已关联一条群消息，成员可追溯查看来源。</p>}<div className="modal-actions"><button type="button" className="btn-secondary" onClick={onClose}>取消</button><button className="btn-primary">{isAnnouncement ? '发布公告' : '创建待办'}</button></div></form></div>
}

function GroupRenameModal({ initialName, onClose, onSubmit }) {
  const [name, setName] = useState(initialName || '')
  return <div className="modal-overlay" onMouseDown={onClose}><form className="modal group-rename-modal" onMouseDown={event => event.stopPropagation()} onSubmit={event => { event.preventDefault(); if (name.trim()) onSubmit(name.trim()) }}><div className="modal-header"><div><span className="file-eyebrow">群聊设置</span><h3>修改群聊名称</h3></div><button type="button" className="text-button" onClick={onClose}>关闭</button></div><label>群聊名称<input autoFocus required value={name} onChange={event => setName(event.target.value)} placeholder="请输入群聊名称" maxLength={50} /></label><p className="group-source-hint">修改后会同步给所有群成员及团队群聊备忘录。</p><div className="modal-actions"><button type="button" className="btn-secondary" onClick={onClose}>取消</button><button className="btn-primary">保存名称</button></div></form></div>
}

function GroupInviteModal({ contacts, members, submitting, onClose, onSubmit }) {
  const [query, setQuery] = useState('')
  const [selectedIds, setSelectedIds] = useState([])
  const memberIds = new Set(members.map(member => member.id))
  const candidates = contacts.filter(contact => !memberIds.has(contact.id) && `${contact.nickname || ''} ${contact.username || ''}`.toLowerCase().includes(query.trim().toLowerCase()))
  const toggle = userId => setSelectedIds(previous => previous.includes(userId) ? previous.filter(id => id !== userId) : [...previous, userId])

  return <div className="modal-overlay" onMouseDown={onClose}><section className="modal" onMouseDown={event => event.stopPropagation()} style={{ width: 440, maxHeight: '620px' }}><div className="modal-header"><div><span className="file-eyebrow">群成员管理</span><h3>邀请好友加入群聊</h3></div><button type="button" className="text-button" onClick={onClose}>关闭</button></div><input className="search-input" value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索昵称或用户名" autoFocus /><p className="group-info-count">已选择 {selectedIds.length} 位好友</p><div className="contact-select-list" style={{ maxHeight: 330, overflowY: 'auto' }}>{candidates.map(contact => { const checked = selectedIds.includes(contact.id); return <label key={contact.id} className="contact-select-item" style={{ cursor: 'pointer' }}><input type="checkbox" checked={checked} onChange={() => toggle(contact.id)} /><div className="chat-conv-avatar">{(contact.nickname || contact.username || '?').charAt(0).toUpperCase()}</div><div className="chat-conv-info"><div className="chat-conv-name">{contact.nickname || contact.username}</div><div className="chat-conv-preview">@{contact.username}</div></div></label> })}{!candidates.length && <div className="empty-state">没有可邀请的好友</div>}</div><div className="modal-actions"><button type="button" className="btn-secondary" onClick={onClose}>取消</button><button type="button" className="btn-primary" disabled={!selectedIds.length || submitting} onClick={() => onSubmit(selectedIds)}>{submitting ? '邀请中…' : '邀请入群'}</button></div></section></div>
}

function GroupInfoModal({ mode, members, announcements, todos, memberQuery, setMemberQuery, onClose, onToggleTodo, onRecordContextMenu, onMemberContextMenu, myRole }) {
  const [expanded, setExpanded] = useState(false)
  const filteredMembers = members.filter(member => `${member.nickname || ''} ${member.username || ''}`.toLowerCase().includes(memberQuery.toLowerCase()))
  const activeTodos = todos.filter(item => !item.is_completed)
  const records = mode === 'announcements' ? announcements : activeTodos
  const visibleRecords = expanded ? records : records.slice(0, 2)
  const title = mode === 'members' ? '群成员' : mode === 'announcements' ? '群公告' : '群待办'
  const roleLabel = { owner: '群主', admin: '管理员', member: '成员' }
  const managementHint = myRole === 'owner' ? '点按管理员或普通成员可管理' : myRole === 'admin' ? '点按普通成员可管理' : '点按成员可添加好友或发消息'
  return <div className="modal-overlay" onMouseDown={onClose}><section className="modal group-info-modal" onMouseDown={event => event.stopPropagation()}><div className="modal-header"><div><span className="file-eyebrow">群聊信息</span><h3>{title}</h3></div><button className="text-button" onClick={onClose}>关闭</button></div>{mode === 'members' && <><label className="ui-search-field"><span>⌕</span><input value={memberQuery} onChange={event => setMemberQuery(event.target.value)} placeholder="搜索群成员" /></label><p className="group-info-count">共 {members.length} 位成员 · {managementHint}</p><div className="group-member-list">{filteredMembers.map(member => <div key={member.id} className="group-member-row" onClick={event => onMemberContextMenu(event, member)} onContextMenu={event => onMemberContextMenu(event, member)} {...longPressProps(event => onMemberContextMenu(event, member))}><b>{(member.nickname || member.username || '?').charAt(0)}</b><div><strong>{member.nickname || '未命名成员'}<span className={`group-role-badge ${member.role || 'member'}`}>{roleLabel[member.role] || '成员'}</span></strong><small>@{member.username || '—'}</small></div></div>)}{!filteredMembers.length && <div className="empty-state-small">没有匹配的成员</div>}</div></>}{mode === 'announcements' && <div className="group-record-list">{visibleRecords.map(item => <article key={item.id} onContextMenu={event => onRecordContextMenu(event, 'announcement', item)} {...longPressProps(event => onRecordContextMenu(event, 'announcement', item))}><strong>{item.title}</strong><p>{item.content || '无正文'}</p><small>{item.creator_name || '群成员'} · {formatBeijingDateTime(item.updated_at)}</small></article>)}{!records.length && <div className="empty-state-small">暂无群公告</div>}{records.length > 2 && <button className="text-button group-expand-button" onClick={() => setExpanded(value => !value)}>{expanded ? '收起' : `展开更多（${records.length - 2}）`}</button>}</div>}{mode === 'todos' && <div className="group-record-list">{visibleRecords.map(item => <article key={item.id} onContextMenu={event => onRecordContextMenu(event, 'todo', item)} {...longPressProps(event => onRecordContextMenu(event, 'todo', item))}><button className="todo-check" onClick={() => onToggleTodo(item.id)} aria-label="完成待办"></button><div><strong>{item.title}</strong><small>{item.creator_name || '群成员'} · {formatBeijingDateTime(item.updated_at)}</small></div></article>)}{!records.length && <div className="empty-state-small">暂无群待办</div>}{records.length > 2 && <button className="text-button group-expand-button" onClick={() => setExpanded(value => !value)}>{expanded ? '收起' : `展开更多（${records.length - 2}）`}</button>}</div>}</section></div>
}

export default function ChatPage() {
  const { conversationId } = useParams()
  const navigate = useNavigate()
  const { user: me } = useAuth()

  const [convs, setConvs] = useState([])
  const [activeId, setActiveId] = useState(parseInt(conversationId) || null)
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [pendingDeleteId, setPendingDeleteId] = useState(null)
  const [pendingRecallMessage, setPendingRecallMessage] = useState(null)
  const [mediaFile, setMediaFile] = useState(null)
  const [mediaPreview, setMediaPreview] = useState(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [showNewChat, setShowNewChat] = useState(false)
  const [showGroupModal, setShowGroupModal] = useState(false)
  const [groupName, setGroupName] = useState('')
  const [groupMemberIds, setGroupMemberIds] = useState([])
  const [contacts, setContacts] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [editingRemark, setEditingRemark] = useState(false)
  const [remarkInput, setRemarkInput] = useState('')
  const [contextMenu, setContextMenu] = useState(null)
  const [friendContext, setFriendContext] = useState(null)
  const [pendingFriendDelete, setPendingFriendDelete] = useState(null)
  const [friendSearchLoading, setFriendSearchLoading] = useState(false)
  const [groupRecordContext, setGroupRecordContext] = useState(null)
  const [pendingGroupRecordDelete, setPendingGroupRecordDelete] = useState(null)
  const [groupMemberContext, setGroupMemberContext] = useState(null)
  const [pendingGroupAction, setPendingGroupAction] = useState(null)
  const [showFavPanel, setShowFavPanel] = useState(false)
  const [favorites, setFavorites] = useState([])
  const [favLoading, setFavLoading] = useState(false)
  const [favIds, setFavIds] = useState(new Set())
  const [toast, setToast] = useState('')
  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2000) }

  // 好友请求
  const [friendReq, setFriendReq] = useState({ received: [], sent: [] })
  const [showFriendPanel, setShowFriendPanel] = useState(false)
  // 共享文件
  const [showFilePanel, setShowFilePanel] = useState(false)
  const [sharedFiles, setSharedFiles] = useState([])
  const [fileUploading, setFileUploading] = useState(false)
  const [fileTagFilter, setFileTagFilter] = useState('')
  // 标签选择模态框
  const [tagModal, setTagModal] = useState(null) // { type: 'msg'|'file', msgId?, file?, fileName? }
  // 搜索
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState(null)
  const [showSearchPanel, setShowSearchPanel] = useState(false)
  const [showGroupMenu, setShowGroupMenu] = useState(false)
  const [groupPublish, setGroupPublish] = useState(null)
  const [groupInfoMode, setGroupInfoMode] = useState(null)
  const [groupMembers, setGroupMembers] = useState([])
  const [groupAnnouncements, setGroupAnnouncements] = useState([])
  const [groupTodos, setGroupTodos] = useState([])
  const [memberQuery, setMemberQuery] = useState('')
  const [groupRenameOpen, setGroupRenameOpen] = useState(false)
  const [groupInviteOpen, setGroupInviteOpen] = useState(false)
  const [groupInviteContacts, setGroupInviteContacts] = useState([])
  const [groupInviteSubmitting, setGroupInviteSubmitting] = useState(false)
  const [expandedGroupSummary, setExpandedGroupSummary] = useState({ announcements: false, todos: false })
  const debouncedFriendSearch = useDebouncedValue(showNewChat ? searchTerm.trim() : '', 400)

  const msgListRef = useRef(null)
  const fileInputRef = useRef(null)
  const docFileInputRef = useRef(null)
  const sharedFileInputRef = useRef(null)
  const latestMessageIdRef = useRef(null)

  useEffect(() => {
    let active = true
    if (!showNewChat) {
      setFriendSearchLoading(false)
      return () => { active = false }
    }
    if (!debouncedFriendSearch) {
      setContacts([])
      setFriendSearchLoading(false)
      return () => { active = false }
    }
    setFriendSearchLoading(true)
    getChatContacts(false, debouncedFriendSearch)
      .then(result => { if (active) setContacts(result.data || []) })
      .catch(() => { if (active) setContacts([]) })
      .finally(() => { if (active) setFriendSearchLoading(false) })
    return () => { active = false }
  }, [debouncedFriendSearch, showNewChat])

  useEffect(() => {
    setExpandedGroupSummary({ announcements: false, todos: false })
    setGroupInviteOpen(false)
    setGroupInviteContacts([])
  }, [activeId])

  useEffect(() => {
    const close = event => {
      setContextMenu(null); setFriendContext(null); setGroupRecordContext(null); setGroupMemberContext(null)
      if (event.key === 'Escape') { setShowGroupMenu(false); setGroupInfoMode(null) }
    }
    document.addEventListener('click', close)
    document.addEventListener('keydown', close)
    return () => { document.removeEventListener('click', close); document.removeEventListener('keydown', close) }
  }, [])

  const fetchConvs = useCallback(async () => {
    try {
      const res = await getConversations()
      const items = res.data || []
      setConvs(items)
      window.dispatchEvent(new CustomEvent('chat-unread-count', { detail: items.filter(item => item.has_unread).length }))
    } catch {}
    finally { setLoading(false) }
  }, [])

  // 聊天页打开时由本页唯一负责会话列表轮询；即使尚未选中会话也能收到列表更新。
  useEffect(() => {
    fetchConvs()
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') fetchConvs()
    }, 15000)
    return () => window.clearInterval(timer)
  }, [fetchConvs])
  useEffect(() => { if (conversationId) setActiveId(parseInt(conversationId)) }, [conversationId])
  useEffect(() => {
    if (!loading && activeId && !convs.some(item => item.id === activeId)) {
      setActiveId(null); setMessages([]); setShowGroupMenu(false); navigate('/chat')
    }
  }, [activeId, convs, loading, navigate])

  const fetchMessages = useCallback(async (convId) => {
    try { const res = await getMessages(convId, null, 30); const data = res.data || []; latestMessageIdRef.current = data.at(-1)?.id || null; setMessages(data) } catch {}
  }, [])

  const fetchSharedFiles = useCallback(async (convId, tag = null) => {
    try { const res = await getSharedFiles(convId, tag); setSharedFiles(res.data || []) } catch {}
  }, [])

  const fetchGroupTools = useCallback(async convId => {
    try {
      const [membersRes, announcementsRes, todosRes] = await Promise.all([getGroupMembers(convId), getGroupAnnouncements(convId), getGroupTodos(convId)])
      setGroupMembers(membersRes.data || []); setGroupAnnouncements(announcementsRes.data || []); setGroupTodos(todosRes.data || [])
    } catch { showToast('无法加载群聊协作信息') }
  }, [])

  useEffect(() => {
    if (activeId) { fetchMessages(activeId); fetchSharedFiles(activeId); setEditingRemark(false) }
  }, [activeId, fetchMessages, fetchSharedFiles])

  // 群公告与待办在切换到群聊时立即加载，用于聊天顶部置顶摘要。
  useEffect(() => {
    const conversation = convs.find((item) => item.id === activeId)
    if (activeId && conversation?.partner?.is_group) {
      fetchGroupTools(activeId)
      return
    }
    setGroupAnnouncements([])
    setGroupTodos([])
    setGroupMembers([])
  }, [activeId, convs, fetchGroupTools])

  // 轮询消息
  useEffect(() => {
    if (!activeId) return
    const timer = setInterval(async () => {
      if (document.visibilityState !== 'visible') return
      try {
        const latestId = latestMessageIdRef.current
        const res = await getMessages(activeId, latestId || undefined, 30)
        const newer = (res.data || []).filter((m) => latestId === null || m.id > latestId)
        if (newer.length > 0) { latestMessageIdRef.current = newer.at(-1).id; setMessages((prev) => [...prev, ...newer]) }
      } catch {}
    }, 15000)
    return () => clearInterval(timer)
  }, [activeId])

  useEffect(() => {
    if (activeId) markConversationRead(activeId).catch(() => {})
  }, [activeId])
  useEffect(() => { if (msgListRef.current) msgListRef.current.scrollTop = msgListRef.current.scrollHeight }, [messages])

  // 好友请求
  // 好友请求红点不能依赖用户先点击图标；页面打开后立即加载并定时刷新。
  const fetchFriendReq = useCallback(async (openPanel = false) => {
    try {
      const res = await getFriendRequests()
      setFriendReq(res.data || { received: [], sent: [] })
      if (openPanel) setShowFriendPanel(true)
    } catch {}
  }, [])

  useEffect(() => {
    fetchFriendReq()
    const timer = setInterval(() => { if (document.visibilityState === 'visible') fetchFriendReq() }, 30000)
    return () => clearInterval(timer)
  }, [fetchFriendReq])

  const handleAcceptFriend = async (reqId) => {
    try { const res = await acceptFriendRequest(reqId); setShowFriendPanel(false); setActiveId(res.data.id); fetchConvs(); fetchMessages(res.data.id); fetchFriendReq(); showToast('已添加好友') } catch { showToast('操作失败') }
  }

  const handleRejectFriend = async (reqId) => {
    try { await rejectFriendRequest(reqId); fetchFriendReq(true); showToast('已拒绝') } catch {}
  }

  const handleNewChat = async (userId) => {
    try {
      const res = await createConversation(userId)
      if (res.data) { setShowNewChat(false); setActiveId(res.data.id); fetchConvs(); fetchMessages(res.data.id) }
      else { setShowNewChat(false); showToast(res.message || '请求已发送') }
    } catch (err) { alert(err.userMessage || '操作失败') }
  }

  const handleCreateGroup = async () => {
    if (!groupName.trim()) return showToast('请输入群聊名称')
    if (groupMemberIds.length === 0) return showToast('请至少选择一位好友')
    try {
      const res = await createGroup(groupName.trim(), groupMemberIds)
      setShowNewChat(false)
      setGroupName('')
      setGroupMemberIds([])
      setActiveId(res.data.id)
      fetchConvs()
      fetchMessages(res.data.id)
      showToast('群聊创建成功')
    } catch (err) {
      showToast(err.userMessage || '创建群聊失败')
    }
  }

  const openNewChat = () => {
    setContacts([]); setSearchTerm(''); setGroupName(''); setGroupMemberIds([]); setShowNewChat(true)
  }

  const searchFriendsNow = async () => {
    const keyword = searchTerm.trim()
    if (!keyword) { setContacts([]); return }
    setFriendSearchLoading(true)
    try {
      const result = await getChatContacts(false, keyword)
      setContacts(result.data || [])
    } catch {
      setContacts([])
      showToast('搜索好友失败，请稍后重试')
    } finally {
      setFriendSearchLoading(false)
    }
  }

  const openGroupModal = async () => {
    try {
      const res = await getChatContacts(true)
      setContacts(res.data || [])
      setSearchTerm('')
      setGroupName('')
      setGroupMemberIds([])
      setShowNewChat(false)
      setShowGroupModal(true)
    } catch {}
  }

  const handleSendText = async () => {
    const trimmed = text.trim()
    if (!trimmed || !activeId || sending) return
    setSending(true)
    try { await sendTextMessage(activeId, trimmed); setText(''); fetchMessages(activeId); fetchConvs() } catch (err) { alert(err.userMessage || '发送失败') } finally { setSending(false) }
  }

  const handleFileSelect = (e) => {
    const file = e.target.files[0]; if (!file) return
    setMediaFile(file)
    if (file.type.startsWith('image/')) setMediaPreview(URL.createObjectURL(file))
    else setMediaPreview(null)
  }

  const handlePaste = (e) => {
    const imageItem = Array.from(e.clipboardData?.items || []).find((item) => item.type.startsWith('image/'))
    if (!imageItem) return
    const blob = imageItem.getAsFile()
    if (!blob) return
    e.preventDefault()
    const image = new File([blob], `paste-${Date.now()}.png`, { type: blob.type || 'image/png' })
    setMediaFile(image)
    if (mediaPreview) URL.revokeObjectURL(mediaPreview)
    setMediaPreview(URL.createObjectURL(image))
  }

  const handleSendMedia = async () => {
    if (!mediaFile || !activeId || sending) return
    setSending(true)
    try { await sendMediaMessage(activeId, mediaFile, ''); setMediaFile(null); if (mediaPreview) URL.revokeObjectURL(mediaPreview); setMediaPreview(null); fetchMessages(activeId); fetchConvs() } catch (err) { alert(err.userMessage || '发送失败') } finally { setSending(false) }
  }

  const handleDelete = msgId => setPendingDeleteId(msgId)
  const confirmDelete = async () => {
    try { await deleteMessage(pendingDeleteId); setMessages((prev) => prev.filter((m) => m.id !== pendingDeleteId)); setPendingDeleteId(null) } catch (err) { alert(err.userMessage || '删除失败') }
  }

  const confirmRecall = async () => {
    if (!pendingRecallMessage) return
    try {
      const result = await recallMessage(pendingRecallMessage.id)
      const recalled = result.data
      setMessages(prev => prev.map(message => message.id === recalled.id ? recalled : message))
      setFavIds(prev => { const next = new Set(prev); next.delete(recalled.id); return next })
      setFavorites(prev => prev.filter(item => item.id !== recalled.id))
      await fetchConvs()
      showToast('消息已撤回')
    } catch (error) {
      showToast(error.userMessage || '撤回失败')
    } finally {
      setPendingRecallMessage(null)
    }
  }

  const handleSetRemark = async () => {
    if (!activeId) return
    try { await setRemark(activeId, remarkInput); setEditingRemark(false); fetchConvs() } catch (err) { alert(err.userMessage || '操作失败') }
  }

  const requestScheduleManagement = async user => {
    setFriendContext(null)
    try { await requestManagement(user.id); showToast(`已向 ${user.display_name || user.nickname} 发送日程管理申请`) } catch (error) { showToast(error.userMessage || '申请发送失败') }
  }

  const openFriendContextMenu = (event, conversation) => {
    if (conversation.partner.is_group) return
    event.preventDefault()
    event.stopPropagation()
    setFriendContext({ x: event.clientX, y: event.clientY, user: conversation.partner, conversationId: conversation.id })
  }

  const confirmDeleteFriend = async () => {
    if (!pendingFriendDelete) return
    try {
      await deleteFriend(pendingFriendDelete.user.id)
      if (activeId === pendingFriendDelete.conversationId) {
        setActiveId(null); setMessages([]); navigate('/chat')
      }
      await fetchConvs()
      showToast('好友已删除，重新添加后可恢复历史聊天')
    } catch (error) {
      showToast(error.userMessage || '删除好友失败')
    } finally {
      setPendingFriendDelete(null)
    }
  }

  const openGroupInfo = async mode => {
    if (!activeId) return
    setShowGroupMenu(false); setMemberQuery('')
    await fetchGroupTools(activeId)
    setGroupInfoMode(mode)
  }

  const getMyGroupRole = () => groupMembers.find(member => member.id === me?.id)?.role || 'member'

  const submitGroupPublish = async data => {
    if (!activeId || !groupPublish) return
    try {
      if (groupPublish.mode === 'announcement') await createGroupAnnouncement(activeId, data)
      else await createGroupTodo(activeId, data)
      setGroupPublish(null); await fetchGroupTools(activeId); showToast(groupPublish.mode === 'announcement' ? '群公告已发布' : '群待办已创建')
    } catch (error) { showToast(error.userMessage || '发布失败') }
  }

  const createFromMessage = mode => {
    const message = contextMenu?.msg
    if (!message) return
    if (!['owner', 'admin'].includes(getMyGroupRole())) { setContextMenu(null); showToast('仅群主或群管理员可以发布'); return }
    const title = (message.content || message.file_name || '').trim().slice(0, 200) || (mode === 'announcement' ? '群公告' : '群待办')
    setContextMenu(null)
    setGroupPublish({ mode, source: { messageId: message.id, title, content: message.content || '' } })
  }

  const completeGroupTodo = async todoId => {
    try { await toggleGroupTodo(todoId); await fetchGroupTools(activeId) } catch { showToast('更新待办失败') }
  }

  const openGroupRecordContextMenu = (event, type, item) => {
    event.preventDefault()
    if (!['owner', 'admin'].includes(getMyGroupRole())) return
    setGroupRecordContext({ x: event.clientX, y: event.clientY, type, item })
  }

  const deleteGroupRecord = async () => {
    if (!pendingGroupRecordDelete) return
    const { type, item } = pendingGroupRecordDelete
    try {
      if (type === 'announcement') await deleteGroupAnnouncement(item.id)
      else await deleteGroupTodo(item.id)
      await fetchGroupTools(activeId)
      showToast(type === 'announcement' ? '群公告已删除' : '群待办已删除')
    } catch (error) {
      showToast(error.userMessage || '删除失败')
    } finally {
      setPendingGroupRecordDelete(null)
    }
  }

  const openGroupMemberContextMenu = (event, member) => {
    event.preventDefault()
    event.stopPropagation()
    const myRole = getMyGroupRole()
    if (member.id === me?.id) return
    setGroupMemberContext({ x: event.clientX, y: event.clientY, member, myRole })
  }

  const handleGroupMemberFriendAction = async member => {
    setGroupMemberContext(null)
    if (member.friendship_status === 'friend' && member.direct_conversation_id) {
      setGroupInfoMode(null); setActiveId(member.direct_conversation_id); navigate(`/chat/${member.direct_conversation_id}`)
      return
    }
    if (member.friendship_status !== 'none') return
    try {
      const result = await createConversation(member.id)
      if (result.data?.id) {
        setGroupInfoMode(null); setActiveId(result.data.id); navigate(`/chat/${result.data.id}`); await fetchConvs()
      } else {
        await fetchGroupTools(activeId)
        showToast('好友申请已发送')
      }
    } catch (error) {
      showToast(error.userMessage || '好友申请发送失败')
    }
  }

  const confirmGroupAction = async () => {
    if (!pendingGroupAction || !activeId) return
    const action = pendingGroupAction
    try {
      if (action.type === 'promote') {
        await setGroupMemberRole(activeId, action.member.id, 'admin')
        showToast('已设为管理员')
      } else if (action.type === 'demote') {
        await setGroupMemberRole(activeId, action.member.id, 'member')
        showToast('已撤销管理员')
      } else if (action.type === 'remove') {
        await removeGroupMember(activeId, action.member.id)
        showToast('已移出群聊')
      } else if (action.type === 'dissolve') {
        await dissolveGroup(activeId)
        setActiveId(null); setMessages([]); setGroupInfoMode(null); setShowGroupMenu(false)
        navigate('/chat')
        showToast('群聊已永久解散')
      }
      await fetchConvs()
      if (action.type !== 'dissolve') await fetchGroupTools(activeId)
    } catch (error) {
      showToast(error.userMessage || '群聊管理操作失败')
    } finally {
      setPendingGroupAction(null)
    }
  }

  const submitGroupRename = async name => {
    if (!activeId) return
    try {
      await renameGroup(activeId, name)
      setGroupRenameOpen(false); setShowGroupMenu(false)
      await fetchConvs(); await fetchGroupTools(activeId)
      showToast('群聊名称已更新')
    } catch (error) { showToast(error.userMessage || '修改群聊名称失败') }
  }

  const openGroupInvite = async () => {
    setShowGroupMenu(false)
    try {
      const response = await getChatContacts(true)
      setGroupInviteContacts(response.data || [])
      setGroupInviteOpen(true)
    } catch (error) {
      showToast(error.userMessage || '无法加载好友列表')
    }
  }

  const submitGroupInvite = async userIds => {
    if (!activeId || !userIds.length || groupInviteSubmitting) return
    setGroupInviteSubmitting(true)
    try {
      await addGroupMembers(activeId, userIds)
      setGroupInviteOpen(false)
      await Promise.all([fetchGroupTools(activeId), fetchConvs()])
      showToast(`已邀请 ${userIds.length} 位好友入群`)
    } catch (error) {
      showToast(error.userMessage || '邀请成员失败')
    } finally {
      setGroupInviteSubmitting(false)
    }
  }

  const handleContextMenu = (e, msg) => {
    e.preventDefault()
    if (msg.is_recalled) return
    setContextMenu({ x: e.clientX, y: e.clientY, msg })
  }

  const handleToggleFavorite = async (msg) => {
    setContextMenu(null)
    try {
      if (favIds.has(msg.id)) { await removeFavorite(msg.id); setFavIds(prev => { const next = new Set(prev); next.delete(msg.id); return next }); showToast('已取消收藏') }
      else { await addFavorite(msg.id); setFavIds(prev => new Set([...prev, msg.id])); showToast('已收藏 ⭐') }
    } catch { showToast('操作失败') }
  }

  const handleDownload = () => {
    if (!contextMenu?.msg.file_url) {
      setContextMenu(null)
      return
    }
    downloadAuthorizedChatFile(contextMenu.msg.file_url.split('/').pop(), contextMenu.msg.file_name).catch(() => showToast('下载失败，请稍后重试'))
    setContextMenu(null)
  }

  const addTextToSchedule = () => {
    const content = contextMenu?.msg?.content?.trim()
    if (!content) return
    setContextMenu(null)
    navigate(`/schedules/new?title=${encodeURIComponent(content)}`)
  }

  // 右键菜单 → 弹出标签选择模态
  const triggerAddFromMsg = () => {
    const msg = contextMenu?.msg
    setContextMenu(null)
    if (!msg || !msg.id) return
    setTagModal({ type: 'msg', msgId: msg.id, fileName: msg.file_name || msg.content || '文字消息' })
  }

  // 文件选择 → 弹出标签选择模态
  const handleSharedFileSelect = (e) => {
    const f = e.target.files[0]; if (!f || !activeId) return
    setTagModal({ type: 'file', file: f, fileName: f.name })
    e.target.value = '' // 重置 input 以便再次选择同一文件
  }

  // 标签模态确认
  const confirmTagModal = async (tag, note) => {
    if (!activeId || !tagModal) return
    setFileUploading(true)
    setTagModal(null)
    try {
      if (tagModal.type === 'msg') {
        await addSharedFileFromMsg(activeId, tagModal.msgId, tag || null, note || null)
      } else if (tagModal.type === 'file') {
        await uploadSharedFile(activeId, tagModal.file, tag || null, note || null)
      }
      showToast('文件已添加 ⭐')
      fetchSharedFiles(activeId, fileTagFilter || null)
    } catch { showToast('添加失败') }
    finally { setFileUploading(false) }
  }

  // 搜索
  const handleSearch = async () => {
    if (!searchQuery.trim()) return
    try { const res = await searchChat(searchQuery); setSearchResults(res.data); setShowSearchPanel(true) } catch {}
  }

  const favoriteFetch = async () => { setFavLoading(true); try { const res = await getFavorites(); setFavorites(res.data || []) } finally { setFavLoading(false); setShowFavPanel(true) } }

  const activeConv = convs.find((c) => c.id === activeId)
  const myGroupRole = groupMembers.find(member => member.id === me?.id)?.role || 'member'
  const groupCanManage = ['owner', 'admin'].includes(myGroupRole)
  const groupIsOwner = myGroupRole === 'owner'
  const activeGroupTodos = groupTodos.filter(todo => !todo.is_completed)
  const visibleGroupAnnouncements = expandedGroupSummary.announcements ? groupAnnouncements : groupAnnouncements.slice(0, 2)
  const visibleGroupTodos = expandedGroupSummary.todos ? activeGroupTodos : activeGroupTodos.slice(0, 2)
  const canRecallMessage = message => {
    if (!message || message.is_recalled || !message.created_at) return false
    // MySQL DATETIME 返回的 ISO 时间不带时区；它实际以 UTC 保存。
    // 补上 Z，避免浏览器按本地时区解析后把刚发送的消息误判为超时。
    const createdAt = parseBeijingDate(message.created_at)?.getTime()
    if (!Number.isFinite(createdAt) || Date.now() - createdAt > 2 * 60 * 1000) return false
    if (message.sender_id === me?.id) return true
    return Boolean(activeConv?.partner?.is_group && groupCanManage)
  }
  const filteredContacts = showGroupModal
    ? contacts.filter((contact) => !searchTerm || (contact.nickname || '').includes(searchTerm) || (contact.username || '').includes(searchTerm))
    : contacts
  const totalFriendReq = friendReq.received.length

  const formatTime = (s) => {
    if (!s) return ''
    return isBeijingToday(s) ? formatBeijingTime(s) : formatBeijingShortDateTime(s)
  }

  const formatDateTime = (s) => {
    if (!s) return ''
    return formatBeijingShortDateTime(s)
  }

  const groupedMessages = []
  let lastDate = ''
  for (const m of messages) {
    const date = formatBeijingDate(m.created_at)
    if (date !== lastDate) { groupedMessages.push({ type: 'date', date }); lastDate = date }
    groupedMessages.push({ type: 'msg', ...m })
  }

  const previewLabel = (lm) => {
    if (!lm) return '暂无消息'
    if (lm.is_recalled || lm.msg_type === 'recalled') return '消息已撤回'
    if (lm.msg_type === 'text') return lm.content; if (lm.msg_type === 'image') return '[图片]'; if (lm.msg_type === 'video') return '[视频]'
    return '[文件] ' + (lm.file_name || '')
  }

  const getFileExt = (name) => (name || '').split('.').pop()?.toUpperCase() || ''

  const fileTypeIcon = (t) => ({ image: '🖼', video: '🎬' }[t] || '📄')

  return (
    <div className="page-content chat-page">
      {toast && <div className="fav-toast">{toast}</div>}

      {/* 左栏 */}
      <div className="chat-sidebar">
        <div className="chat-sidebar-header">
          <h3>💬 消息</h3>
          <div style={{ display: 'flex', gap: '0.375rem' }}>
            <button className="btn-cancel" onClick={() => { setShowSearchPanel(true); setSearchQuery('') }} style={{ padding: '0.375rem 0.5rem', fontSize: '0.8rem' }} title="搜索">🔍</button>
            <button className="btn-cancel" onClick={favoriteFetch} style={{ padding: '0.375rem 0.5rem', fontSize: '0.8rem' }} title="收藏">⭐</button>
            <button className="btn-cancel" onClick={() => fetchFriendReq(true)} style={{ padding: '0.375rem 0.5rem', fontSize: '0.8rem', position: 'relative' }} title="好友请求">
              👥{totalFriendReq > 0 && <span style={{ position: 'absolute', top: -4, right: -4, background: '#dc2626', color: 'white', fontSize: '0.6rem', minWidth: 16, height: 16, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{totalFriendReq}</span>}
            </button>
            <button className="btn-submit" onClick={openNewChat} style={{ padding: '0.375rem 0.75rem', fontSize: '0.85rem' }}>+ 新聊天</button>
          </div>
        </div>
        <div className="chat-conv-list">
          {convs.map((c) => (
            <div key={c.id} className={`chat-conv-item ${c.id === activeId ? 'active' : ''}`} onClick={() => setActiveId(c.id)} onContextMenu={event => openFriendContextMenu(event, c)} {...longPressProps(event => openFriendContextMenu(event, c))}>
              <div className={`chat-conv-avatar ${c.has_unread ? 'unread' : ''}`}>{c.partner.display_name.charAt(0).toUpperCase()}</div>
              <div className="chat-conv-info">
                <div className="chat-conv-name">{c.partner.display_name}{c.partner.remark && <span className="chat-conv-remark-tag">备注</span>}</div>
                <div className="chat-conv-preview">{previewLabel(c.last_message)}</div>
              </div>
              <div className="chat-conv-time">{c.last_message ? formatTime(c.last_message.created_at) : ''}</div>
            </div>
          ))}
          {!loading && convs.length === 0 && <div className="empty-state">暂无对话，添加好友开始聊天</div>}
        </div>
      </div>

      {/* 右栏 */}
      <div className="chat-main">
        {activeConv ? (<>
          <div className="chat-header">
            <div className="chat-header-name">
              <span onClick={() => { if (!activeConv.partner.is_group) { setRemarkInput(activeConv.partner.remark || ''); setEditingRemark(true) } }} style={{ cursor: activeConv.partner.is_group ? 'default' : 'pointer' }} title={activeConv.partner.is_group ? '群聊' : '点击设置备注名'}>
                {activeConv.partner.display_name}
                {activeConv.partner.is_group && <span style={{ fontSize: '0.75rem', color: '#6b7280', marginLeft: '0.5rem' }}>群聊</span>}
                {activeConv.partner.remark && <span style={{ fontSize: '0.8rem', color: '#6b7280', marginLeft: '0.5rem' }}>({activeConv.partner.nickname})</span>}
                <span style={{ fontSize: '0.7rem', color: '#9ca3af', marginLeft: '0.375rem' }}>✏️</span>
              </span>
            </div>
            <div style={{ display: 'flex', gap: '0.375rem' }}>
              {activeConv.partner.is_group && <div className="group-more-menu-wrap"><button className="chat-group-more" onClick={() => setShowGroupMenu(value => !value)} aria-label="群聊更多功能" title="群聊更多">⋯</button>{showGroupMenu && <div className="group-more-menu"><button onClick={() => openGroupInfo('members')}>群成员</button><button onClick={() => openGroupInfo('announcements')}>查看群公告</button><button onClick={() => openGroupInfo('todos')}>查看群待办</button>{groupCanManage && <><div className="group-menu-divider" /><button onClick={openGroupInvite}>邀请成员</button><button onClick={() => { setShowGroupMenu(false); setGroupPublish({ mode: 'announcement', source: null }) }}>发布群公告</button><button onClick={() => { setShowGroupMenu(false); setGroupPublish({ mode: 'todo', source: null }) }}>创建群待办</button><button onClick={() => { setShowGroupMenu(false); setGroupRenameOpen(true) }}>修改群聊名称</button></>}{groupIsOwner && <button className="danger" onClick={() => { setShowGroupMenu(false); setPendingGroupAction({ type: 'dissolve' }) }}>解散群聊</button>}</div>}</div>}
              <button className="btn-cancel" onClick={() => { fetchSharedFiles(activeId); setShowFilePanel(!showFilePanel) }} style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }} title="共享文件">📁 {sharedFiles.length || ''}</button>
            </div>
          </div>

          {activeConv.partner.is_group && (groupAnnouncements.length > 0 || activeGroupTodos.length > 0) && (
            <div className="group-chat-top-summary" aria-label="群公告和群待办">
              {visibleGroupAnnouncements.map((announcement) => (
                <button key={announcement.id} type="button" className="group-top-summary-item group-top-announcement" onClick={() => openGroupInfo('announcements')}>
                  <span className="group-top-summary-icon" aria-hidden="true">公告</span>
                  <span className="group-top-summary-content"><strong>{announcement.title || '群公告'}</strong><small>{announcement.content || '点击查看完整群公告'}</small></span>
                  <span className="group-top-summary-link">查看</span>
                </button>
              ))}
              {groupAnnouncements.length > 2 && <button type="button" className="text-button group-expand-button" onClick={() => setExpandedGroupSummary(value => ({ ...value, announcements: !value.announcements }))}>{expandedGroupSummary.announcements ? '收起群公告' : `展开更多群公告（${groupAnnouncements.length - 2}）`}</button>}
              {visibleGroupTodos.map((todo) => (
                <button key={todo.id} type="button" className="group-top-summary-item group-top-todo" onClick={() => openGroupInfo('todos')}>
                  <span className="group-top-summary-icon" aria-hidden="true">待办</span>
                  <span className="group-top-summary-content"><strong>{todo.title || '群待办'}</strong><small>{todo.due_at ? `截止：${formatTime(todo.due_at)}` : '点击查看和完成群待办'}</small></span>
                  <span className="group-top-summary-link">查看</span>
                </button>
              ))}
              {activeGroupTodos.length > 2 && <button type="button" className="text-button group-expand-button" onClick={() => setExpandedGroupSummary(value => ({ ...value, todos: !value.todos }))}>{expandedGroupSummary.todos ? '收起群待办' : `展开更多群待办（${activeGroupTodos.length - 2}）`}</button>}
            </div>
          )}

          {editingRemark && (
            <div className="remark-edit-row" style={{ padding: '0.5rem 1.25rem', background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
              <input value={remarkInput} onChange={(e) => setRemarkInput(e.target.value)} placeholder={activeConv.partner.nickname} className="remark-input" maxLength={50} autoFocus onKeyDown={(e) => { if (e.key === 'Enter') handleSetRemark(); if (e.key === 'Escape') setEditingRemark(false) }} />
              <button className="btn-save-sm" onClick={handleSetRemark}>保存</button>
              <button className="btn-cancel-sm" onClick={() => setEditingRemark(false)}>取消</button>
            </div>
          )}

          {/* 共享文件面板 */}
          {showFilePanel && (
            <div className="shared-files-panel">
              <div className="shared-files-header">
                <span>📁 共享文件</span>
                <span style={{ display: 'flex', gap: '0.375rem', alignItems: 'center' }}>
                  <select value={fileTagFilter} onChange={(e) => { setFileTagFilter(e.target.value); fetchSharedFiles(activeId, e.target.value || null) }} style={{ fontSize: '0.75rem', padding: '0.15rem 0.35rem', borderRadius: 4, border: '1px solid #d1d5db' }}>
                    <option value="">全部标签</option>
                    {FILE_TAGS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <button className="btn-cancel-sm" onClick={() => sharedFileInputRef.current?.click()} disabled={fileUploading}>+ 上传</button>
                  <input ref={sharedFileInputRef} type="file" onChange={handleSharedFileSelect} style={{ display: 'none' }} />
                  <button className="btn-cancel-sm" onClick={() => setShowFilePanel(false)}>✕</button>
                </span>
              </div>
              <div className="shared-files-list">
                {sharedFiles.length === 0 ? <div className="empty-state-small">暂无共享文件，可从聊天中右键添加或直接上传</div> :
                  sharedFiles.map(sf => (
                    <div key={sf.id} className="shared-file-item">
                      <span className="shared-file-icon">{fileTypeIcon(sf.msg_type)}</span>
                      <span className="shared-file-name" onClick={() => sf.file_url?.startsWith('/api/') && downloadAuthorizedChatFile(sf.file_url.split('/').pop(), sf.file_name).catch(() => showToast('下载失败，请稍后重试'))}>{sf.msg_type === 'text' ? (sf.content || sf.file_name) : sf.file_name}</span>
                      {sf.tag && <span className="shared-file-tag">{sf.tag}</span>}
                      {sf.note && <span className="shared-file-note" title={sf.note}>💬</span>}
                      <span className="shared-file-meta">{formatFileSize(sf.file_size)} · {sf.uploader_name} · {formatDateTime(sf.created_at)}</span>
                      <button className="notif-btn-delete" onClick={() => { deleteSharedFile(sf.id); setSharedFiles(prev => prev.filter(x => x.id !== sf.id)) }}>✕</button>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* 消息列表 */}
          <div className="chat-msg-list" ref={msgListRef}>
            {messages.length === 0 && <div className="empty-state">开始聊天吧</div>}
            {groupedMessages.map((item, idx) => {
              if (item.type === 'date') return <div key={`d-${idx}`} className="chat-date-sep"><span>{item.date}</span></div>
              const isMine = item.sender_id === me.id
              const senderName = isMine ? '我' : (item.sender_name || '对方')
              const hasFile = item.file_url != null
              const isLastMine = isMine && messages.filter(m => m.sender_id === me.id).slice(-1)[0]?.id === item.id
              const showRead = isLastMine && activeConv && activeConv.my_last_read
              return (
                <div key={item.id} className={`chat-msg ${isMine ? 'mine' : 'theirs'}`} onContextMenu={(e) => handleContextMenu(e, item)} {...longPressProps(event => handleContextMenu(event, item))}>
                  {!isMine && <div className="chat-msg-avatar">{senderName.charAt(0)}</div>}
                  <div className="chat-msg-bubble">
                    <div className="chat-msg-sender">{senderName}</div>
                    {item.is_recalled ? <div className="chat-msg-recalled">{item.recalled_by_id === me?.id ? '你' : (item.recalled_by_name || senderName)}撤回了一条消息</div> : <>
                    {item.msg_type === 'text' && <div className="chat-msg-text">{item.content}</div>}
                    {item.msg_type === 'image' && hasFile && <ProtectedChatMedia filename={item.file_url.split('/').pop()} type="image" />}
                    {item.msg_type === 'video' && hasFile && <ProtectedChatMedia filename={item.file_url.split('/').pop()} type="video" alt="视频" />}
                    {item.msg_type === 'file' && hasFile && (
                      <div className="chat-file-card" onClick={() => downloadAuthorizedChatFile(item.file_url.split('/').pop(), item.file_name).catch(() => showToast('下载失败，请稍后重试'))}>
                        <div className="chat-file-icon">📄</div>
                        <div className="chat-file-info"><div className="chat-file-name">{item.file_name || '文件'}</div><div className="chat-file-size">{formatFileSize(item.file_size)} · {getFileExt(item.file_name)}</div></div>
                        <div className="chat-file-dl">⬇</div>
                      </div>
                    )}
                    </>}
                    <div className="chat-msg-meta">
                      <span className="chat-msg-time">{formatTime(item.created_at)}</span>
                      {!item.is_recalled && showRead && <span className="chat-read-label">已读</span>}
                      {!item.is_recalled && isMine && <button className="chat-msg-delete" onClick={() => handleDelete(item.id)} title="删除">🗑</button>}
                      {!item.is_recalled && hasFile && isMine && <button className="chat-msg-delete" onClick={() => { downloadAuthorizedChatFile(item.file_url.split('/').pop(), item.file_name).catch(() => showToast('下载失败，请稍后重试')) }} title="下载" style={{ marginLeft: 2 }}>⬇</button>}
                    </div>
                  </div>
                  {isMine && <div className="chat-msg-avatar me">{senderName.charAt(0)}</div>}
                </div>
              )
            })}
          </div>

          {/* 输入栏 */}
          <div className="chat-input-area">
            {mediaFile && (
              <div className="chat-media-preview">
                {mediaPreview && <img src={mediaPreview} alt="preview" />}
                <span>{mediaFile.name} ({formatFileSize(mediaFile.size)})</span>
                <button className="btn-cancel-sm" onClick={() => { setMediaFile(null); if (mediaPreview) URL.revokeObjectURL(mediaPreview); setMediaPreview(null) }}>取消</button>
                <button className="btn-save-sm" onClick={handleSendMedia} disabled={sending}>发送</button>
              </div>
            )}
            <div className="chat-input-row">
              <button className="chat-input-media-btn" onClick={() => fileInputRef.current?.click()} title="发送图片/视频">🖼️</button>
              <button className="chat-input-media-btn" onClick={() => docFileInputRef.current?.click()} title="发送文件（50MB以下）">📁</button>
              {activeConv?.partner && !activeConv.partner.is_group && (
                <button className="chat-input-media-btn" title={`打开微信联系 ${activeConv.partner.display_name}`}
                  onClick={async () => { try { await navigator.clipboard.writeText(activeConv.partner.phone || activeConv.partner.nickname) } catch {}; window.open('weixin://', '_blank') }}>📱</button>
              )}
              <input ref={fileInputRef} type="file" accept="image/*,video/*" onChange={handleFileSelect} style={{ display: 'none' }} />
              <input ref={docFileInputRef} type="file" onChange={handleFileSelect} style={{ display: 'none' }} />
              <input className="chat-input-text" value={text} onChange={(e) => setText(e.target.value)} onPaste={handlePaste} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendText() } }} placeholder="输入消息，或直接粘贴图片..." />
              <button className="btn-submit" onClick={handleSendText} disabled={!text.trim() || sending}>发送</button>
            </div>
          </div>
        </>) : (
          <div className="chat-empty"><div style={{ fontSize: '3rem' }}>💬</div><div style={{ color: '#9ca3af', marginTop: '1rem' }}>选择一个对话开始聊天</div></div>
        )}
      </div>

      {/* 新聊天弹窗 */}
      {showNewChat && (
        <div className="modal-overlay" onClick={() => setShowNewChat(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h3>添加好友</h3><button className="btn-cancel-sm" onClick={() => setShowNewChat(false)}>关闭</button></div>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <input className="search-input" placeholder="输入用户名或昵称" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); searchFriendsNow() } }} autoFocus style={{ flex: 1, minWidth: 0 }} />
              <button type="button" className="btn-submit" onClick={searchFriendsNow} disabled={!searchTerm.trim() || friendSearchLoading}>搜索</button>
            </div>
             <button className="btn-submit" onClick={openGroupModal} style={{ width: '100%', marginBottom: '0.75rem' }}>
               + 创建群聊
             </button>
             <div className="contact-select-list">
              {!searchTerm.trim() && <div className="empty-state">请输入用户名或昵称搜索好友</div>}
              {searchTerm.trim() && friendSearchLoading && <div className="empty-state">正在搜索…</div>}
              {filteredContacts.map((c) => (<div key={c.id} className="contact-select-item" onClick={() => handleNewChat(c.id)}><div className="chat-conv-avatar">{(c.nickname || c.username || '?').charAt(0).toUpperCase()}</div><div className="chat-conv-info"><div className="chat-conv-name">{c.nickname || c.username}</div><div className="chat-conv-preview">@{c.username}</div></div></div>))}
              {searchTerm.trim() && !friendSearchLoading && filteredContacts.length === 0 && <div className="empty-state">没有找到可添加的用户</div>}
            </div>
          </div>
        </div>
      )}

      {/* 好友请求面板 */}
      {showGroupModal && (
        <div className="modal-overlay" onClick={() => setShowGroupModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: '440px', maxHeight: '600px' }}>
            <div className="modal-header"><h3>👥 创建群聊</h3><button className="btn-cancel-sm" onClick={() => setShowGroupModal(false)}>关闭</button></div>
            <input className="search-input" placeholder="群聊名称" value={groupName} onChange={(e) => setGroupName(e.target.value)} maxLength={50} style={{ width: '100%', marginBottom: '0.75rem' }} autoFocus />
            <input className="search-input" placeholder="搜索好友..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={{ width: '100%', marginBottom: '0.5rem' }} />
            <div style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '0.5rem' }}>已选择 {groupMemberIds.length} 位好友（至少选择 1 位）</div>
            <div className="contact-select-list" style={{ maxHeight: '300px', overflowY: 'auto' }}>
              {filteredContacts.map((contact) => {
                const checked = groupMemberIds.includes(contact.id)
                return <label key={contact.id} className="contact-select-item" style={{ cursor: 'pointer' }}>
                  <input type="checkbox" checked={checked} onChange={() => setGroupMemberIds((prev) => checked ? prev.filter((id) => id !== contact.id) : [...prev, contact.id])} />
                  <div className="chat-conv-avatar">{contact.nickname.charAt(0).toUpperCase()}</div>
                  <div className="chat-conv-info"><div className="chat-conv-name">{contact.nickname}</div><div className="chat-conv-preview">@{contact.username}</div></div>
                </label>
              })}
              {filteredContacts.length === 0 && <div className="empty-state">没有可选好友</div>}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
              <button className="btn-cancel" onClick={() => setShowGroupModal(false)}>取消</button>
              <button className="btn-submit" onClick={handleCreateGroup}>创建</button>
            </div>
          </div>
        </div>
      )}

      {showFriendPanel && (
        <div className="modal-overlay" onClick={() => setShowFriendPanel(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: '420px', maxHeight: '540px' }}>
            <div className="modal-header"><h3>👥 好友请求 {totalFriendReq > 0 && `(${totalFriendReq})`}</h3><button className="btn-cancel-sm" onClick={() => setShowFriendPanel(false)}>关闭</button></div>
            <div style={{ flex: 1, overflowY: 'auto', maxHeight: '420px' }}>
              {friendReq.received.length === 0 && friendReq.sent.length === 0 && <div className="empty-state">暂无好友请求</div>}
              {friendReq.received.length > 0 && (
                <div>
                  <div style={{ padding: '0.5rem 0.75rem', fontWeight: 600, fontSize: '0.85rem', color: '#4f46e5' }}>收到的请求</div>
                  {friendReq.received.map(r => (
                    <div key={r.id} className="fav-item">
                      <div className="chat-conv-avatar">{r.sender_name?.charAt(0)}</div>
                      <div className="fav-item-info"><div className="fav-item-name">{r.sender_name}</div><div className="fav-item-detail">{formatTime(r.created_at)}</div></div>
                      <div className="fav-item-actions">
                        <button onClick={() => handleAcceptFriend(r.id)} style={{ color: '#16a34a', borderColor: '#16a34a' }}>✓</button>
                        <button onClick={() => handleRejectFriend(r.id)} style={{ color: '#dc2626', borderColor: '#dc2626' }}>✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {friendReq.sent.length > 0 && (
                <div>
                  <div style={{ padding: '0.5rem 0.75rem', fontWeight: 600, fontSize: '0.85rem', color: '#6b7280' }}>已发送</div>
                  {friendReq.sent.map(r => (
                    <div key={r.id} className="fav-item">
                      <div className="chat-conv-avatar">{r.receiver_name?.charAt(0)}</div>
                      <div className="fav-item-info"><div className="fav-item-name">{r.receiver_name}</div><div className="fav-item-detail">等待对方同意 · {formatTime(r.created_at)}</div></div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 收藏面板 */}
      {showFavPanel && (
        <div className="modal-overlay" onClick={() => setShowFavPanel(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: '480px', maxHeight: '540px' }}>
            <div className="modal-header"><h3>⭐ 我的收藏</h3><button className="btn-cancel-sm" onClick={() => setShowFavPanel(false)}>关闭</button></div>
            <div style={{ flex: 1, overflowY: 'auto', maxHeight: '420px' }}>
              {favLoading ? <div className="empty-state">加载中...</div> : favorites.length === 0 ? <div className="empty-state">暂无收藏</div> :
                favorites.map((f) => (
                  <div key={f.fav_id || f.id} className="fav-item">
                    <div className="fav-item-icon">{fileTypeIcon(f.msg_type)}</div>
                    <div className="fav-item-info"><div className="fav-item-name">{f.file_name || f.content || '文件'}</div><div className="fav-item-detail">{f.partner?.display_name || '未知'} · {formatFileSize(f.file_size)} · {f.file_name ? getFileExt(f.file_name) : ''}</div></div>
                    <div className="fav-item-actions">
                      {f.file_url && <button onClick={() => downloadAuthorizedChatFile(f.file_url.split('/').pop(), f.file_name).catch(() => showToast('下载失败，请稍后重试'))} title="下载">⬇</button>}
                      <button onClick={async () => { await removeFavorite(f.id); setFavorites((prev) => prev.filter((x) => x.id !== f.id)) }} title="取消收藏">✕</button>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* 搜索面板 */}
      {showSearchPanel && (
        <div className="modal-overlay" onClick={() => setShowSearchPanel(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: '520px', maxHeight: '600px' }}>
            <div className="modal-header"><h3>🔍 搜索聊天记录</h3><button className="btn-cancel-sm" onClick={() => { setShowSearchPanel(false); setSearchResults(null) }}>关闭</button></div>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <input className="search-input" placeholder="搜索消息、文件..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleSearch() }} autoFocus style={{ flex: 1 }} />
              <button className="btn-submit" onClick={handleSearch}>搜索</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', maxHeight: '420px' }}>
              {!searchResults ? <div className="empty-state">输入关键词搜索</div> :
                (searchResults.messages?.length || 0) + (searchResults.files?.length || 0) === 0 ? <div className="empty-state">未找到结果</div> : (
                  <div>
                    {searchResults.messages?.length > 0 && (
                      <div>
                        <div style={{ padding: '0.375rem 0', fontWeight: 600, fontSize: '0.85rem', color: '#4f46e5' }}>💬 消息 ({searchResults.messages.length})</div>
                        {searchResults.messages.map(m => (
                          <div key={m.id} className="search-result-item" onClick={() => { setActiveId(m.conversation_id); setShowSearchPanel(false); setSearchResults(null) }}>
                            <div className="chat-conv-avatar" style={{ width: 30, height: 30, fontSize: '0.7rem' }}>{m.partner?.display_name?.charAt(0) || '?'}</div>
                            <div style={{ flex: 1 }}>
                              <div className="fav-item-name">{m.partner?.display_name}</div>
                              <div className="fav-item-detail">{(m.content || m.file_name || '文件').substring(0, 60)} · {formatTime(m.created_at)}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {searchResults.files?.length > 0 && (
                      <div>
                        <div style={{ padding: '0.375rem 0', fontWeight: 600, fontSize: '0.85rem', color: '#059669', marginTop: '0.5rem' }}>📁 文件 ({searchResults.files.length})</div>
                        {searchResults.files.map(sf => (
                          <div key={sf.id} className="search-result-item" onClick={() => { setActiveId(sf.conv_id); setShowSearchPanel(false); setSearchResults(null) }}>
                            <span>{fileTypeIcon(sf.msg_type)}</span>
                            <div style={{ flex: 1 }}><div className="fav-item-name">{sf.msg_type === 'text' ? '文字消息' : sf.file_name}</div>{sf.msg_type === 'text' && <div className="shared-text-content">{sf.content}</div>}<div className="fav-item-detail">来源：{sf.partner?.display_name || '聊天'}{sf.msg_type !== 'text' && ` · ${formatFileSize(sf.file_size)}`} · {sf.uploader_name}</div></div>
                            {sf.file_url && <button onClick={(e) => { e.stopPropagation(); downloadAuthorizedChatFile(sf.file_url.split('/').pop(), sf.file_name).catch(() => showToast('下载失败，请稍后重试')) }}>⬇</button>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
            </div>
          </div>
        </div>
      )}

      {/* 右键菜单 */}
      {contextMenu && (
        <div className="context-menu" style={{ top: contextMenu.y, left: contextMenu.x }}>
          {canRecallMessage(contextMenu.msg) && <><div className="context-menu-item danger" onClick={() => { setPendingRecallMessage(contextMenu.msg); setContextMenu(null) }}>撤回消息</div><div className="context-menu-divider" /></>}
          <div className="context-menu-item" onClick={() => handleToggleFavorite(contextMenu.msg)}>⭐ 收藏/取消收藏</div>
          {contextMenu.msg.msg_type === 'text' ? (
            <div className="context-menu-item" onClick={addTextToSchedule}>📅 添加到日程</div>
          ) : (
            <div className="context-menu-item" onClick={handleDownload}>⬇ 下载</div>
          )}
          <div className="context-menu-divider" />
          <div className="context-menu-item" onClick={triggerAddFromMsg}>📁 添加到共享文件（需选标签）</div>
          {activeConv?.partner?.is_group && groupCanManage && <><div className="context-menu-divider" /><div className="context-menu-item" onClick={() => createFromMessage('announcement')}>设为群公告</div><div className="context-menu-item" onClick={() => createFromMessage('todo')}>设为群待办</div></>}
        </div>
      )}
      {friendContext && <div className="context-menu" style={{ top: friendContext.y, left: friendContext.x }}><div className="context-menu-item" onClick={() => requestScheduleManagement(friendContext.user)}>申请管理日程</div><div className="context-menu-divider" /><div className="context-menu-item danger" onClick={() => { setPendingFriendDelete(friendContext); setFriendContext(null) }}>删除好友</div></div>}
      {groupRecordContext && <div className="context-menu" style={{ top: groupRecordContext.y, left: groupRecordContext.x }}><div className="context-menu-item danger" onClick={() => { setPendingGroupRecordDelete(groupRecordContext); setGroupRecordContext(null) }}>删除{groupRecordContext.type === 'announcement' ? '群公告' : '群待办'}</div></div>}
      {groupMemberContext && <div className="context-menu" style={{ top: groupMemberContext.y, left: groupMemberContext.x }}>
        {groupMemberContext.member.friendship_status === 'friend' && <div className="context-menu-item" onClick={() => handleGroupMemberFriendAction(groupMemberContext.member)}>发消息</div>}
        {groupMemberContext.member.friendship_status === 'none' && <div className="context-menu-item" onClick={() => handleGroupMemberFriendAction(groupMemberContext.member)}>添加好友</div>}
        {groupMemberContext.member.friendship_status === 'pending_outgoing' && <div className="context-menu-item disabled">好友申请中</div>}
        {groupMemberContext.member.friendship_status === 'pending_incoming' && <div className="context-menu-item disabled">对方已发送好友申请</div>}
        {groupMemberContext.myRole === 'owner' && groupMemberContext.member.role === 'member' && <div className="context-menu-item" onClick={() => { setPendingGroupAction({ type: 'promote', member: groupMemberContext.member }); setGroupMemberContext(null) }}>设为管理员</div>}
        {groupMemberContext.myRole === 'owner' && groupMemberContext.member.role === 'admin' && <div className="context-menu-item" onClick={() => { setPendingGroupAction({ type: 'demote', member: groupMemberContext.member }); setGroupMemberContext(null) }}>撤销管理员</div>}
        {((groupMemberContext.myRole === 'owner' && groupMemberContext.member.role !== 'owner') || (groupMemberContext.myRole === 'admin' && groupMemberContext.member.role === 'member')) && <><div className="context-menu-divider" /><div className="context-menu-item danger" onClick={() => { setPendingGroupAction({ type: 'remove', member: groupMemberContext.member }); setGroupMemberContext(null) }}>移出群聊</div></>}
      </div>}

      {/* 标签选择模态框 */}
      {tagModal && (
        <TagSelectModal
          fileName={tagModal.fileName}
          onConfirm={confirmTagModal}
          onClose={() => setTagModal(null)}
        />
      )}
      <ConfirmDialog open={pendingDeleteId !== null} danger title="删除消息" message="确定删除这条消息吗？删除后无法恢复。" confirmText="删除" onCancel={() => setPendingDeleteId(null)} onConfirm={confirmDelete} />
      <ConfirmDialog open={pendingRecallMessage !== null} danger title="撤回消息" message="撤回后，所有会话成员将看到撤回提示，且消息内容无法恢复。" confirmText="撤回" onCancel={() => setPendingRecallMessage(null)} onConfirm={confirmRecall} />
      <ConfirmDialog open={pendingFriendDelete !== null} danger title="删除好友" message={`删除 ${pendingFriendDelete?.user?.display_name || pendingFriendDelete?.user?.nickname || '该好友'} 后，双方私聊将隐藏且日程授权会立即撤销；重新添加后可恢复历史聊天。`} confirmText="删除好友" onCancel={() => setPendingFriendDelete(null)} onConfirm={confirmDeleteFriend} />
      <ConfirmDialog open={pendingGroupRecordDelete !== null} danger title={pendingGroupRecordDelete?.type === 'announcement' ? '删除群公告' : '删除群待办'} message="删除后群成员将无法再查看此内容，确定继续吗？" confirmText="删除" onCancel={() => setPendingGroupRecordDelete(null)} onConfirm={deleteGroupRecord} />
      <ConfirmDialog open={pendingGroupAction !== null} danger={['remove', 'dissolve'].includes(pendingGroupAction?.type)} title={pendingGroupAction?.type === 'dissolve' ? '永久解散群聊' : pendingGroupAction?.type === 'remove' ? '移出群成员' : pendingGroupAction?.type === 'promote' ? '设为管理员' : '撤销管理员'} message={pendingGroupAction?.type === 'dissolve' ? '解散后会永久删除全部消息、公告、待办和共享文件，且无法恢复。' : pendingGroupAction?.type === 'remove' ? `确定将 ${pendingGroupAction?.member?.nickname || pendingGroupAction?.member?.username || '该成员'} 移出群聊吗？` : pendingGroupAction?.type === 'promote' ? '该成员将获得邀请好友、移出普通成员、修改群名及维护群公告和群待办的权限。' : '该成员将恢复为普通成员。'} confirmText={pendingGroupAction?.type === 'dissolve' ? '永久解散' : pendingGroupAction?.type === 'remove' ? '移出群聊' : '确认'} onCancel={() => setPendingGroupAction(null)} onConfirm={confirmGroupAction} />
      {groupPublish && <GroupPublishModal mode={groupPublish.mode} source={groupPublish.source} onClose={() => setGroupPublish(null)} onSubmit={submitGroupPublish} />}
      {groupRenameOpen && <GroupRenameModal initialName={activeConv?.partner?.display_name} onClose={() => setGroupRenameOpen(false)} onSubmit={submitGroupRename} />}
      {groupInviteOpen && <GroupInviteModal contacts={groupInviteContacts} members={groupMembers} submitting={groupInviteSubmitting} onClose={() => setGroupInviteOpen(false)} onSubmit={submitGroupInvite} />}
      {groupInfoMode && <GroupInfoModal mode={groupInfoMode} members={groupMembers} announcements={groupAnnouncements} todos={groupTodos} memberQuery={memberQuery} setMemberQuery={setMemberQuery} onClose={() => setGroupInfoMode(null)} onToggleTodo={completeGroupTodo} onRecordContextMenu={openGroupRecordContextMenu} onMemberContextMenu={openGroupMemberContextMenu} myRole={myGroupRole} />}
    </div>
  )
}
