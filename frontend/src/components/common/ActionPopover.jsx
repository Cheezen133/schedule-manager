import { useEffect, useLayoutEffect, useRef, useState } from 'react'

// 长按 / 右键弹出的操作菜单（聊天页、病人列表共用）：贴着被操作的元素弹出，样式参照微信的深色图标菜单，一行最多 5 个操作。
// 用法：打开菜单时用 popoverPosition(事件, 元素) 记下位置，再渲染 <ActionPopover position={...} actions={[...]} onClose={...} />。
// actions 每项：{ key, icon（下面 MENU_ICONS 里的名字）, label, title（可选，鼠标悬停说明）, disabled（可选）, onClick }

// 菜单里的线条图标（24×24 画布，颜色跟随文字色）
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
  // 病人列表
  fileOpen: <><path d="M14 3.5H7A1.5 1.5 0 0 0 5.5 5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8z" /><path d="M14 3.5V8h4.5M9 12.5h6M9 16h6" /></>,
  edit: <><path d="M15.5 4.5l4 4L9 19H5v-4z" /><path d="M13.5 6.5l4 4" /></>,
  archive: <><rect x="3.5" y="4.5" width="17" height="4" rx="1" /><path d="M5 8.5v10A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5v-10M10 12h4" /></>,
}
const MENU_COLUMNS = 5

// 记下弹出菜单要贴着的元素、按下的位置，以及菜单不能越出的可视区域（不传 area 时为整个窗口），交给 ActionPopover 计算位置。
// 拿不到元素时退化为贴着按下的那个点
export function popoverPosition(event, element, area) {
  const rect = element ? element.getBoundingClientRect() : { top: event.clientY, bottom: event.clientY, left: event.clientX, right: event.clientX }
  const box = area ? area.getBoundingClientRect() : { top: 0, bottom: window.innerHeight, left: 0, right: window.innerWidth }
  return {
    point: { x: event.clientX, y: event.clientY },
    anchor: { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right },
    bounds: { top: Math.max(box.top, 0), bottom: Math.min(box.bottom, window.innerHeight), left: Math.max(box.left, 0), right: Math.min(box.right, window.innerWidth) },
  }
}

// 位置：先试元素上方，放不下再试下方；元素太高、上下都放不下时，改为贴着按下的位置弹出。小三角始终指向元素的水平中线。
// position 来自 popoverPosition：anchor 是元素在屏幕上的位置，point 是按下的位置，bounds 是菜单不能越出的可视区域。
// 菜单贴着元素定位，页面上任何地方一滚动、窗口尺寸一变，位置就对不上了，这时调用 onClose 收起；点空白处收起由各页面自己处理
export default function ActionPopover({ position, actions, onClose }) {
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

  // 滚动、窗口尺寸变化时收起。onClose 每次渲染都可能是新函数，存进 ref，监听只在菜单打开期间挂一次
  const closeRef = useRef(onClose)
  useEffect(() => { closeRef.current = onClose })
  useEffect(() => {
    const close = () => closeRef.current?.()
    // 滚动事件不会冒泡，在捕获阶段监听才能收到页面里各个列表、弹窗自己的滚动
    document.addEventListener('scroll', close, { capture: true, passive: true })
    window.addEventListener('resize', close)
    return () => { document.removeEventListener('scroll', close, { capture: true }); window.removeEventListener('resize', close) }
  }, [])

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
