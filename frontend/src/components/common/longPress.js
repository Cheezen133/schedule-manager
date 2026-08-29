// 在触摸设备上把长按转换为与桌面端右键一致的上下文操作。
// 回调接收一个只包含上下文菜单所需字段的轻量事件对象。
export function longPressProps(onLongPress, delay = 560) {
  let timer = null
  let fired = false

  const clear = () => {
    if (timer) window.clearTimeout(timer)
    timer = null
  }

  return {
    onTouchStart: event => {
      if (event.touches.length !== 1) return
      const touch = event.touches[0]
      fired = false
      timer = window.setTimeout(() => {
        fired = true
        navigator.vibrate?.(12)
        const maxX = Math.max(8, window.innerWidth - 196)
        const maxY = Math.max(8, window.innerHeight - 240)
        onLongPress({
          clientX: Math.max(8, Math.min(touch.clientX, maxX)),
          clientY: Math.max(8, Math.min(touch.clientY, maxY)),
          preventDefault: () => {},
          stopPropagation: () => {},
        })
      }, delay)
    },
    onTouchMove: clear,
    onTouchEnd: event => {
      clear()
      if (fired) event.preventDefault()
    },
    onTouchCancel: clear,
  }
}
