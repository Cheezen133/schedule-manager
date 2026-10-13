// 在触摸设备上把长按转换为与桌面端右键一致的上下文操作。
// 回调接收一个只包含上下文菜单所需字段的轻量事件对象。

// 每个元素当前这次按压的状态（计时器、是否已触发长按）。状态按元素保存，而不是放在闭包里：
// 长按一触发，页面就会重新渲染并换上新的事件处理函数，闭包里的状态随之丢失，
// 松手时就拦不住随后的点击（菜单刚弹出就被这次点击关掉），滑动时也取消不了旧的计时器
const pressStates = new WeakMap()

function clearPress(element) {
  const state = pressStates.get(element)
  if (state?.timer) window.clearTimeout(state.timer)
  if (state) state.timer = null
  return state
}

export function longPressProps(onLongPress, delay = 560) {
  return {
    onTouchStart: event => {
      if (event.touches.length !== 1) return
      const element = event.currentTarget
      const touch = event.touches[0]
      clearPress(element)
      const state = { timer: null, fired: false }
      pressStates.set(element, state)
      state.timer = window.setTimeout(() => {
        state.timer = null
        state.fired = true
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
    onTouchMove: event => { clearPress(event.currentTarget) },
    onTouchEnd: event => {
      const state = clearPress(event.currentTarget)
      if (state?.fired) event.preventDefault()
    },
    onTouchCancel: event => { clearPress(event.currentTarget) },
  }
}
