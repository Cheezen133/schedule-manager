import { useState, useEffect, useCallback } from 'react'
import Loading from '../components/common/Loading'
import ScheduleCard from '../components/schedule/ScheduleCard'
import { getPendingSchedules, approveSchedule, rejectSchedule } from '../api/schedules'

export default function ReviewPage() {
  const [schedules, setSchedules] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchPending = useCallback(async () => {
    try {
      const result = await getPendingSchedules()
      setSchedules(result.data || [])
      setError('')
    } catch (err) {
      setError('获取待审核列表失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchPending()
  }, [fetchPending])

  const handleApprove = async (id, comment) => {
    await approveSchedule(id, comment)
    // 从列表中移除
    setSchedules((prev) => prev.filter((s) => s.id !== id))
  }

  const handleReject = async (id, comment) => {
    await rejectSchedule(id, comment)
    setSchedules((prev) => prev.filter((s) => s.id !== id))
  }

  if (loading) return <Loading />

  const importantOnes = schedules.filter((s) => s.is_important)
  const normalOnes = schedules.filter((s) => !s.is_important)

  return (
    <div className="review-page">
      <h2>✅ 待审核日程</h2>

      {error && <div className="error-message">{error}</div>}

      {schedules.length === 0 && (
        <p style={{ color: '#6b7280', textAlign: 'center', padding: '3rem' }}>
          暂无待审核的日程
        </p>
      )}

      {importantOnes.length > 0 && (
        <div style={{ marginBottom: '2rem' }}>
          <h3 style={{ color: '#dc2626', marginBottom: '0.75rem', fontSize: '1rem' }}>
            🔴 重要日程 ({importantOnes.length})
          </h3>
          {importantOnes.map((s) => (
            <ScheduleCard
              key={s.id}
              schedule={s}
              showReviewActions
              onApprove={(comment) => handleApprove(s.id, comment)}
              onReject={(comment) => handleReject(s.id, comment)}
            />
          ))}
        </div>
      )}

      {normalOnes.length > 0 && (
        <div>
          <h3 style={{ color: '#6b7280', marginBottom: '0.75rem', fontSize: '1rem' }}>
            普通日程 ({normalOnes.length})
          </h3>
          {normalOnes.map((s) => (
            <ScheduleCard
              key={s.id}
              schedule={s}
              showReviewActions
              onApprove={(comment) => handleApprove(s.id, comment)}
              onReject={(comment) => handleReject(s.id, comment)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
