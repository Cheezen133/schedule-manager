import { useState } from 'react'

// 手机端底部弹出的选择面板（iOS sheet）：带搜索，选中项打勾。
// options: [{ id, label, sub, keywords, pinned }]；keywords 是参与搜索的文字，pinned 的选项始终显示（如「我的日程」）
export default function MobilePickerSheet({ title, options, selectedId, onSelect, onClose, searchPlaceholder = '搜索' }) {
  const [search, setSearch] = useState('')
  const matches = option => (option.keywords || [option.label]).some(text => (text || '').includes(search))
  const visible = options.filter(option => option.pinned || !search || matches(option))
  const noMatch = search && !visible.some(option => !option.pinned)

  return <div className="m-sheet-backdrop" onClick={onClose}>
    <div className="m-sheet" role="dialog" aria-label={title} onClick={event => event.stopPropagation()}>
      <div className="m-sheet-header"><span /><strong>{title}</strong><button type="button" onClick={onClose}>完成</button></div>
      <div className="m-search">
        <label className="ui-search-field"><span aria-hidden="true">⌕</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder={searchPlaceholder} /></label>
      </div>
      <section className="m-list">
        {visible.map(option => <button type="button" key={option.id ?? 'self'} className="m-cell" onClick={() => onSelect(option.id)}>
          <span className="m-cell-label">{option.label}{option.sub && <small className="m-cell-sub">{option.sub}</small>}</span>
          {option.id === selectedId && <svg className="m-check" viewBox="0 0 16 12" aria-hidden="true"><path d="M1.5 6.5l4 4 9-9" /></svg>}
        </button>)}
        {noMatch && <div className="m-cell m-cell-empty">未找到匹配用户</div>}
      </section>
    </div>
  </div>
}
