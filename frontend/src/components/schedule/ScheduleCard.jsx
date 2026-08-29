import { Link } from 'react-router-dom'
import ScheduleStatusBadge from './ScheduleStatusBadge'
import ContactCopyButton from './ContactCopyButton'

/**
 * 格式化日期时间显示（正确处理 UTC → 本地时间转换）
 */
function formatDateTime(dt) {
  if (!dt) return ''
  const d = new Date(dt)
  // 如果解析失败，尝试在末尾追加 Z 按 UTC 解析
  if (isNaN(d.getTime())) return dt.substring(0, 16).replace('T', ' ')
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function ScheduleCard({ schedule, showReviewActions, onApprove, onReject }) {
  return (
    <div className={`schedule-card ${schedule.is_important ? 'important' : ''} ${schedule.visibility === 'admin_only' ? 'admin-only' : ''}`}>
      <h3>
        {schedule.is_important && <span className="important-icon" title="重要日程">🔴</span>}
        <Link to={`/schedules/${schedule.id}`} style={{ color: 'inherit' }}>
          {schedule.title}
        </Link>
        <ScheduleStatusBadge status={schedule.status} />
        {schedule.visibility === 'admin_only' && (
          <span style={{
            background: '#f3e8ff', color: '#7c3aed', padding: '0.125rem 0.5rem',
            borderRadius: '10px', fontSize: '0.75rem', fontWeight: 500,
          }}>
            🔒 仅管理员
          </span>
        )}
      </h3>

      <div className="schedule-meta">
        <span>📅 {formatDateTime(schedule.start_time)}</span>
        <span>→ {formatDateTime(schedule.end_time)}</span>
        {schedule.is_all_day && <span>全天</span>}
        {schedule.creator_name && <span>👤 {schedule.creator_name}</span>}
      </div>

      {schedule.description && (
        <p style={{ fontSize: '0.9rem', color: '#4b5563', marginTop: '0.5rem' }}>
          {schedule.description}
        </p>
      )}

      <div className="schedule-footer">
        <div>
          {schedule.external_contact_phone && (
            <ContactCopyButton
              phone={schedule.external_contact_phone}
              name={schedule.external_contact_name}
            />
          )}
        </div>
        <div style={{ fontSize: '0.8rem', color: '#9ca3af' }}>
          {schedule.review_comment && `备注: ${schedule.review_comment}`}
        </div>
      </div>

      {showReviewActions && schedule.status === 'pending' && (
        <div style={{ marginTop: '0.75rem' }}>
          {onApprove && onReject && (
            <ReviewActionBarInline onApprove={onApprove} onReject={onReject} />
          )}
        </div>
      )}
    </div>
  )
}

// 内联审核操作栏
import { useState } from 'react'

function ReviewActionBarInline({ onApprove, onReject }) {
  const [comment, setComment] = useState('')
  const [loading, setLoading] = useState(false)

  const handleApprove = async () => {
    setLoading(true)
    try { await onApprove(comment) } finally { setLoading(false); setComment('') }
  }

  const handleReject = async () => {
    setLoading(true)
    try { await onReject(comment) } finally { setLoading(false); setComment('') }
  }

  return (
    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
      <input
        className="review-comment-input"
        type="text"
        placeholder="审核备注（可选）"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        style={{ minWidth: '200px' }}
      />
      <button className="btn-approve" onClick={handleApprove} disabled={loading}>
        ✓ 批准
      </button>
      <button className="btn-reject" onClick={handleReject} disabled={loading}>
        ✗ 驳回
      </button>
    </div>
  )
}
