import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useState } from 'react'

export function BackButton({ fallback }) {
  const navigate = useNavigate()
  return <button className="btn-back" type="button" onClick={() => window.history.length > 1 ? navigate(-1) : navigate(fallback)}>← 返回上个界面</button>
}

export function MemoNav({ type }) {
  const location = useLocation()
  const [open, setOpen] = useState(true)
  const items = type === 'personal'
    ? [['/profile/memos/personal/cases', '病例'], ['/profile/memos/personal/files', '文件'], ['/profile/memos/personal/favorites', '收藏夹'], ['/profile/memos/personal/shared-files', '共享文件']]
    : [['/profile/memos/team/announcements', '群公告'], ['/profile/memos/team/todos', '群待办'], ['/profile/memos/team/shared-files', '群共享文件']]
  return <nav className={`memo-section-nav ${open ? 'open' : ''}`}><button type="button" onClick={() => setOpen(value => !value)}><span>{type === 'personal' ? '个人备忘录分区' : '团队群聊备忘录分区'}</span><span>⌄</span></button><div>{items.map(([to, label]) => <Link key={to} className={location.pathname === to ? 'active' : ''} to={to}>{label}</Link>)}</div></nav>
}
