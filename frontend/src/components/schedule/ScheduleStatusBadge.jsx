const STATUS_MAP = {
  pending: { label: '待审核', className: 'status-pending' },
  confirmed: { label: '已确认', className: 'status-confirmed' },
  rejected: { label: '已驳回', className: 'status-rejected' },
  cancelled: { label: '已取消', className: 'status-cancelled' },
}

export default function ScheduleStatusBadge({ status }) {
  const info = STATUS_MAP[status] || { label: status, className: '' }
  return (
    <span className={`status-badge ${info.className}`}>
      {info.label}
    </span>
  )
}
