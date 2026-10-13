import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react'
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
  getConversationTags, createConversationTag, renameConversationTag, deleteConversationTag, setConversationTags,
} from '../api/chat'
import { getNotifications } from '../api/notifications'
import { ConfirmDialog } from '../components/common/Ui'
import { requestManagement } from '../api/scheduleManagement'
import { longPressProps } from '../components/common/longPress'
import useDebouncedValue from '../hooks/useDebouncedValue'
import useIsMobile from '../hooks/useIsMobile'
import { useMobileNav } from '../components/mobile/MobileNavBar'
import MobileActionSheet from '../components/mobile/MobileActionSheet'
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

// 弹出菜单里的线条图标（24×24 画布，颜色跟随文字色）
const STAR_POINTS = '12 3.5 14.6 8.8 20.4 9.6 16.2 13.7 17.2 19.5 12 16.8 6.8 19.5 7.8 13.7 3.6 9.6 9.4 8.8'
const SHIELD_PATH = 'M12 3.5 5 6.5v5c0 4.2 2.9 7.6 7 9 4.1-1.4 7-4.8 7-9v-5z'
const MENU_ICONS = {
  // 消息
  copy: <><rect x="8.5" y="8.5" width="11" height="11" rx="2" /><path d="M15.5 8.5v-2a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2" /></>,
  star: <polygon points={STAR_POINTS} />,
  starFilled: <polygon points={STAR_POINTS} fill="currentColor" />,
  calendar: <><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M3.5 9.5h17M8 3v4M16 3v4M12 12.5v5M9.5 15h5" /></>,
  download: <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14" />,
  folder: <path d="M3.5 7a2 2 0 0 1 2-2h4l2 2.5h7a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />,
  trash: <path d="M4.5 7h15M10 4h4M6.5 7l.9 12a2 2 0 0 0 2 1.8h5.2a2 2 0 0 0 2-1.8l.9-12M10 11v5.5M14 11v5.5" />,
  recall: <><path d="M9 5.5 4.5 10 9 14.5" /><path d="M4.5 10h10a5 5 0 0 1 0 10H11" /></>,
  announcement: <><path d="M4 10v4a1 1 0 0 0 1 1h2l6 4V5L7 9H5a1 1 0 0 0-1 1z" /><path d="M16.5 9a4 4 0 0 1 0 6M19 6.5a7.5 7.5 0 0 1 0 11" /></>,
  todo: <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="m8.5 12 2.5 2.5 4.5-5" /></>,
  // 会话列表
  tag: <><path d="M3.5 4.5v6.6a1.5 1.5 0 0 0 .44 1.06l7.9 7.9a1.5 1.5 0 0 0 2.12 0l6.1-6.1a1.5 1.5 0 0 0 0-2.12l-7.9-7.9A1.5 1.5 0 0 0 11.1 3.5H4.5a1 1 0 0 0-1 1z" /><circle cx="8" cy="8" r="1.4" /></>,
  calendarCheck: <><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M3.5 9.5h17M8 3v4M16 3v4M9 14.5l2 2 4-4" /></>,
  userRemove: <><circle cx="9.5" cy="8" r="3.5" /><path d="M3 20a6.5 6.5 0 0 1 13 0M16.5 11h5" /></>,
  // 群成员
  chat: <path d="M4.5 5h15A1.5 1.5 0 0 1 21 6.5v9a1.5 1.5 0 0 1-1.5 1.5H11l-5 3.5V17H4.5A1.5 1.5 0 0 1 3 15.5v-9A1.5 1.5 0 0 1 4.5 5z" />,
  userAdd: <><circle cx="9.5" cy="8" r="3.5" /><path d="M3 20a6.5 6.5 0 0 1 13 0M19 8v6M16 11h6" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  shieldCheck: <><path d={SHIELD_PATH} /><path d="m9 12 2 2 4-4" /></>,
  shieldMinus: <><path d={SHIELD_PATH} /><path d="M9 12h6" /></>,
  exit: <path d="M13.5 4.5h-7A1.5 1.5 0 0 0 5 6v12a1.5 1.5 0 0 0 1.5 1.5h7M10 12h10.5M17 8.5l3.5 3.5-3.5 3.5" />,
}
const MENU_COLUMNS = 5

// 记下弹出菜单要贴着的元素、按下的位置，以及菜单不能越出的可视区域（不传 area 时为整个窗口），交给 ActionPopover 计算位置。
// 拿不到元素时退化为贴着按下的那个点
function popoverPosition(event, element, area) {
  const rect = element ? element.getBoundingClientRect() : { top: event.clientY, bottom: event.clientY, left: event.clientX, right: event.clientX }
  const box = area ? area.getBoundingClientRect() : { top: 0, bottom: window.innerHeight, left: 0, right: window.innerWidth }
  return {
    point: { x: event.clientX, y: event.clientY },
    anchor: { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right },
    bounds: { top: Math.max(box.top, 0), bottom: Math.min(box.bottom, window.innerHeight), left: Math.max(box.left, 0), right: Math.min(box.right, window.innerWidth) },
  }
}

// 长按 / 右键弹出的操作菜单（消息、会话、群成员、群公告和待办共用）：贴着被操作的元素弹出，样式参照微信的深色图标菜单，一行最多 5 个操作。
// 位置：先试元素上方，放不下再试下方；元素太高、上下都放不下时，改为贴着按下的位置弹出。小三角始终指向元素的水平中线。
// position 来自 popoverPosition：anchor 是元素在屏幕上的位置，point 是按下的位置，bounds 是菜单不能越出的可视区域
function ActionPopover({ position, actions }) {
  const { anchor, point, bounds } = position
  const menuRef = useRef(null)
  const [layout, setLayout] = useState(null)

  // 先以不可见状态渲染、量出菜单尺寸，再在浏览器绘制之前算好位置，菜单不会先闪在别处
  useLayoutEffect(() => {
    const menu = menuRef.current
    if (!menu) return
    const width = menu.offsetWidth
    const height = menu.offsetHeight
    const gap = 9 // 菜单和元素之间留给小三角的距离
    const edge = 6 // 菜单离可视区域边缘至少留出的距离
    const fitsAbove = y => y - gap - height >= bounds.top + edge
    const fitsBelow = y => y + gap + height <= bounds.bottom - edge
    let placement = 'above'
    let top
    if (fitsAbove(anchor.top)) top = anchor.top - gap - height
    else if (fitsBelow(anchor.bottom)) { placement = 'below'; top = anchor.bottom + gap }
    else if (fitsAbove(point.y)) top = point.y - gap - height
    else { placement = 'below'; top = point.y + gap }
    const centerX = (anchor.left + anchor.right) / 2
    let left = Math.max(bounds.left + edge, Math.min(centerX - width / 2, bounds.right - edge - width))
    // 兜底：可视区域比菜单还小时，至少让菜单完整留在窗口里
    top = Math.max(edge, Math.min(top, window.innerHeight - edge - height))
    left = Math.max(edge, Math.min(left, window.innerWidth - edge - width))
    // 小三角不能伸到菜单的圆角外面
    const arrowLeft = Math.max(14, Math.min(centerX - left, width - 14))
    setLayout({ top, left, placement, arrowLeft })
  }, [anchor, point, bounds, actions.length])

  if (!actions.length) return null
  const rows = []
  for (let i = 0; i < actions.length; i += MENU_COLUMNS) rows.push(actions.slice(i, i + MENU_COLUMNS))
  return (
    <div ref={menuRef} className={`action-popover${layout ? ` is-${layout.placement}` : ''}`}
      style={layout ? { top: layout.top, left: layout.left, '--arrow-left': `${layout.arrowLeft}px` } : { top: 0, left: 0, visibility: 'hidden' }}
      onContextMenu={event => event.preventDefault()}>
      {rows.map((row, index) => (
        <div key={index} className="action-popover-row">
          {row.map(action => (
            // disabled 的项只作状态提示（如「好友申请中」），显示为灰色、点了没反应
            <button key={action.key} type="button" className="action-popover-item" aria-label={action.label} title={action.title} disabled={action.disabled} onClick={action.onClick}>
              <svg viewBox="0 0 24 24" aria-hidden="true">{MENU_ICONS[action.icon]}</svg>
              <span>{action.label}</span>
            </button>
          ))}
        </div>
      ))}
    </div>
  )
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

// 给一个会话设置标签：点选已有标签（可多选），也可以当场新建
function TagAssignModal({ conversationName, tags, selectedIds, onClose, onSubmit, onCreateTag }) {
  const [selected, setSelected] = useState(selectedIds)
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)
  const toggle = id => setSelected(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id])
  const addTag = async () => {
    const name = newName.trim()
    if (!name) return
    const tag = await onCreateTag(name)
    if (tag) { setSelected(prev => [...prev, tag.id]); setNewName('') }
  }
  const submit = async () => { setSaving(true); await onSubmit(selected); setSaving(false) }
  return <div className="modal-overlay" onMouseDown={onClose}><section className="modal chat-tag-modal" onMouseDown={event => event.stopPropagation()}>
    <div className="modal-header"><div><span className="file-eyebrow">会话标签</span><h3>设置标签</h3></div><button type="button" className="text-button" onClick={onClose}>关闭</button></div>
    <p className="chat-tag-hint">给「{conversationName}」选择标签，可以多选；标签只有你自己看得到。</p>
    <div className="chat-tag-options">
      {tags.map(tag => <button key={tag.id} type="button" className={selected.includes(tag.id) ? 'selected' : ''} aria-pressed={selected.includes(tag.id)} onClick={() => toggle(tag.id)}>{selected.includes(tag.id) ? '✓ ' : ''}{tag.name}</button>)}
      {!tags.length && <span className="chat-tag-empty">还没有标签，在下面新建一个</span>}
    </div>
    <div className="chat-tag-create"><input value={newName} onChange={event => setNewName(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addTag() } }} placeholder="新建标签，如：患者群" maxLength={20} /><button type="button" className="btn-secondary" disabled={!newName.trim()} onClick={addTag}>新建</button></div>
    <div className="modal-actions"><button type="button" className="btn-cancel" onClick={onClose}>取消</button><button type="button" className="btn-submit" disabled={saving} onClick={submit}>{saving ? '保存中…' : '保存'}</button></div>
  </section></div>
}

// 管理全部标签：新建、改名、删除（删除前由页面弹出确认框）
function TagManageModal({ tags, convIds, onClose, onCreate, onRename, onDelete }) {
  const [newName, setNewName] = useState('')
  const [editing, setEditing] = useState(null)
  const addTag = async () => { const name = newName.trim(); if (name && await onCreate(name)) setNewName('') }
  const saveRename = async () => { const name = editing?.name.trim(); if (name && await onRename(editing.id, name)) setEditing(null) }
  return <div className="modal-overlay" onMouseDown={onClose}><section className="modal chat-tag-modal" onMouseDown={event => event.stopPropagation()}>
    <div className="modal-header"><div><span className="file-eyebrow">会话标签</span><h3>管理标签</h3></div><button type="button" className="text-button" onClick={onClose}>关闭</button></div>
    <p className="chat-tag-hint">在会话上右键（手机上长按）就能给它设置标签；标签只有你自己看得到。</p>
    <div className="chat-tag-manage-list">
      {tags.map(tag => <div key={tag.id} className="chat-tag-manage-row">
        {editing?.id === tag.id
          ? <input autoFocus value={editing.name} onChange={event => setEditing({ ...editing, name: event.target.value })} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); saveRename() } }} maxLength={20} aria-label="标签新名称" />
          : <span><strong>{tag.name}</strong><small>{tag.conversation_ids.filter(id => convIds.has(id)).length} 个会话</small></span>}
        <span className="chat-tag-row-actions">
          {editing?.id === tag.id
            ? <><button type="button" className="text-button" onClick={saveRename}>保存</button><button type="button" className="text-button" onClick={() => setEditing(null)}>取消</button></>
            : <><button type="button" className="text-button" onClick={() => setEditing({ id: tag.id, name: tag.name })}>改名</button><button type="button" className="text-button danger" onClick={() => onDelete(tag)}>删除</button></>}
        </span>
      </div>)}
      {!tags.length && <div className="chat-tag-empty">还没有标签</div>}
    </div>
    <div className="chat-tag-create"><input value={newName} onChange={event => setNewName(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addTag() } }} placeholder="新建标签" maxLength={20} /><button type="button" className="btn-secondary" disabled={!newName.trim()} onClick={addTag}>新建</button></div>
  </section></div>
}

function GroupInviteModal({ contacts, members, submitting, onClose, onSubmit }) {
  const [query, setQuery] = useState('')
  const [selectedIds, setSelectedIds] = useState([])
  const memberIds = new Set(members.map(member => member.id))
  const candidates = contacts.filter(contact => !memberIds.has(contact.id) && `${contact.nickname || ''} ${contact.username || ''}`.toLowerCase().includes(query.trim().toLowerCase()))
  const toggle = userId => setSelectedIds(previous => previous.includes(userId) ? previous.filter(id => id !== userId) : [...previous, userId])

  return <div className="modal-overlay" onMouseDown={onClose}><section className="modal" onMouseDown={event => event.stopPropagation()} style={{ width: 440, maxHeight: '620px' }}><div className="modal-header"><div><span className="file-eyebrow">群成员管理</span><h3>邀请好友加入群聊</h3></div><button type="button" className="text-button" onClick={onClose}>关闭</button></div><input className="search-input" value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索昵称或用户名" autoFocus /><p className="group-info-count">已选择 {selectedIds.length} 位好友</p><div className="contact-select-list" style={{ maxHeight: 330, overflowY: 'auto' }}>{candidates.map(contact => { const checked = selectedIds.includes(contact.id); return <label key={contact.id} className="contact-select-item" style={{ cursor: 'pointer' }}><input type="checkbox" checked={checked} onChange={() => toggle(contact.id)} /><div className="chat-conv-avatar">{(contact.nickname || contact.username || '?').charAt(0).toUpperCase()}</div><div className="chat-conv-info"><div className="chat-conv-name">{contact.nickname || contact.username}</div><div className="chat-conv-preview">@{contact.username}</div></div></label> })}{!candidates.length && <div className="empty-state">没有可邀请的好友</div>}</div><div className="modal-actions"><button type="button" className="btn-secondary" onClick={onClose}>取消</button><button type="button" className="btn-primary" disabled={!selectedIds.length || submitting} onClick={() => onSubmit(selectedIds)}>{submitting ? '邀请中…' : '邀请入群'}</button></div></section></div>
}

// menuMemberId、menuRecordId：正弹出菜单的那位成员、那条公告或待办，用于高亮这一行
function GroupInfoModal({ mode, members, announcements, todos, memberQuery, setMemberQuery, onClose, onToggleTodo, onRecordContextMenu, onMemberContextMenu, myRole, menuMemberId, menuRecordId }) {
  const [expanded, setExpanded] = useState(false)
  const filteredMembers = members.filter(member => `${member.nickname || ''} ${member.username || ''}`.toLowerCase().includes(memberQuery.toLowerCase()))
  const activeTodos = todos.filter(item => !item.is_completed)
  const records = mode === 'announcements' ? announcements : activeTodos
  const visibleRecords = expanded ? records : records.slice(0, 2)
  const title = mode === 'members' ? '群成员' : mode === 'announcements' ? '群公告' : '群待办'
  const roleLabel = { owner: '群主', admin: '管理员', member: '成员' }
  const managementHint = myRole === 'owner' ? '点按管理员或普通成员可管理' : myRole === 'admin' ? '点按普通成员可管理' : '点按成员可添加好友或发消息'
  return <div className="modal-overlay" onMouseDown={onClose}><section className="modal group-info-modal" onMouseDown={event => event.stopPropagation()}><div className="modal-header"><div><span className="file-eyebrow">群聊信息</span><h3>{title}</h3></div><button className="text-button" onClick={onClose}>关闭</button></div>{mode === 'members' && <><label className="ui-search-field"><span>⌕</span><input value={memberQuery} onChange={event => setMemberQuery(event.target.value)} placeholder="搜索群成员" /></label><p className="group-info-count">共 {members.length} 位成员 · {managementHint}</p><div className="group-member-list">{filteredMembers.map(member => <div key={member.id} className={`group-member-row${member.id === menuMemberId ? ' is-menu-target' : ''}`} onClick={event => onMemberContextMenu(event, member)} onContextMenu={event => onMemberContextMenu(event, member)} {...longPressProps(event => onMemberContextMenu(event, member))}><b>{(member.nickname || member.username || '?').charAt(0)}</b><div><strong>{member.nickname || '未命名成员'}<span className={`group-role-badge ${member.role || 'member'}`}>{roleLabel[member.role] || '成员'}</span></strong><small>@{member.username || '—'}</small></div></div>)}{!filteredMembers.length && <div className="empty-state-small">没有匹配的成员</div>}</div></>}{mode === 'announcements' && <div className="group-record-list">{visibleRecords.map(item => <article key={item.id} className={item.id === menuRecordId ? 'is-menu-target' : undefined} onContextMenu={event => onRecordContextMenu(event, 'announcement', item)} {...longPressProps(event => onRecordContextMenu(event, 'announcement', item))}><strong>{item.title}</strong><p>{item.content || '无正文'}</p><small>{item.creator_name || '群成员'} · {formatBeijingDateTime(item.updated_at)}</small></article>)}{!records.length && <div className="empty-state-small">暂无群公告</div>}{records.length > 2 && <button className="text-button group-expand-button" onClick={() => setExpanded(value => !value)}>{expanded ? '收起' : `展开更多（${records.length - 2}）`}</button>}</div>}{mode === 'todos' && <div className="group-record-list">{visibleRecords.map(item => <article key={item.id} className={item.id === menuRecordId ? 'is-menu-target' : undefined} onContextMenu={event => onRecordContextMenu(event, 'todo', item)} {...longPressProps(event => onRecordContextMenu(event, 'todo', item))}><button className="todo-check" onClick={() => onToggleTodo(item.id)} aria-label="完成待办"></button><div><strong>{item.title}</strong><small>{item.creator_name || '群成员'} · {formatBeijingDateTime(item.updated_at)}</small></div></article>)}{!records.length && <div className="empty-state-small">暂无群待办</div>}{records.length > 2 && <button className="text-button group-expand-button" onClick={() => setExpanded(value => !value)}>{expanded ? '收起' : `展开更多（${records.length - 2}）`}</button>}</div>}</section></div>
}

// 会话列表当前页签（好友 / 群聊）在本机浏览器里的存储键
const CONV_TAB_KEY = 'chat-conv-tab'

export default function ChatPage() {
  const { conversationId } = useParams()
  const navigate = useNavigate()
  const { user: me } = useAuth()

  const [convs, setConvs] = useState([])
  const [activeId, setActiveId] = useState(parseInt(conversationId) || null)
  // 会话列表分「好友」「群聊」两个页签，默认停在本机上次用的页签；浏览器存储不可用时退回「好友」
  const [convTab, setConvTab] = useState(() => {
    try { return localStorage.getItem(CONV_TAB_KEY) === 'groups' ? 'groups' : 'friends' } catch { return 'friends' }
  })
  const syncedTabConvRef = useRef(null)
  // 会话标签（个人私有）：我的标签、各页签选中的标签筛选（null 为全部）、正在设置标签的会话、管理弹窗、待确认删除的标签
  const [convTags, setConvTags] = useState([])
  const [tagFilter, setTagFilter] = useState({ friends: null, groups: null })
  const [tagAssignConv, setTagAssignConv] = useState(null)
  const [showTagManager, setShowTagManager] = useState(false)
  const [pendingTagDelete, setPendingTagDelete] = useState(null)
  const isMobile = useIsMobile()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [mention, setMention] = useState(null)
  const [mentionIndex, setMentionIndex] = useState(0)
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
  const textInputRef = useRef(null)
  const fileInputRef = useRef(null)
  const docFileInputRef = useRef(null)
  const sharedFileInputRef = useRef(null)
  const latestMessageIdRef = useRef(null)

  useEffect(() => {
    const input = textInputRef.current
    if (!input) return
    input.style.height = 'auto'
    input.style.height = `${Math.min(input.scrollHeight, 128)}px`
  }, [text, activeId])

  useEffect(() => { setMention(null) }, [activeId])

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
  // 弹出菜单都贴着元素定位：页面上任何地方一滚动、窗口尺寸一变，位置就对不上了，直接收起
  const popoverOpen = Boolean(contextMenu || friendContext || groupRecordContext || groupMemberContext)
  useEffect(() => {
    if (!popoverOpen) return
    const close = () => { setContextMenu(null); setFriendContext(null); setGroupRecordContext(null); setGroupMemberContext(null) }
    // 滚动事件不会冒泡，在捕获阶段监听才能收到消息列表、会话列表、弹窗列表各自的滚动
    document.addEventListener('scroll', close, { capture: true, passive: true })
    window.addEventListener('resize', close)
    return () => { document.removeEventListener('scroll', close, { capture: true }); window.removeEventListener('resize', close) }
  }, [popoverOpen])
  // 已收藏的消息：进入聊天页加载一次，消息菜单据此显示「收藏」还是「取消收藏」
  useEffect(() => {
    getFavorites().then(res => setFavIds(new Set((res.data || []).map(item => item.id)))).catch(() => {})
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
  // 标签只会因本人操作而变化：进入聊天页加载一次，增删改之后再刷新
  const fetchTags = useCallback(async () => {
    try { const res = await getConversationTags(); setConvTags(res.data || []) } catch {}
  }, [])
  useEffect(() => { fetchTags() }, [fetchTags])
  useEffect(() => { if (conversationId) setActiveId(parseInt(conversationId)) }, [conversationId])
  // 手机端：会话列表（/chat）和聊天窗口（/chat/会话号）是前后两页，由网址决定显示哪一页。
  // 回到列表时清空当前会话；在列表里选中会话（点击、搜索结果、新建等）时跳转到聊天窗口，返回键即可回到列表
  useEffect(() => { if (isMobile && !conversationId) setActiveId(null) }, [isMobile, conversationId])
  useEffect(() => {
    if (isMobile && activeId && String(activeId) !== conversationId) navigate(`/chat/${activeId}`)
  }, [isMobile, activeId]) // 只在当前会话变化时跳转，网址变化不触发
  useEffect(() => {
    try { localStorage.setItem(CONV_TAB_KEY, convTab) } catch {}
  }, [convTab])
  // 打开某个会话（点击、搜索结果、通知链接等）时，若它属于另一个页签就自动切过去，保证当前会话在列表里可见。
  // 每次打开只同步一次：之后会话列表每 15 秒刷新，不会把用户手动切换的页签又切回去
  useEffect(() => {
    if (!activeId) { syncedTabConvRef.current = null; return }
    if (syncedTabConvRef.current === activeId) return
    const conv = convs.find(item => item.id === activeId)
    if (!conv) return
    syncedTabConvRef.current = activeId
    const tab = conv.partner?.is_group ? 'groups' : 'friends'
    setConvTab(tab)
    // 当前会话不带已选的标签时，该页签退回「全部」，同样是为了让它在列表里可见
    setTagFilter(prev => (prev[tab] && !convTags.some(tag => tag.id === prev[tab] && tag.conversation_ids.includes(conv.id)) ? { ...prev, [tab]: null } : prev))
  }, [activeId, convs, convTags])
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
    // 先刷新会话列表再选中新会话：否则「当前会话不在列表里就取消选中」的检查会抢先把它取消掉
    try { const res = await acceptFriendRequest(reqId); setShowFriendPanel(false); await fetchConvs(); setActiveId(res.data.id); fetchMessages(res.data.id); fetchFriendReq(); showToast('已添加好友') } catch { showToast('操作失败') }
  }

  const handleRejectFriend = async (reqId) => {
    try { await rejectFriendRequest(reqId); fetchFriendReq(true); showToast('已拒绝') } catch {}
  }

  const handleNewChat = async (userId) => {
    try {
      const res = await createConversation(userId)
      // 对方恰好已发来申请时会直接成为好友并新建会话：先刷新会话列表再选中，否则会被「不在列表里就取消选中」的检查取消掉
      if (res.data) { setShowNewChat(false); await fetchConvs(); setActiveId(res.data.id); fetchMessages(res.data.id) }
      else { setShowNewChat(false); showToast(res.message || '请求已发送') }
    } catch (err) { showToast(err.userMessage || '操作失败') }
  }

  const handleCreateGroup = async () => {
    if (!groupName.trim()) return showToast('请输入群聊名称')
    if (groupMemberIds.length === 0) return showToast('请至少选择一位好友')
    try {
      const res = await createGroup(groupName.trim(), groupMemberIds)
      setShowNewChat(false)
      setShowGroupModal(false)
      setGroupName('')
      setGroupMemberIds([])
      // 先刷新会话列表再选中新群：否则「当前会话不在列表里就取消选中」的检查会抢先把新群取消掉
      await fetchConvs()
      setActiveId(res.data.id)
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

  // 「＋」按当前页签行事：好友页签发起新聊天（添加好友），群聊页签直接创建群聊
  const openAddForTab = () => (convTab === 'groups' ? openGroupModal() : openNewChat())

  // 会话标签：给会话设置标签、新建 / 改名 / 删除标签，成功后重新拉取标签列表
  const openTagAssign = (convId) => { setTagAssignConv(convs.find((c) => c.id === convId) || null); setFriendContext(null) }
  const saveConversationTags = async (tagIds) => {
    if (!tagAssignConv) return
    try { await setConversationTags(tagAssignConv.id, tagIds); setTagAssignConv(null); await fetchTags(); showToast('标签已更新') }
    catch (err) { showToast(err.userMessage || '保存标签失败') }
  }
  const createTag = async (name) => {
    try { const res = await createConversationTag(name); await fetchTags(); return res.data }
    catch (err) { showToast(err.userMessage || '新建标签失败'); return null }
  }
  const renameTag = async (tagId, name) => {
    try { await renameConversationTag(tagId, name); await fetchTags(); return true }
    catch (err) { showToast(err.userMessage || '重命名标签失败'); return false }
  }
  const confirmDeleteTag = async () => {
    if (!pendingTagDelete) return
    try { await deleteConversationTag(pendingTagDelete.id); setPendingTagDelete(null); await fetchTags(); showToast('标签已删除') }
    catch (err) { showToast(err.userMessage || '删除标签失败') }
  }

  const handleSendText = async () => {
    const trimmed = text.trim()
    if (!trimmed || !activeId || sending) return
    setSending(true)
    try { await sendTextMessage(activeId, trimmed); setText(''); setMention(null); fetchMessages(activeId); fetchConvs() } catch (err) { alert(err.userMessage || '发送失败') } finally { setSending(false) }
  }

  const updateMention = (value, caret) => {
    if (!convs.find(item => item.id === activeId)?.partner?.is_group) { setMention(null); return }
    const prefix = value.slice(0, caret)
    const match = prefix.match(/(?:^|\s)@([^\s@]*)$/u)
    setMention(match ? { start: caret - match[1].length - 1, end: caret, query: match[1] } : null)
    setMentionIndex(0)
  }

  const selectMention = member => {
    if (!mention) return
    const token = `@${member.username || `#${member.id}`} `
    const next = text.slice(0, mention.start) + token + text.slice(mention.end)
    const caret = mention.start + token.length
    setText(next)
    setMention(null)
    requestAnimationFrame(() => { textInputRef.current?.focus(); textInputRef.current?.setSelectionRange(caret, caret) })
  }

  const openMentions = () => {
    const caret = textInputRef.current?.selectionStart ?? text.length
    const separator = caret > 0 && !/\s/u.test(text[caret - 1]) ? ' ' : ''
    const start = caret + separator.length
    setText(text.slice(0, caret) + separator + '@' + text.slice(caret))
    setMention({ start, end: start + 1, query: '' })
    setMentionIndex(0)
    requestAnimationFrame(() => { textInputRef.current?.focus(); textInputRef.current?.setSelectionRange(start + 1, start + 1) })
  }

  const handleFileSelect = (e) => {
    const file = e.target.files[0]; if (!file) return
    setMediaFile(file)
    if (file.type.startsWith('image/')) setMediaPreview(URL.createObjectURL(file))
    else setMediaPreview(null)
  }

  const handlePaste = (e) => {
    if (e.clipboardData?.getData('text/plain')) return
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

  // 会话右键（手机长按）菜单：好友和群聊都能设置标签；好友另有申请管理日程、删除好友
  const openFriendContextMenu = (event, conversation) => {
    event.preventDefault()
    event.stopPropagation()
    // 菜单贴着这一行弹出。可视范围用整个窗口：手机上会话列表只有内容那么高，会话少时上下都放不下菜单
    setFriendContext({ position: popoverPosition(event, event.currentTarget), user: conversation.partner, conversationId: conversation.id, isGroup: Boolean(conversation.partner.is_group) })
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
    setGroupRecordContext({ position: popoverPosition(event, event.currentTarget), type, item })
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
    setGroupMemberContext({ position: popoverPosition(event, event.currentTarget), member, myRole })
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
        // 对方恰好已发来申请时会直接成为好友并新建会话：同样要先刷新会话列表再打开，否则会被取消选中并弹回列表
        setGroupInfoMode(null); await fetchConvs(); setActiveId(result.data.id); navigate(`/chat/${result.data.id}`)
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
    // 菜单贴着这条消息的气泡弹出，不越出消息区域
    const bubble = e.currentTarget?.querySelector('.chat-msg-bubble')
    if (!bubble) return
    setContextMenu({ msg, position: popoverPosition(e, bubble, msgListRef.current) })
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

  // 复制整条文字消息。手机上长按不再触发系统选字，复制文字靠这一项
  const copyMessageText = async () => {
    const text = contextMenu?.msg?.content || ''
    setContextMenu(null)
    if (!text) return
    let copied = true
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // 降级方案：非 HTTPS 页面（如用局域网 IP 访问）没有剪贴板接口
      const textarea = document.createElement('textarea')
      textarea.value = text
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      copied = document.execCommand('copy')
      document.body.removeChild(textarea)
    }
    showToast(copied ? '已复制' : '复制失败')
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

  const favoriteFetch = async () => { setFavLoading(true); try { const res = await getFavorites(); const list = res.data || []; setFavorites(list); setFavIds(new Set(list.map(item => item.id))) } finally { setFavLoading(false); setShowFavPanel(true) } }

  const activeConv = convs.find((c) => c.id === activeId)
  // 按页签拆分会话列表（顺序保持接口返回的顺序）；页签上的数字是该分类里有未读的会话数
  const friendConvs = convs.filter((c) => !c.partner?.is_group)
  const groupConvs = convs.filter((c) => c.partner?.is_group)
  // 标签：会话 → 它的标签；筛选条只列出用在本页签会话上的标签，已选标签不再适用时退回「全部」
  const tagsByConv = {}
  for (const tag of convTags) {
    for (const convId of tag.conversation_ids) {
      if (!tagsByConv[convId]) tagsByConv[convId] = []
      tagsByConv[convId].push(tag)
    }
  }
  const tabConvs = convTab === 'groups' ? groupConvs : friendConvs
  const tabTags = convTags.filter((tag) => tabConvs.some((c) => tag.conversation_ids.includes(c.id)))
  const activeTagId = tabTags.some((tag) => tag.id === tagFilter[convTab]) ? tagFilter[convTab] : null
  const visibleConvs = activeTagId ? tabConvs.filter((c) => (tagsByConv[c.id] || []).some((tag) => tag.id === activeTagId)) : tabConvs
  const convIdSet = new Set(convs.map((c) => c.id))
  const convTabs = [
    { key: 'friends', label: '好友', unread: friendConvs.filter((c) => c.has_unread).length },
    { key: 'groups', label: '群聊', unread: groupConvs.filter((c) => c.has_unread).length },
  ]
  const mentionOptions = mention && activeConv?.partner?.is_group
    ? groupMembers.filter(member => member.id !== me?.id && `${member.nickname || ''} ${member.username || ''}`.toLowerCase().includes(mention.query.toLowerCase())).slice(0, 8)
    : []
  const myGroupRole = groupMembers.find(member => member.id === me?.id)?.role || 'member'
  const groupCanManage = ['owner', 'admin'].includes(myGroupRole)
  const groupIsOwner = myGroupRole === 'owner'

  // 手机端导航栏：聊天窗口显示对方名字，右上角「···」打开会话菜单；会话列表右上角「＋」在好友页签发起新聊天、在群聊页签直接建群
  const inMobileThread = isMobile && Boolean(conversationId)
  useMobileNav(inMobileThread
    ? { title: activeConv?.partner.display_name, rightLabel: '···', onRight: () => setMobileMenuOpen(true) }
    : { onAdd: openAddForTab, addLabel: convTab === 'groups' ? '创建群聊' : '发起新聊天' })
  // 手机端会话菜单：收纳网页端聊天顶栏里的全部操作（备注名、群管理、共享文件）
  const openSharedFiles = () => { fetchSharedFiles(activeId); setShowFilePanel(true) }
  const mobileMenuActions = !activeConv ? [] : activeConv.partner.is_group ? [
    { label: '群成员', onClick: () => openGroupInfo('members') },
    { label: '群公告', onClick: () => openGroupInfo('announcements') },
    { label: '群待办', onClick: () => openGroupInfo('todos') },
    ...(groupCanManage ? [
      { label: '邀请成员', onClick: openGroupInvite },
      { label: '发布群公告', onClick: () => setGroupPublish({ mode: 'announcement', source: null }) },
      { label: '创建群待办', onClick: () => setGroupPublish({ mode: 'todo', source: null }) },
      { label: '修改群聊名称', onClick: () => setGroupRenameOpen(true) },
    ] : []),
    { label: '共享文件', onClick: openSharedFiles },
    ...(groupIsOwner ? [{ label: '解散群聊', danger: true, onClick: () => setPendingGroupAction({ type: 'dissolve' }) }] : []),
  ] : [
    { label: '设置备注名', onClick: () => { setRemarkInput(activeConv.partner.remark || ''); setEditingRemark(true) } },
    { label: '共享文件', onClick: openSharedFiles },
  ]

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
  // 撤回提示文字（消息流里的居中小字和会话列表的预览共用）。撤回后只剩一行字、看不出原来是哪一边的消息，
  // 所以群主或管理员撤回别人的消息时写明是谁的：「你撤回了张三的一条消息」
  const recallNotice = message => {
    const recallerId = message.recalled_by_id ?? message.sender_id
    const nameOf = (userId, name) => (userId === me?.id ? '你' : (name || '对方'))
    if (recallerId === message.sender_id) return `${nameOf(message.sender_id, message.sender_name)}撤回了一条消息`
    return `${nameOf(recallerId, message.recalled_by_name)}撤回了${nameOf(message.sender_id, message.sender_name)}的一条消息`
  }
  // 消息菜单里的操作：按消息类型、是不是自己发的、在群里的身份决定显示哪些
  const menuMsg = contextMenu?.msg
  const menuMsgFavorited = Boolean(menuMsg && favIds.has(menuMsg.id))
  const messageMenuActions = menuMsg ? [
    menuMsg.msg_type === 'text' && { key: 'copy', icon: 'copy', label: '复制', onClick: copyMessageText },
    { key: 'favorite', icon: menuMsgFavorited ? 'starFilled' : 'star', label: menuMsgFavorited ? '取消收藏' : '收藏', onClick: () => handleToggleFavorite(menuMsg) },
    menuMsg.msg_type === 'text'
      ? { key: 'schedule', icon: 'calendar', label: '添加日程', title: '用这条消息新建日程', onClick: addTextToSchedule }
      : { key: 'download', icon: 'download', label: '下载', onClick: handleDownload },
    { key: 'shared', icon: 'folder', label: '共享文件', title: '添加到本会话的共享文件（需选标签）', onClick: triggerAddFromMsg },
    menuMsg.sender_id === me?.id && { key: 'delete', icon: 'trash', label: '删除', onClick: () => { setContextMenu(null); handleDelete(menuMsg.id) } },
    canRecallMessage(menuMsg) && { key: 'recall', icon: 'recall', label: '撤回', onClick: () => { setPendingRecallMessage(menuMsg); setContextMenu(null) } },
    activeConv?.partner?.is_group && groupCanManage && { key: 'announcement', icon: 'announcement', label: '设为公告', onClick: () => createFromMessage('announcement') },
    activeConv?.partner?.is_group && groupCanManage && { key: 'todo', icon: 'todo', label: '设为待办', onClick: () => createFromMessage('todo') },
  ].filter(Boolean) : []
  // 会话列表的菜单：好友和群聊都能设置标签；好友另有申请管理日程、删除好友
  const friendMenuActions = friendContext ? [
    { key: 'tag', icon: 'tag', label: '设置标签', onClick: () => openTagAssign(friendContext.conversationId) },
    !friendContext.isGroup && { key: 'manage', icon: 'calendarCheck', label: '申请管理日程', onClick: () => requestScheduleManagement(friendContext.user) },
    !friendContext.isGroup && { key: 'delete', icon: 'userRemove', label: '删除好友', onClick: () => { setPendingFriendDelete(friendContext); setFriendContext(null) } },
  ].filter(Boolean) : []
  // 群公告、群待办的菜单（只有群主和管理员能打开）
  const groupRecordMenuActions = groupRecordContext ? [
    { key: 'delete', icon: 'trash', label: groupRecordContext.type === 'announcement' ? '删除群公告' : '删除群待办', onClick: () => { setPendingGroupRecordDelete(groupRecordContext); setGroupRecordContext(null) } },
  ] : []
  // 群成员的菜单：先是加好友或发消息（申请还在等待时只显示状态），再是群主、管理员的管理操作
  const menuMember = groupMemberContext?.member
  const menuMyRole = groupMemberContext?.myRole
  const groupMemberMenuActions = menuMember ? [
    menuMember.friendship_status === 'friend' && { key: 'chat', icon: 'chat', label: '发消息', onClick: () => handleGroupMemberFriendAction(menuMember) },
    menuMember.friendship_status === 'none' && { key: 'add', icon: 'userAdd', label: '添加好友', onClick: () => handleGroupMemberFriendAction(menuMember) },
    menuMember.friendship_status === 'pending_outgoing' && { key: 'pending', icon: 'clock', label: '好友申请中', disabled: true },
    menuMember.friendship_status === 'pending_incoming' && { key: 'incoming', icon: 'clock', label: '对方已申请', title: '对方已向你发送好友申请，可在好友申请里通过', disabled: true },
    menuMyRole === 'owner' && menuMember.role === 'member' && { key: 'promote', icon: 'shieldCheck', label: '设为管理员', onClick: () => { setPendingGroupAction({ type: 'promote', member: menuMember }); setGroupMemberContext(null) } },
    menuMyRole === 'owner' && menuMember.role === 'admin' && { key: 'demote', icon: 'shieldMinus', label: '撤销管理员', onClick: () => { setPendingGroupAction({ type: 'demote', member: menuMember }); setGroupMemberContext(null) } },
    ((menuMyRole === 'owner' && menuMember.role !== 'owner') || (menuMyRole === 'admin' && menuMember.role === 'member')) && { key: 'remove', icon: 'exit', label: '移出群聊', onClick: () => { setPendingGroupAction({ type: 'remove', member: menuMember }); setGroupMemberContext(null) } },
  ].filter(Boolean) : []
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
    if (lm.is_recalled || lm.msg_type === 'recalled') return recallNotice(lm)
    if (lm.msg_type === 'text') return lm.content; if (lm.msg_type === 'image') return '[图片]'; if (lm.msg_type === 'video') return '[视频]'
    return '[文件] ' + (lm.file_name || '')
  }

  const getFileExt = (name) => (name || '').split('.').pop()?.toUpperCase() || ''

  const fileTypeIcon = (t) => ({ image: '🖼', video: '🎬' }[t] || '📄')

  return (
    <div className={`page-content chat-page${isMobile ? (conversationId ? ' m-chat-thread' : ' m-chat-list') : ''}`}>
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
            <button className="btn-submit" onClick={openAddForTab} style={{ padding: '0.375rem 0.75rem', fontSize: '0.85rem' }}>{convTab === 'groups' ? '+ 新群聊' : '+ 新聊天'}</button>
          </div>
        </div>
        <div className="chat-conv-tabs" role="tablist" aria-label="会话分类">
          {convTabs.map((tab) => (
            <button key={tab.key} type="button" role="tab" aria-selected={convTab === tab.key} className={convTab === tab.key ? 'active' : ''} onClick={() => setConvTab(tab.key)}>
              {tab.label}{tab.unread > 0 && <span className="chat-conv-tab-badge">{tab.unread}</span>}
            </button>
          ))}
        </div>
        <div className="chat-tag-filter" aria-label="按标签筛选">
          <button type="button" className={!activeTagId ? 'active' : ''} onClick={() => setTagFilter((prev) => ({ ...prev, [convTab]: null }))}>全部</button>
          {tabTags.map((tag) => (
            <button key={tag.id} type="button" className={activeTagId === tag.id ? 'active' : ''} onClick={() => setTagFilter((prev) => ({ ...prev, [convTab]: tag.id }))}>
              {tag.name}{tabConvs.some((c) => c.has_unread && tag.conversation_ids.includes(c.id)) && <span className="chat-tag-dot" aria-label="有未读" />}
            </button>
          ))}
          <button type="button" className="chat-tag-manage" onClick={() => setShowTagManager(true)}>{convTags.length ? '管理标签' : '＋ 标签'}</button>
        </div>
        <div className="chat-conv-list">
          {visibleConvs.map((c) => (
            <div key={c.id} className={`chat-conv-item ${c.id === activeId ? 'active' : ''}${friendContext?.conversationId === c.id ? ' is-menu-target' : ''}`} onClick={() => setActiveId(c.id)} onContextMenu={event => openFriendContextMenu(event, c)} {...longPressProps(event => openFriendContextMenu(event, c))}>
              <div className={`chat-conv-avatar ${c.has_unread ? 'unread' : ''}`}>{c.partner.display_name.charAt(0).toUpperCase()}</div>
              <div className="chat-conv-info">
                <div className="chat-conv-name">{c.partner.display_name}{c.partner.remark && <span className="chat-conv-remark-tag">备注</span>}</div>
                <div className="chat-conv-preview">{previewLabel(c.last_message)}</div>
              </div>
              <div className="chat-conv-side">
                <div className="chat-conv-time">{c.last_message ? formatTime(c.last_message.created_at) : ''}</div>
                {tagsByConv[c.id] && <div className="chat-conv-tags">{tagsByConv[c.id].map((tag) => tag.name).join(' · ')}</div>}
              </div>
            </div>
          ))}
          {!loading && visibleConvs.length === 0 && <div className="empty-state">{convTab === 'groups' ? '暂未加入群聊' : '暂无好友对话，添加好友开始聊天'}</div>}
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
          <div className={`chat-msg-list${activeConv.partner.is_group ? ' is-group' : ''}`} ref={msgListRef}>
            {messages.length === 0 && <div className="empty-state">开始聊天吧</div>}
            {groupedMessages.map((item, idx) => {
              if (item.type === 'date') return <div key={`d-${idx}`} className="chat-date-sep"><span>{item.date}</span></div>
              // 已撤回的消息不再显示气泡，和日期栏一样居中显示一行小字
              if (item.is_recalled) return <div key={item.id} className="chat-recall-notice"><span>{recallNotice(item)}</span></div>
              const isMine = item.sender_id === me.id
              const senderName = isMine ? '我' : (item.sender_name || '对方')
              const hasFile = item.file_url != null
              const isLastMine = isMine && messages.filter(m => m.sender_id === me.id).slice(-1)[0]?.id === item.id
              const showRead = isLastMine && activeConv && activeConv.my_last_read
              return (
                <div key={item.id} className={`chat-msg ${isMine ? 'mine' : 'theirs'}${menuMsg?.id === item.id ? ' is-menu-target' : ''}`} onContextMenu={(e) => handleContextMenu(e, item)} {...longPressProps(event => handleContextMenu(event, item))}>
                  {!isMine && <div className="chat-msg-avatar">{senderName.charAt(0)}</div>}
                  <div className="chat-msg-bubble">
                    <div className="chat-msg-sender">{senderName}</div>
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
                    <div className="chat-msg-meta">
                      <span className="chat-msg-time">{formatTime(item.created_at)}</span>
                      {showRead && <span className="chat-read-label">已读</span>}
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
              {activeConv?.partner?.is_group && <button type="button" className="chat-input-media-btn" onClick={openMentions} title="提及群成员" aria-label="提及群成员">@</button>}
              <div className="chat-composer">
                {mention && mentionOptions.length > 0 && <div className="chat-mention-list" role="listbox" aria-label="选择要提及的群成员">{mentionOptions.map((member, index) => <button type="button" role="option" aria-selected={index === mentionIndex} className={index === mentionIndex ? 'active' : ''} key={member.id} onMouseDown={event => event.preventDefault()} onClick={() => selectMention(member)}><strong>{member.nickname || member.username || `成员 ${member.id}`}</strong><small>@{member.username || `#${member.id}`}</small></button>)}</div>}
                <textarea ref={textInputRef} className="chat-input-text" rows={1} value={text} onChange={event => { setText(event.target.value); updateMention(event.target.value, event.target.selectionStart) }} onClick={event => updateMention(event.target.value, event.target.selectionStart)} onPaste={handlePaste} onKeyDown={event => {
                  if (event.nativeEvent.isComposing) return
                  if (mention && mentionOptions.length && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) { event.preventDefault(); setMentionIndex(index => (index + (event.key === 'ArrowDown' ? 1 : -1) + mentionOptions.length) % mentionOptions.length); return }
                  if (mention && mentionOptions.length && event.key === 'Enter') { event.preventDefault(); selectMention(mentionOptions[mentionIndex]); return }
                  if (mention && event.key === 'Escape') { event.preventDefault(); setMention(null); return }
                  if (!isMobile && event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); handleSendText() }
                }} placeholder={isMobile ? '输入消息…' : '输入消息，Shift+Enter 换行'} aria-label="消息内容" />
              </div>
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
                      <button onClick={async () => { await removeFavorite(f.id); setFavorites((prev) => prev.filter((x) => x.id !== f.id)); setFavIds(prev => { const next = new Set(prev); next.delete(f.id); return next }) }} title="取消收藏">✕</button>
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

      {/* 长按 / 右键弹出的操作菜单：消息、会话、群公告和待办、群成员 */}
      {contextMenu && <ActionPopover key={contextMenu.msg.id} position={contextMenu.position} actions={messageMenuActions} />}
      {friendContext && <ActionPopover key={friendContext.conversationId} position={friendContext.position} actions={friendMenuActions} />}
      {groupRecordContext && <ActionPopover key={`${groupRecordContext.type}-${groupRecordContext.item.id}`} position={groupRecordContext.position} actions={groupRecordMenuActions} />}
      {groupMemberContext && <ActionPopover key={groupMemberContext.member.id} position={groupMemberContext.position} actions={groupMemberMenuActions} />}

      {/* 标签选择模态框 */}
      {tagModal && (
        <TagSelectModal
          fileName={tagModal.fileName}
          onConfirm={confirmTagModal}
          onClose={() => setTagModal(null)}
        />
      )}
      {tagAssignConv && <TagAssignModal conversationName={tagAssignConv.partner.display_name} tags={convTags} selectedIds={(tagsByConv[tagAssignConv.id] || []).map((tag) => tag.id)} onClose={() => setTagAssignConv(null)} onSubmit={saveConversationTags} onCreateTag={createTag} />}
      {showTagManager && <TagManageModal tags={convTags} convIds={convIdSet} onClose={() => setShowTagManager(false)} onCreate={createTag} onRename={renameTag} onDelete={(tag) => setPendingTagDelete(tag)} />}
      <ConfirmDialog open={pendingTagDelete !== null} danger title="删除标签" message={`删除标签「${pendingTagDelete?.name || ''}」后，会话和聊天记录都不受影响，只是去掉这个分类。`} confirmText="删除标签" onCancel={() => setPendingTagDelete(null)} onConfirm={confirmDeleteTag} />
      <ConfirmDialog open={pendingDeleteId !== null} danger title="删除消息" message="确定删除这条消息吗？删除后无法恢复。" confirmText="删除" onCancel={() => setPendingDeleteId(null)} onConfirm={confirmDelete} />
      <ConfirmDialog open={pendingRecallMessage !== null} danger title="撤回消息" message="撤回后，所有会话成员将看到撤回提示，且消息内容无法恢复。" confirmText="撤回" onCancel={() => setPendingRecallMessage(null)} onConfirm={confirmRecall} />
      <ConfirmDialog open={pendingFriendDelete !== null} danger title="删除好友" message={`删除 ${pendingFriendDelete?.user?.display_name || pendingFriendDelete?.user?.nickname || '该好友'} 后，双方私聊将隐藏且日程授权会立即撤销；重新添加后可恢复历史聊天。`} confirmText="删除好友" onCancel={() => setPendingFriendDelete(null)} onConfirm={confirmDeleteFriend} />
      <ConfirmDialog open={pendingGroupRecordDelete !== null} danger title={pendingGroupRecordDelete?.type === 'announcement' ? '删除群公告' : '删除群待办'} message="删除后群成员将无法再查看此内容，确定继续吗？" confirmText="删除" onCancel={() => setPendingGroupRecordDelete(null)} onConfirm={deleteGroupRecord} />
      <ConfirmDialog open={pendingGroupAction !== null} danger={['remove', 'dissolve'].includes(pendingGroupAction?.type)} title={pendingGroupAction?.type === 'dissolve' ? '永久解散群聊' : pendingGroupAction?.type === 'remove' ? '移出群成员' : pendingGroupAction?.type === 'promote' ? '设为管理员' : '撤销管理员'} message={pendingGroupAction?.type === 'dissolve' ? '解散后会永久删除全部消息、公告、待办和共享文件，且无法恢复。' : pendingGroupAction?.type === 'remove' ? `确定将 ${pendingGroupAction?.member?.nickname || pendingGroupAction?.member?.username || '该成员'} 移出群聊吗？` : pendingGroupAction?.type === 'promote' ? '该成员将获得邀请好友、移出普通成员、修改群名及维护群公告和群待办的权限。' : '该成员将恢复为普通成员。'} confirmText={pendingGroupAction?.type === 'dissolve' ? '永久解散' : pendingGroupAction?.type === 'remove' ? '移出群聊' : '确认'} onCancel={() => setPendingGroupAction(null)} onConfirm={confirmGroupAction} />
      {groupPublish && <GroupPublishModal mode={groupPublish.mode} source={groupPublish.source} onClose={() => setGroupPublish(null)} onSubmit={submitGroupPublish} />}
      {groupRenameOpen && <GroupRenameModal initialName={activeConv?.partner?.display_name} onClose={() => setGroupRenameOpen(false)} onSubmit={submitGroupRename} />}
      {groupInviteOpen && <GroupInviteModal contacts={groupInviteContacts} members={groupMembers} submitting={groupInviteSubmitting} onClose={() => setGroupInviteOpen(false)} onSubmit={submitGroupInvite} />}
      {groupInfoMode && <GroupInfoModal mode={groupInfoMode} members={groupMembers} announcements={groupAnnouncements} todos={groupTodos} memberQuery={memberQuery} setMemberQuery={setMemberQuery} onClose={() => setGroupInfoMode(null)} onToggleTodo={completeGroupTodo} onRecordContextMenu={openGroupRecordContextMenu} onMemberContextMenu={openGroupMemberContextMenu} myRole={myGroupRole} menuMemberId={groupMemberContext?.member.id} menuRecordId={groupRecordContext?.item.id} />}
      {mobileMenuOpen && <MobileActionSheet title={activeConv?.partner.display_name} actions={mobileMenuActions} onClose={() => setMobileMenuOpen(false)} />}
    </div>
  )
}
