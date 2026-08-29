import apiClient from './client'

/**
 * 全局搜索日程
 */
export async function searchSchedules(keyword, page = 1, pageSize = 20) {
  const res = await apiClient.get('/search', {
    params: { q: keyword, page, page_size: pageSize },
  })
  return res.data
}
