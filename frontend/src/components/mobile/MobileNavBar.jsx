import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useNavigationType } from 'react-router-dom'
import SearchBar from '../common/SearchBar'
import { isTabPath } from './MobileTabBar'

// 页面可在手机端自定义导航栏：标题、右上角「＋」、左上角「今天」、右上角文字按钮（如「编辑」「添加」）
const NavStateContext = createContext(null)
const NavSetterContext = createContext(null)

export function MobileNavProvider({ children }) {
  const [custom, setCustom] = useState(null)
  return <NavSetterContext.Provider value={setCustom}>
    <NavStateContext.Provider value={custom}>{children}</NavStateContext.Provider>
  </NavSetterContext.Provider>
}

// 网页端没有 MobileNavProvider，调用不产生任何效果。
// rightForm：右上角按钮用来提交页面里 id 为该值的表单（按钮在表单外，靠 form 属性关联）
// addLabel：「＋」按钮的读屏文字，默认「新建日程」
export function useMobileNav({ title, onAdd, addLabel, onToday, rightLabel, onRight, rightForm, rightDisabled = false }) {
  const setCustom = useContext(NavSetterContext)
  const { pathname } = useLocation()
  const actions = useRef({})
  actions.current = { onAdd, onToday, onRight }
  const hasAdd = Boolean(onAdd), hasToday = Boolean(onToday), hasRight = Boolean(onRight)
  useEffect(() => {
    if (!setCustom) return
    setCustom({
      path: pathname,
      title,
      onAdd: hasAdd ? () => actions.current.onAdd() : null,
      addLabel,
      onToday: hasToday ? () => actions.current.onToday() : null,
      right: rightLabel ? { label: rightLabel, form: rightForm, disabled: rightDisabled, onClick: hasRight ? () => actions.current.onRight() : null } : null,
    })
    return () => setCustom(null)
  }, [setCustom, pathname, title, hasAdd, addLabel, hasToday, hasRight, rightLabel, rightForm, rightDisabled])
}

// 手机端各页面标题（按路由从上到下匹配，取第一个命中的）
const TITLES = [
  [/^\/$/, '日历'],
  [/^\/review$/, '待审核'],
  [/^\/chat$/, '消息'],
  [/^\/chat\//, '聊天'],
  [/^\/notifications$/, '通知'],
  [/^\/me$/, '我的'],
  [/^\/schedules\/new$/, '新建日程'],
  [/^\/schedules\/[^/]+\/edit$/, '编辑日程'],
  [/^\/schedules\//, '日程详情'],
  [/^\/search$/, '搜索'],
  [/^\/contacts$/, '联系人'],
  [/^\/phonebook$/, '电话簿'],
  [/^\/users$/, '用户管理'],
  [/^\/profile\/dashboard$/, '仪表盘'],
  [/^\/profile\/memos\/personal\/cases\/./, '病例详情'],
  [/^\/profile\/memos\/personal\/cases$/, '病例'],
  [/^\/profile\/memos\/personal\/files$/, '文件'],
  [/^\/profile\/memos\/personal\/favorites$/, '收藏夹'],
  [/^\/profile\/memos\/personal\/shared-files$/, '共享文件'],
  [/^\/profile\/memos\/personal$/, '个人备忘录'],
  [/^\/profile\/memos\/team\/announcements$/, '群公告'],
  [/^\/profile\/memos\/team\/todos$/, '群待办'],
  [/^\/profile\/memos\/team\/shared-files$/, '群共享文件'],
  [/^\/profile\/memos\/team$/, '团队群聊备忘录'],
  [/^\/profile\/memos$/, '备忘录'],
  [/^\/case-review\/[^/]+\/cases\//, '病历'],
  [/^\/case-review\/[^/]+$/, '项目'],
  [/^\/case-review$/, '病历审阅'],
]
const titleOf = pathname => TITLES.find(([pattern]) => pattern.test(pathname))?.[1] || '日程管理系统'

// 没有站内浏览记录（例如直接打开链接）时，「返回」退到上一级页面
const parentOf = pathname => {
  if (/^\/case-review\/[^/]+\/cases\//.test(pathname)) return pathname.replace(/\/cases\/[^/]+$/, '')
  if (/^\/case-review\/[^/]+$/.test(pathname)) return '/case-review'
  if (pathname === '/case-review') return '/me'
  const parent = pathname.replace(/\/[^/]+$/, '')
  if (parent.startsWith('/profile/memos') || parent.startsWith('/chat') || /^\/schedules\/[^/]+$/.test(parent)) return parent
  return /^\/(profile|contacts|phonebook|users)/.test(pathname) ? '/me' : '/'
}

export default function MobileNavBar() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const navigationType = useNavigationType()
  const isTab = isTabPath(pathname)
  const stored = useContext(NavStateContext)
  const custom = stored?.path === pathname ? stored : null
  const title = custom?.title || titleOf(pathname)
  const largeTitleRef = useRef(null)
  const [largeTitleHidden, setLargeTitleHidden] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)

  // 进入新页面从顶部开始（返回上一页时不处理，保留浏览器的滚动位置恢复）
  useEffect(() => {
    setSearchOpen(false)
    if (navigationType !== 'POP') window.scrollTo(0, 0)
  }, [pathname, navigationType])

  // iOS 效果：一级页面的大标题滚到导航栏下面后，导航栏中间显示小标题
  useEffect(() => {
    const target = largeTitleRef.current
    if (!target) return
    const observer = new IntersectionObserver(([entry]) => setLargeTitleHidden(!entry.isIntersecting), { rootMargin: '-44px 0px 0px 0px' })
    observer.observe(target)
    return () => observer.disconnect()
  }, [pathname])

  const goBack = () => {
    if (window.history.state?.idx > 0) navigate(-1)
    else navigate(parentOf(pathname), { replace: true })
  }

  return <>
    <header className={`m-navbar${!isTab || largeTitleHidden ? ' m-navbar-compact' : ''}`}>
      <div className="m-navbar-side">
        {!isTab && <button type="button" className="m-nav-back" onClick={goBack}><svg viewBox="0 0 12 21" aria-hidden="true"><path d="M10 2L2 10.5 10 19" /></svg>返回</button>}
        {isTab && custom?.onToday && <button type="button" className="m-nav-text" onClick={custom.onToday}>今天</button>}
      </div>
      <div className="m-navbar-title">{title}</div>
      <div className="m-navbar-side m-navbar-actions">
        {custom?.right && <button type={custom.right.form ? 'submit' : 'button'} form={custom.right.form || undefined} className={`m-nav-text${custom.right.form ? ' m-nav-strong' : ''}`} disabled={custom.right.disabled} onClick={custom.right.onClick || undefined}>{custom.right.label}</button>}
        {isTab && <button type="button" className="m-nav-icon" aria-label="搜索" onClick={() => setSearchOpen(open => !open)}><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5L20 20" /></svg></button>}
        {custom?.onAdd
          ? <button type="button" className="m-nav-icon" aria-label={custom.addLabel || '新建日程'} onClick={custom.onAdd}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg></button>
          : pathname === '/' && <Link to="/schedules/new" className="m-nav-icon" aria-label="新建日程"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg></Link>}
      </div>
    </header>
    {isTab && <h1 className="m-large-title" ref={largeTitleRef}>{title}</h1>}
    {isTab && searchOpen && <div className="m-search"><SearchBar /></div>}
  </>
}
