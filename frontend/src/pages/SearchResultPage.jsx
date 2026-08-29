import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { searchSchedules } from '../api/search'
import Loading from '../components/common/Loading'
const STATUS_MAP = { pending: '待审核', confirmed: '已确认', rejected: '已驳回', cancelled: '已取消' }

export default function SearchResultPage() {
  const [searchParams] = useSearchParams()
  const keyword = searchParams.get('q') || ''
  const [results, setResults] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const doSearch = async (p = 1) => {
    if (!keyword.trim()) return
    try {
      setLoading(true)
      const res = await searchSchedules(keyword, p)
      if (p === 1) {
        setResults(res.data?.items || [])
      } else {
        setResults(prev => [...prev, ...(res.data?.items || [])])
      }
      setTotal(res.data?.total || 0)
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }

  useEffect(() => {
    setPage(1)
    doSearch(1)
  }, [keyword])

  const handleLoadMore = () => {
    const nextPage = page + 1
    setPage(nextPage)
    doSearch(nextPage)
  }

  const formatTime = (s) => {
    if (!s) return ''
    const d = new Date(s)
    return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="page-content">
      <h2>🔍 搜索结果："{keyword}"</h2>
      <p className="search-result-count">共找到 {total} 条日程</p>

      {loading && page === 1 ? <Loading /> : (
        <div className="search-results">
          {results.length === 0 ? (
            <div className="empty-state">未找到相关日程，请尝试其他关键词</div>
          ) : (
            results.map(s => (
              <Link to={`/schedules/${s.id}`} key={s.id} className="schedule-card-link">
                <div className={`schedule-card${s.is_important ? ' important' : ''}`}>
                  <h3>
                    {s.is_important && <span className="important-icon">🔴</span>}
                    {s.title}
                    <span className={`status-badge status-${s.status}`}>{STATUS_MAP[s.status] || s.status}</span>
                  </h3>
                  <div className="schedule-meta">
                    <span>📅 {formatTime(s.start_time)} — {formatTime(s.end_time)}</span>
                    {s.category_name && (
                      <span style={{ color: s.category_color }}>📂 {s.category_name}</span>
                    )}
                  </div>
                  {s.description && <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>{s.description}</p>}
                  <div className="schedule-meta">
                    {s.external_contact_name && <span>👤 {s.external_contact_name}</span>}
                    {s.external_contact_phone && <span>📞 {s.external_contact_phone}</span>}
                  </div>
                </div>
              </Link>
            ))
          )}
          {results.length < total && (
            <div style={{ textAlign: 'center', marginTop: '1rem' }}>
              <button className="btn-cancel" onClick={handleLoadMore} disabled={loading}>
                {loading ? '加载中...' : '加载更多'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
