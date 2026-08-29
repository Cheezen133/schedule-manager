import { useEffect, useState } from 'react'
import Loading from '../components/common/Loading'
import { getCategories, createCategory, updateCategory, deleteCategory } from '../api/categories'
import { Button, ConfirmDialog } from '../components/common/Ui'

const emptyForm = { name: '', description: '', color: '#4f46e5', icon: '📌', sort_order: 0 }
export default function CategoriesPage() {
  const [categories, setCategories] = useState([]), [loading, setLoading] = useState(true), [error, setError] = useState(''), [editingId, setEditingId] = useState(null), [form, setForm] = useState(emptyForm), [pendingDelete, setPendingDelete] = useState(null)
  const loadCategories = async () => { try { const res = await getCategories(true); setCategories(res.data || []) } catch { setError('加载分类失败。') } finally { setLoading(false) } }
  useEffect(() => { loadCategories() }, [])
  const resetForm = () => { setForm(emptyForm); setEditingId(null) }
  const submit = async event => { event.preventDefault(); if (!form.name.trim()) return setError('请输入分类名称。'); try { if (editingId) await updateCategory(editingId, form); else await createCategory(form); resetForm(); loadCategories() } catch (err) { setError(err.userMessage || '保存失败。') } }
  const confirmDelete = async () => { try { await deleteCategory(pendingDelete.id); setPendingDelete(null); loadCategories() } catch (err) { setError(err.userMessage || '删除失败。') } }
  if (loading) return <Loading />
  return <div className="page-content category-page"><div className="page-heading"><div><span>日程设置</span><h2>分类管理</h2><p>创建并维护日程分类，便于清晰区分工作内容。</p></div></div>{error && <div className="error-message">{error}</div>}
    <form className="ui-form-card" onSubmit={submit}><div className="ui-form-card-heading"><h3>{editingId ? '编辑分类' : '新建分类'}</h3><span>带 * 的项目为必填项</span></div><div className="ui-form-grid"><label>分类名称 *<input value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} placeholder="例如：会议、外出、个人" maxLength={50} /></label><label>图标<input value={form.icon} onChange={event => setForm({ ...form, icon: event.target.value })} placeholder="📌" maxLength={10} /></label><label className="wide">描述<input value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} placeholder="分类描述（可选）" maxLength={200} /></label><label>颜色<input type="color" value={form.color} onChange={event => setForm({ ...form, color: event.target.value })} /></label><label>排序<input type="number" value={form.sort_order} onChange={event => setForm({ ...form, sort_order: Number(event.target.value) || 0 })} /></label></div><div className="ui-form-actions"><Button variant="primary" type="submit">{editingId ? '保存修改' : '创建分类'}</Button>{editingId && <Button onClick={resetForm}>取消编辑</Button>}</div></form>
    <div className="category-list">{categories.map(category => <article key={category.id} className="category-card" style={{ '--category-color': category.color }}><div className="category-card-main"><b>{category.icon}</b><div><h3>{category.name}</h3>{category.description && <p>{category.description}</p>}</div></div><div className="category-card-actions"><Button variant="text" onClick={() => { setForm({ name: category.name, description: category.description || '', color: category.color, icon: category.icon, sort_order: category.sort_order }); setEditingId(category.id) }}>编辑</Button><Button variant="danger" onClick={() => setPendingDelete(category)}>删除</Button></div></article>)}{!categories.length && <div className="empty-state-small">暂无分类，创建第一个分类开始使用。</div>}</div>
    <ConfirmDialog open={!!pendingDelete} danger title="删除分类" message={`确定删除“${pendingDelete?.name || ''}”吗？`} confirmText="删除" onCancel={() => setPendingDelete(null)} onConfirm={confirmDelete} />
  </div>
}
