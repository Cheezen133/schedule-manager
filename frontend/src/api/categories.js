import apiClient from './client'

/**
 * 获取分类列表
 */
export async function getCategories(includeInactive = false) {
  const res = await apiClient.get('/categories', { params: { include_inactive: includeInactive } })
  return res.data
}

/**
 * 创建分类
 */
export async function createCategory(data) {
  const res = await apiClient.post('/categories', data)
  return res.data
}

/**
 * 编辑分类
 */
export async function updateCategory(id, data) {
  const res = await apiClient.put(`/categories/${id}`, data)
  return res.data
}

/**
 * 删除分类
 */
export async function deleteCategory(id) {
  const res = await apiClient.delete(`/categories/${id}`)
  return res.data
}
