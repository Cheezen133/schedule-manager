// 手机端底部操作菜单（iOS action sheet）：一组操作按钮 + 单独的「取消」。
// actions: [{ label, onClick, danger }]；点任一操作会先关闭菜单再执行
export default function MobileActionSheet({ title, actions, onClose }) {
  return <div className="m-sheet-backdrop" onClick={onClose}>
    <div className="m-action-sheet" role="dialog" aria-label={title || '操作'} onClick={event => event.stopPropagation()}>
      <div className="m-action-group">
        {title && <div className="m-action-title">{title}</div>}
        {actions.map(action => <button type="button" key={action.label} className={`m-action${action.danger ? ' is-danger' : ''}`} onClick={() => { onClose(); action.onClick() }}>{action.label}</button>)}
      </div>
      <button type="button" className="m-action m-action-cancel" onClick={onClose}>取消</button>
    </div>
  </div>
}
