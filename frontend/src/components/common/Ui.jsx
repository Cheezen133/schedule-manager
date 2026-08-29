import { useEffect, useState } from 'react'

export function Button({ variant = 'secondary', className = '', type = 'button', children, ...props }) {
  return <button type={type} className={`ui-button ui-button-${variant} ${className}`.trim()} {...props}>{children}</button>
}

export function IconButton({ label, className = '', children, ...props }) {
  return <button type="button" className={`ui-icon-button ${className}`.trim()} aria-label={label} title={label} {...props}>{children}</button>
}

export function SearchInput({ value, onChange, placeholder = '搜索', className = '', ...props }) {
  return <label className={`ui-search-field ${className}`.trim()}><span aria-hidden="true">⌕</span><input value={value} onChange={onChange} placeholder={placeholder} {...props} /></label>
}

export function FilterBar({ children, className = '' }) {
  return <div className={`ui-filter-bar ${className}`.trim()}>{children}</div>
}

export function ConfirmDialog({ open, title = '确认操作', message, confirmText = '确认', danger = false, onConfirm, onCancel }) {
  if (!open) return null
  return <div className="modal-overlay ui-confirm-overlay" role="presentation" onMouseDown={onCancel}>
    <section className="modal ui-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title" onMouseDown={event => event.stopPropagation()}>
      <div className="ui-confirm-icon" aria-hidden="true">{danger ? '!' : '?'}</div>
      <h3 id="confirm-dialog-title">{title}</h3>
      <p>{message}</p>
      <div className="ui-confirm-actions"><Button variant="secondary" onClick={onCancel}>取消</Button><Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>{confirmText}</Button></div>
    </section>
  </div>
}

export function ToastViewport() {
  const [items, setItems] = useState([])
  useEffect(() => {
    const show = event => {
      const item = { id: `${Date.now()}-${Math.random()}`, message: String(event.detail?.message || event.detail || '操作未完成'), tone: event.detail?.tone || 'error' }
      setItems(previous => [...previous, item])
      window.setTimeout(() => setItems(previous => previous.filter(entry => entry.id !== item.id)), 3600)
    }
    window.addEventListener('app-toast', show)
    return () => window.removeEventListener('app-toast', show)
  }, [])
  return <div className="ui-toast-viewport" aria-live="polite">{items.map(item => <div key={item.id} className={`ui-toast ${item.tone}`}>{item.message}</div>)}</div>
}

export const notify = (message, tone = 'error') => window.dispatchEvent(new CustomEvent('app-toast', { detail: { message, tone } }))
