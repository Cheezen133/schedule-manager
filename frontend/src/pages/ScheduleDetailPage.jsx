import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Loading from '../components/common/Loading'
import ScheduleCard from '../components/schedule/ScheduleCard'
import ContactCopyButton from '../components/schedule/ContactCopyButton'
import ReviewActionBar from '../components/schedule/ReviewActionBar'
import { getScheduleDetail, deleteSchedule, approveSchedule, rejectSchedule } from '../api/schedules'
import AttachmentsPanel from '../components/schedule/AttachmentsPanel'
import { useAuth } from '../contexts/AuthContext'
import { ConfirmDialog } from '../components/common/Ui'

export default function ScheduleDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user, isAdmin, isReader } = useAuth()

  const [schedule, setSchedule] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  useEffect(() => { loadSchedule() }, [id])

  const loadSchedule = async () => {
    try {
      const result = await getScheduleDetail(id)
      setSchedule(result.data)
    } catch (err) {
      setError('日程不存在或已被删除')
    } finally {
      setLoading(false)
    }
  }

  const handleApprove = async (comment) => {
    await approveSchedule(id, comment)
    loadSchedule()
  }

  const handleReject = async (comment) => {
    await rejectSchedule(id, comment)
    loadSchedule()
  }

  const handleDelete = async () => {
    try {
      await deleteSchedule(id)
      setShowDeleteConfirm(false)
      navigate('/')
    } catch (err) {
      alert(err.userMessage ||'删除失败')
    }
  }

  const handleEdit = () => {
    navigate(`/schedules/${id}/edit`)
  }

  if (loading) return <Loading />
  if (error) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem' }}>
        <h2>{error}</h2>
        <button className="btn-cancel" onClick={() => navigate('/')} style={{ marginTop: '1rem' }}>
          返回首页
        </button>
      </div>
    )
  }

  // 后端已校验权限（_can_modify_schedule），能打开详情即可操作
  const canEdit = user && schedule && !schedule.is_busy_placeholder
  const canDelete = user && schedule && !schedule.is_busy_placeholder

  return (
    <div>
      <button
        className="btn-cancel"
        onClick={() => navigate(-1)}
        style={{ marginBottom: '1rem' }}
      >
        ← 返回
      </button>

      <ScheduleCard schedule={schedule} />

      {/* 客户信息卡片 + 快捷沟通 */}
      <CustomerInfoCard schedule={schedule} />

      {/* 一键复制日程信息 */}
      <div style={{ marginTop: '0.75rem' }}>
        <CopyScheduleInfoButton schedule={schedule} />
      </div>

      {/* 操作按钮 */}
      <div style={{ marginTop: '1rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        {canEdit && (
          <button className="btn-submit" onClick={handleEdit}>
            编辑日程
          </button>
        )}
        {canDelete && (
          <button
            className="btn-reject"
            onClick={() => setShowDeleteConfirm(true)}
            style={{ borderColor: '#dc2626', color: '#dc2626' }}
          >
            删除日程
          </button>
        )}
      </div>

      {/* 代为修改的日程只能由拥有者确认；其他待审日程沿用管理员/阅读者审核。 */}
      {schedule.status === 'pending' && (
        (schedule.requires_owner_review && user?.id === schedule.created_by) ||
        (!schedule.requires_owner_review && (isAdmin || isReader))
      ) && (
        <div style={{ marginTop: '1.5rem', padding: '1.25rem', background: '#fef3c7', borderRadius: '8px' }}>
          <h4 style={{ marginBottom: '0.75rem' }}>
            {schedule.requires_owner_review ? '确认他人修改' : '审核操作'}
          </h4>
          <ReviewActionBar onApprove={handleApprove} onReject={handleReject} />
        </div>
      )}

      {/* 审核信息 */}
      {schedule.status !== 'pending' && schedule.reviewer_name && (
        <div style={{ marginTop: '1.5rem', padding: '1rem', background: '#f9fafb', borderRadius: '8px' }}>
          <p style={{ fontSize: '0.9rem', color: '#6b7280' }}>
            审核人: {schedule.reviewer_name}
            {schedule.reviewed_at && ` | 审核时间: ${new Date(schedule.reviewed_at).toLocaleString('zh-CN')}`}
          </p>
          {schedule.review_comment && (
            <p style={{ fontSize: '0.9rem', color: '#6b7280', marginTop: '0.25rem' }}>
              备注: {schedule.review_comment}
            </p>
          )}
        </div>
      )}

      {/* 附件资料 */}
      <AttachmentsPanel scheduleId={Number(id)} customerPhone={schedule?.external_contact_phone} />
      <ConfirmDialog open={showDeleteConfirm} danger title="删除日程" message="确定删除这个日程吗？删除后无法恢复。" confirmText="删除" onCancel={() => setShowDeleteConfirm(false)} onConfirm={handleDelete} />
    </div>
  )
}

/**
 * 客户信息卡片 — 显示客户姓名、电话，一键发起沟通
 */
function CustomerInfoCard({ schedule }) {
  const hasCustomer = schedule.external_contact_name || schedule.external_contact_phone

  if (!hasCustomer) {
    return (
      <div style={{
        marginTop: '1rem', padding: '1rem', background: '#f9fafb',
        border: '1px dashed #d1d5db', borderRadius: '8px', fontSize: '0.85rem', color: '#9ca3af',
      }}>
        <p>💡 尚未添加客户信息，编辑日程可添加客户姓名和联系方式。</p>
      </div>
    )
  }

  return (
    <div style={{
      marginTop: '1rem', padding: '1.25rem',
      background: 'linear-gradient(135deg, #eff6ff 0%, #f0fdf4 100%)',
      border: '1px solid #bfdbfe', borderRadius: '10px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      flexWrap: 'wrap', gap: '0.75rem',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <div style={{
          width: 48, height: 48, borderRadius: '50%',
          background: '#4f46e5', color: 'white',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '1.25rem', fontWeight: 700, flexShrink: 0,
        }}>
          {(schedule.external_contact_name || '客')[0]}
        </div>
        <div>
          {schedule.external_contact_name && (
            <div style={{ fontWeight: 600, fontSize: '1.05rem', color: '#1f2937' }}>
              👤 {schedule.external_contact_name}
            </div>
          )}
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '2px' }}>
            {schedule.external_contact_phone && (
              <span style={{ fontSize: '0.85rem', color: '#4b5563' }}>📱 {schedule.external_contact_phone}</span>
            )}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        {schedule.external_contact_phone && (
          <ContactCopyButton phone={schedule.external_contact_phone} name={schedule.external_contact_name} />
        )}
      </div>
    </div>
  )
}

/**
 * 一键复制日程全部信息
 */
function CopyScheduleInfoButton({ schedule }) {
  const [copied, setCopied] = useState(false)

  const formatDt = (dt) => {
    if (!dt) return ''
    return new Date(dt).toLocaleString('zh-CN')
  }

  const handleCopy = async () => {
    const statusMap = { pending: '待审核', confirmed: '已确认', rejected: '已驳回', cancelled: '已取消' }
    const info = [
      `标题: ${schedule.title}`,
      schedule.is_important ? '【重要日程】' : '',
      `时间: ${formatDt(schedule.start_time)} ~ ${formatDt(schedule.end_time)}`,
      schedule.is_all_day ? '(全天)' : '',
      `状态: ${statusMap[schedule.status] || schedule.status}`,
      `创建人: ${schedule.creator_name || '未知'}`,
      schedule.description ? `描述: ${schedule.description}` : '',
      schedule.external_contact_name ? `联系人: ${schedule.external_contact_name}` : '',
      schedule.external_contact_phone ? `电话: ${schedule.external_contact_phone}` : '',
      schedule.category_name ? `分类: ${schedule.category_name}` : '',
      schedule.visibility === 'admin_only' ? '【仅管理员可见】' : '',
    ].filter(Boolean).join('\n')

    try {
      await navigator.clipboard.writeText(info)
    } catch {
      const textarea = document.createElement('textarea')
      textarea.value = info
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button className={`copy-btn ${copied ? 'copied' : ''}`} onClick={handleCopy}>
      {copied ? '已复制!' : '📋 复制日程信息'}
    </button>
  )
}
