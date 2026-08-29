import { useState } from 'react'

export default function ReviewActionBar({ onApprove, onReject }) {
  const [comment, setComment] = useState('')
  const [loading, setLoading] = useState(false)

  const handleApprove = async () => {
    setLoading(true)
    try {
      await onApprove(comment)
    } finally {
      setLoading(false)
      setComment('')
    }
  }

  const handleReject = async () => {
    setLoading(true)
    try {
      await onReject(comment)
    } finally {
      setLoading(false)
      setComment('')
    }
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
      <div className="review-actions">
        <button className="btn-approve" onClick={handleApprove} disabled={loading}>
          {loading ? '处理中...' : '✓ 批准'}
        </button>
        <button className="btn-reject" onClick={handleReject} disabled={loading}>
          {loading ? '处理中...' : '✗ 驳回'}
        </button>
      </div>
    </div>
  )
}
