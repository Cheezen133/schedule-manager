import apiClient from './client'

/**
 * 获取仪表盘统计数据
 */
export async function getDashboardStats() {
  const res = await apiClient.get('/dashboard/stats')
  return res.data
}
