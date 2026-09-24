import { useState, useEffect } from 'react'
import { getCategories, createCategory, updateCategory, deleteCategory } from '../../api/categories'
import VoiceInputButton from '../common/VoiceInputButton'
import { useAuth } from '../../contexts/AuthContext'
import { getOwnerManagers } from '../../api/scheduleManagement'
import { Button, ConfirmDialog } from '../common/Ui'
import { beijingInputToUtcIso, toBeijingInputValue } from '../../utils/dateTime'

const emptyCategoryForm = { name: '', description: '', color: '#3788d8', icon: '📋', sort_order: 0 }

/**
 * 日程表单组件（创建/编辑通用）
 * @param {object} initialData - 编辑时的初始数据
 * @param {function} onSubmit - 提交回调 (formData) => Promise
 * @param {boolean} isEditing - 是否编辑模式
 */
export default function ScheduleForm({ initialData, onSubmit, isEditing = false, ownerId = null, ownerName = null }) {
  const { user } = useAuth()
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    start_time: '',
    end_time: '',
    is_all_day: false,
    is_important: false,
    category_id: '',
      visibility: 'private',
    viewer_ids: [],
    completer_name: '',
    external_contact_name: '',
    external_contact_phone: '',
    color: '#3788d8',
  })
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [eligibleManagers, setEligibleManagers] = useState([])
  const [viewerSearch, setViewerSearch] = useState('')
  const [viewerNotice, setViewerNotice] = useState('')
  const [categoryManagerOpen, setCategoryManagerOpen] = useState(false)
  const [categoryForm, setCategoryForm] = useState(emptyCategoryForm)
  const [editingCategoryId, setEditingCategoryId] = useState(null)
  const [categorySaving, setCategorySaving] = useState(false)
  const [categoryError, setCategoryError] = useState('')
  const [pendingCategoryDelete, setPendingCategoryDelete] = useState(null)

  useEffect(() => {
    if (initialData) {
      setFormData({
        title: initialData.title || '',
        description: initialData.description || '',
        start_time: toBeijingInputValue(initialData.start_time),
        end_time: toBeijingInputValue(initialData.end_time),
        is_all_day: initialData.is_all_day || false,
        is_important: initialData.is_important || false,
        category_id: initialData.category_id ? String(initialData.category_id) : '',
          visibility: initialData.visibility || 'private',
        viewer_ids: initialData.viewer_ids || [],
        completer_name: initialData.completer_name || '',
        external_contact_name: initialData.external_contact_name || '',
        external_contact_phone: initialData.external_contact_phone || '',
        color: initialData.color || '#3788d8',
      })
    }
  }, [initialData])

  const scheduleOwnerId = initialData?.created_by || ownerId || user?.id
  const scheduleOwnerLabel = initialData?.creator_name || ownerName || '我'

  const loadCategories = async () => {
    if (!scheduleOwnerId) return
    try {
      const response = await getCategories(false, scheduleOwnerId)
      const items = response.data || []
      setCategories(items)
      setFormData(previous => previous.category_id && !items.some(item => String(item.id) === String(previous.category_id))
        ? { ...previous, category_id: '' }
        : previous)
      setCategoryError('')
    } catch (requestError) {
      setCategories([])
      setCategoryError(requestError.userMessage || '无法加载分类。')
    }
  }

  useEffect(() => {
    setCategoryManagerOpen(false)
    setEditingCategoryId(null)
    setCategoryForm(emptyCategoryForm)
    loadCategories()
  }, [scheduleOwnerId])

  useEffect(() => {
    if (!scheduleOwnerId) { setEligibleManagers([]); return }
    setViewerNotice('')
    getOwnerManagers(scheduleOwnerId).then(response => {
      const items = response.data || []
      setEligibleManagers(items)
      if (isEditing) {
        const validIds = new Set(items.map(item => Number(item.id)))
        const originalViewerIds = initialData?.viewer_ids || []
        if (originalViewerIds.some(id => !validIds.has(Number(id)))) {
          setViewerNotice('部分观看者的管理权限已失效，已自动从观看名单移除。')
        }
        setFormData(previous => {
          const viewerIds = previous.viewer_ids.filter(id => validIds.has(Number(id)))
          if (viewerIds.length !== previous.viewer_ids.length) {
            return { ...previous, viewer_ids: viewerIds }
          }
          return previous
        })
      }
    }).catch(() => setEligibleManagers([]))
  }, [scheduleOwnerId, isEditing, initialData])

  const resetCategoryForm = () => {
    setEditingCategoryId(null)
    setCategoryForm(emptyCategoryForm)
    setCategoryError('')
  }

  const saveCategory = async (event) => {
    event.preventDefault()
    if (!categoryForm.name.trim()) { setCategoryError('请输入分类名称。'); return }
    setCategorySaving(true)
    try {
      const payload = { ...categoryForm, name: categoryForm.name.trim(), description: categoryForm.description.trim() || null }
      if (editingCategoryId) await updateCategory(editingCategoryId, payload)
      else await createCategory(payload, scheduleOwnerId)
      resetCategoryForm()
      await loadCategories()
    } catch (requestError) {
      setCategoryError(requestError.userMessage || '分类保存失败。')
    } finally {
      setCategorySaving(false)
    }
  }

  const removeCategory = async () => {
    if (!pendingCategoryDelete) return
    try {
      await deleteCategory(pendingCategoryDelete.id)
      if (String(formData.category_id) === String(pendingCategoryDelete.id)) {
        setFormData(previous => ({ ...previous, category_id: '' }))
      }
      setPendingCategoryDelete(null)
      resetCategoryForm()
      await loadCategories()
    } catch (requestError) {
      setPendingCategoryDelete(null)
      setCategoryError(requestError.userMessage || '分类删除失败。')
    }
  }

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }))
  }

  // 选择分类时自动设置颜色
  const handleCategoryChange = (e) => {
    const catId = e.target.value
    setFormData((prev) => ({ ...prev, category_id: catId }))
    if (catId) {
      const cat = categories.find((c) => String(c.id) === String(catId))
      if (cat) {
        setFormData((prev) => ({ ...prev, category_id: catId, color: cat.color }))
      }
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!formData.title.trim()) {
      setError('请输入日程标题')
      return
    }
    if (!formData.start_time || !formData.end_time) {
      setError('请选择开始和结束时间')
      return
    }
    if (formData.end_time <= formData.start_time) {
      setError('结束时间必须晚于开始时间')
      return
    }

    setLoading(true)
    try {
      await onSubmit({
        title: formData.title.trim(),
        description: formData.description.trim() || null,
        start_time: beijingInputToUtcIso(formData.start_time),
        end_time: beijingInputToUtcIso(formData.end_time),
        is_all_day: formData.is_all_day,
        is_important: formData.is_important,
        category_id: formData.category_id ? parseInt(formData.category_id) : null,
        visibility: formData.visibility,
        viewer_ids: formData.viewer_ids,
        completer_name: formData.completer_name.trim() || null,
        external_contact_name: formData.external_contact_name.trim() || null,
        external_contact_phone: formData.external_contact_phone.trim() || null,
        color: formData.color,
      })
    } catch (err) {
      setError(err.userMessage ||'操作失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
    <form className="schedule-form" onSubmit={handleSubmit}>
      <h2>{isEditing ? '编辑日程' : '新建日程'}</h2>

      {error && <div className="error-message">{error}</div>}
      {viewerNotice && <div className="info-message">{viewerNotice}</div>}

      <div className="form-group form-row full">
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>日程标题 *</label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              type="text"
              name="title"
              value={formData.title}
              onChange={handleChange}
              placeholder="输入日程标题"
              maxLength={200}
              style={{ flex: 1 }}
            />
            <VoiceInputButton
              label="语音"
              onResult={(text) => setFormData((prev) => ({ ...prev, title: prev.title ? prev.title + text : text }))}
            />
          </div>
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label>开始时间（北京时间）*</label>
          <input
            type="datetime-local"
            name="start_time"
            value={formData.start_time}
            onChange={handleChange}
          />
        </div>
        <div className="form-group">
          <label>结束时间（北京时间）*</label>
          <input
            type="datetime-local"
            name="end_time"
            value={formData.end_time}
            onChange={handleChange}
          />
        </div>
      </div>

      {/* 个人分类选择 */}
        <div className="form-group schedule-category-field">
          <div className="schedule-category-heading"><label>日程分类</label><button type="button" className="text-button" onClick={() => setCategoryManagerOpen(true)}>管理分类</button></div>
          <select
            name="category_id"
            value={formData.category_id}
            onChange={handleCategoryChange}
            style={{
              width: '100%',
              padding: '0.625rem',
              border: '1px solid var(--gray-300)',
              borderRadius: 'var(--radius)',
              fontSize: '0.95rem',
              background: 'white',
            }}
          >
            <option value="">-- 未分类 --</option>
            {categories.map((cat) => (
              <option key={cat.id} value={String(cat.id)}>
                {cat.icon} {cat.name}
              </option>
            ))}
          </select>
          <small>当前显示：{scheduleOwnerLabel}的个人分类</small>
        </div>

      <div className="form-group schedule-visibility-picker">
        <label>观看权限 *</label>
        <p>普通好友不能查看他人日历；只有有效管理者可按此设置查看完整内容。</p>
        <div className="visibility-options">
          <label className={`visibility-option ${formData.visibility === 'private' ? 'selected' : ''}`}><input className="visibility-option-input" type="radio" name="visibility" value="private" checked={formData.visibility === 'private'} onChange={handleChange} /><span className="visibility-option-copy"><strong>仅创建者和日程所有者</strong><small>其他管理者仅看到“时间已被占用”。</small></span></label>
          <label className={`visibility-option ${formData.visibility === 'managers' ? 'selected' : ''}`}><input className="visibility-option-input" type="radio" name="visibility" value="managers" checked={formData.visibility === 'managers'} onChange={handleChange} /><span className="visibility-option-copy"><strong>所有有效管理者可见</strong><small>当前拥有管理权限的人均可查看和编辑。</small></span></label>
          <label className={`visibility-option ${formData.visibility === 'selected' ? 'selected' : ''}`}><input className="visibility-option-input" type="radio" name="visibility" value="selected" checked={formData.visibility === 'selected'} onChange={handleChange} /><span className="visibility-option-copy"><strong>指定管理者可见</strong><small>从下方名单选择可以查看完整内容的管理者。</small></span></label>
        </div>
        {formData.visibility === 'selected' && <div className="viewer-selector"><label className="viewer-search-label">可查看的管理者<input value={viewerSearch} onChange={event => setViewerSearch(event.target.value)} placeholder="搜索昵称或用户名" /></label><div className="viewer-selector-list">{eligibleManagers.filter(manager => `${manager.nickname || ''}${manager.username || ''}`.toLowerCase().includes(viewerSearch.toLowerCase())).map(manager => <label key={manager.id}><input type="checkbox" checked={formData.viewer_ids.includes(manager.id)} onChange={() => setFormData(previous => ({ ...previous, viewer_ids: previous.viewer_ids.includes(manager.id) ? previous.viewer_ids.filter(id => id !== manager.id) : [...previous.viewer_ids, manager.id] }))} /><span>{manager.nickname || manager.username}</span></label>)}{!eligibleManagers.length && <span>当前没有可选择的有效管理者。</span>}</div></div>}
      </div>

      <div className="form-check">
        <input
          type="checkbox"
          id="is_all_day"
          name="is_all_day"
          checked={formData.is_all_day}
          onChange={handleChange}
        />
        <label htmlFor="is_all_day">全天事件</label>
      </div>

      <div className="form-check">
        <input
          type="checkbox"
          id="is_important"
          name="is_important"
          checked={formData.is_important}
          onChange={handleChange}
        />
        <label htmlFor="is_important" style={{ color: '#dc2626' }}>
          标记为重要日程（红色高亮显示）
        </label>
      </div>

      <div className="form-group form-row full">
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>详细描述</label>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleChange}
              rows={3}
              placeholder="日程详细描述（可选）"
              style={{
                flex: 1,
                padding: '0.625rem',
                border: '1px solid var(--gray-300)',
                borderRadius: 'var(--radius)',
                fontSize: '0.95rem',
                resize: 'vertical',
              }}
            />
            <VoiceInputButton
              label="语音"
              onResult={(text) => setFormData((prev) => ({ ...prev, description: prev.description ? prev.description + ' ' + text : text }))}
            />
          </div>
        </div>
      </div>

      <fieldset style={{ border: '2px solid #e5e7eb', borderRadius: 'var(--radius)', padding: '1rem', marginBottom: '1rem', background: '#fafafa' }}>
        <legend style={{ fontWeight: 600, padding: '0 0.5rem', fontSize: '0.9rem', color: '#6b7280' }}>
          📝 备注信息（选填，用于记录客户姓名、电话等）
        </legend>
        <div className="form-row">
          <div className="form-group">
            <label>客户姓名</label>
            <input
              type="text"
              name="external_contact_name"
              value={formData.external_contact_name}
              onChange={handleChange}
              placeholder="客户姓名"
              maxLength={100}
            />
          </div>
          <div className="form-group">
            <label>客户电话</label>
            <input
              type="tel"
              name="external_contact_phone"
              value={formData.external_contact_phone}
              onChange={handleChange}
              placeholder="客户手机号或座机"
              maxLength={20}
            />
          </div>
        </div>
      </fieldset>

      <div className="form-group">
        <label>显示颜色</label>
        <input
          type="color"
          name="color"
          value={formData.color}
          onChange={handleChange}
          style={{ width: '60px', height: '36px', border: 'none', cursor: 'pointer' }}
        />
      </div>

      <div className="form-actions">
        <button type="submit" className="btn-submit" disabled={loading}>
          {loading ? '保存中...' : isEditing ? '保存修改' : '创建日程'}
        </button>
        <button type="button" className="btn-cancel" onClick={() => window.history.back()}>
          取消
        </button>
      </div>
    </form>

      {categoryManagerOpen && (
        <div className="modal-overlay" onMouseDown={() => setCategoryManagerOpen(false)}>
          <section className="modal category-manager-modal" onMouseDown={event => event.stopPropagation()}>
            <div className="modal-header"><div><span className="file-eyebrow">个人日程分类</span><h3>管理{scheduleOwnerLabel}的分类</h3></div><button type="button" className="text-button" onClick={() => setCategoryManagerOpen(false)}>关闭</button></div>
            <p className="category-owner-hint">这些分类仅用于{scheduleOwnerLabel}的日程。删除分类不会删除原日程。</p>
            {categoryError && <div className="error-message">{categoryError}</div>}
            <form className="category-manager-form" onSubmit={saveCategory}>
              <label>分类名称 *<input autoFocus value={categoryForm.name} onChange={event => setCategoryForm({ ...categoryForm, name: event.target.value })} maxLength={50} placeholder="例如：工作、家庭、客户" /></label>
              <label>图标<input value={categoryForm.icon} onChange={event => setCategoryForm({ ...categoryForm, icon: event.target.value })} maxLength={10} placeholder="📋" /></label>
              <label>颜色<input type="color" value={categoryForm.color} onChange={event => setCategoryForm({ ...categoryForm, color: event.target.value })} /></label>
              <label className="wide">描述<input value={categoryForm.description} onChange={event => setCategoryForm({ ...categoryForm, description: event.target.value })} maxLength={200} placeholder="可选" /></label>
              <div className="modal-actions wide"><Button variant="primary" type="submit" disabled={categorySaving}>{categorySaving ? '保存中...' : editingCategoryId ? '保存修改' : '新建分类'}</Button>{editingCategoryId && <Button onClick={resetCategoryForm}>取消编辑</Button>}</div>
            </form>
            <div className="category-manager-list">
              {categories.map(category => <article key={category.id} style={{ '--category-color': category.color }}><span className="category-manager-icon">{category.icon}</span><div><strong>{category.name}</strong>{category.description && <small>{category.description}</small>}</div><div className="category-manager-actions"><Button variant="text" onClick={() => { setEditingCategoryId(category.id); setCategoryForm({ name: category.name, description: category.description || '', color: category.color || '#3788d8', icon: category.icon || '📋', sort_order: category.sort_order || 0 }); setCategoryError('') }}>编辑</Button><Button variant="danger" onClick={() => setPendingCategoryDelete(category)}>删除</Button></div></article>)}
              {!categories.length && <div className="empty-state-small">暂无分类，可在上方创建。</div>}
            </div>
          </section>
        </div>
      )}
      <ConfirmDialog open={!!pendingCategoryDelete} danger title="删除个人分类" message={`确定删除“${pendingCategoryDelete?.name || ''}”吗？使用该分类的日程会保留并改为“未分类”。`} confirmText="删除分类" onCancel={() => setPendingCategoryDelete(null)} onConfirm={removeCategory} />
    </>
  )
}
