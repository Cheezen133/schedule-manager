import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getDashboardStats } from '../api/dashboard'
import Loading from '../components/common/Loading'
import { getManagementOverview, resolveManagement } from '../api/scheduleManagement'
import { Button, ConfirmDialog } from '../components/common/Ui'

const EMPTY_STATS = {
  overview: { total_all: 0, total_month: 0, total_pending: 0, total_confirmed: 0, total_important: 0, completion_rate: 0 },
  status_distribution: { pending: 0, confirmed: 0, rejected: 0 },
  category_distribution: [],
  trend_7days: [],
  recent_schedules: [],
}

const STATUS_LABELS = { pending: '待审核', confirmed: '已确认', rejected: '已驳回', cancelled: '已取消' }
const STATUS_COLORS = { pending: '#f59e0b', confirmed: '#16a34a', rejected: '#6b7280' }

function normaliseStats(payload) {
  const data = payload?.data ?? payload ?? {}
  return {
    overview: { ...EMPTY_STATS.overview, ...(data.overview || {}) },
    status_distribution: { ...EMPTY_STATS.status_distribution, ...(data.status_distribution || {}) },
    category_distribution: Array.isArray(data.category_distribution) ? data.category_distribution : [],
    trend_7days: Array.isArray(data.trend_7days) ? data.trend_7days : [],
    recent_schedules: Array.isArray(data.recent_schedules) ? data.recent_schedules : [],
  }
}

export default function DashboardPage() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [management, setManagement] = useState({ can_manage: [], managed_by: [], incoming_pending: [], outgoing_pending: [] })
  const [managementError, setManagementError] = useState('')
  const [pendingAction, setPendingAction] = useState(null)

  const refreshManagement = useCallback(async () => {
    try {
      const response = await getManagementOverview()
      setManagement(response.data || { can_manage: [], managed_by: [], incoming_pending: [], outgoing_pending: [] })
      setManagementError('')
    } catch {
      setManagementError('日程管理权限暂未刷新，请重试。')
    }
  }, [])

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      // 管理权限模块出现短暂网络错误时，不应让整个仪表盘的统计数据白屏。
      const [statsResult, managementResult] = await Promise.allSettled([getDashboardStats(), getManagementOverview()])
      if (statsResult.status !== 'fulfilled') throw statsResult.reason
      setStats(normaliseStats(statsResult.value))
      if (managementResult.status === 'fulfilled') {
        setManagement(managementResult.value.data || { can_manage: [], managed_by: [], incoming_pending: [], outgoing_pending: [] })
        setManagementError('')
      } else {
        setManagementError('日程管理权限暂未刷新，请重试。')
      }
    } catch {
      setError('获取统计数据失败，请稍后重试。')
    } finally {
      setLoading(false)
    }
  }, [])

  const formatRemaining = seconds => {
    if (!seconds) return '已到期'
    const days = Math.floor(seconds / 86400), hours = Math.floor((seconds % 86400) / 3600), minutes = Math.floor((seconds % 3600) / 60)
    return `${days ? `${days}天 ` : ''}${hours}小时 ${minutes}分`
  }
  const handleManagementAction = async () => {
    if (!pendingAction) return
    try {
      await resolveManagement(pendingAction.id, pendingAction.action)
      setPendingAction(null)
      await fetchData()
    } catch {
      setPendingAction(null)
      setManagementError('日程管理状态暂未确认，正在重新获取。')
      await refreshManagement()
    }
  }

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => {
    const timer = setInterval(refreshManagement, 10000)
    return () => clearInterval(timer)
  }, [refreshManagement])

  if (loading) return <Loading />
  if (error) return <div className="dashboard-error"><div className="error-message">{error}</div><button className="btn-primary" onClick={fetchData}>重新加载</button></div>
  if (!stats) return null

  const { overview, status_distribution, category_distribution, trend_7days, recent_schedules } = stats
  const maxTrend = Math.max(...trend_7days.map(item => Number(item.count) || 0), 1)
  const maxStatus = Math.max(...Object.values(status_distribution).map(Number), 1)
  const maxCategory = Math.max(...category_distribution.map(item => Number(item.count) || 0), 1)

  const cards = [
    ['primary', overview.total_all, '全部日程'], ['info', overview.total_month, '本月日程'],
    ['warning', overview.total_pending, '待审核'], ['success', overview.total_confirmed, '已确认'],
    ['danger', overview.total_important, '重要日程'], ['accent', `${overview.completion_rate}%`, '完成率'],
  ]

  return <div className="dashboard-page">
    <div className="page-title-row"><div><h2>数据仪表盘</h2><p>日程处理情况与最近活动概览</p></div></div>
    <div className="stats-cards">{cards.map(([tone, value, label]) => <div className={`stat-card ${tone}`} key={label}><div className="stat-number">{value}</div><div className="stat-label">{label}</div></div>)}</div>
    <section className="dashboard-panel management-center"><div className="management-heading"><div><span className="file-eyebrow">朋友圈式权限</span><h3>日程管理权限</h3></div><p>管理权限有效期为 7 天，可随时取消。</p></div>{management.can_manage.length > 0 && <div className="management-shortcuts">{management.can_manage.map(item => <div key={item.id} className="management-shortcut"><div><strong>{item.owner_name || '用户'}</strong><small>可管理 · 剩余 {formatRemaining(item.remaining_seconds)}</small></div><div><Link className="ui-button ui-button-secondary" to={`/?view=${item.owner_id}`}>打开日历</Link><Link className="ui-button ui-button-primary" to={`/schedules/new?for_user=${item.owner_id}`}>新建日程</Link></div></div>)}</div>}<div className="management-grid"><PermissionColumn title="我能管理谁" empty="暂无可管理的日程" items={management.can_manage} nameKey="owner_name" actionLabel="取消权限" onAction={item => setPendingAction({ id: item.id, action: 'revoke', title: '取消管理权限', message: `确定取消对“${item.owner_name}”的日程管理权限吗？` })} renderMeta={item => `剩余 ${formatRemaining(item.remaining_seconds)}`} /><PermissionColumn title="谁能管理我" empty="暂无管理者" items={management.managed_by} nameKey="requester_name" actionLabel="取消权限" onAction={item => setPendingAction({ id: item.id, action: 'revoke', title: '取消管理权限', message: `确定取消“${item.requester_name}”的日程管理权限吗？` })} renderMeta={item => `剩余 ${formatRemaining(item.remaining_seconds)}`} /><PermissionColumn title="待我处理" empty="暂无待处理申请" items={management.incoming_pending} nameKey="requester_name" actionLabel="同意" onAction={item => setPendingAction({ id: item.id, action: 'approve', title: '同意日程管理申请', message: `同意“${item.requester_name}”管理你的日程 7 天吗？` })} secondaryAction={{ label: '拒绝', action: item => setPendingAction({ id: item.id, action: 'reject', title: '拒绝日程管理申请', message: `拒绝“${item.requester_name}”的申请吗？` }) }} renderMeta={() => '等待你的处理'} /><PermissionColumn title="我发出的申请" empty="暂无待处理申请" items={management.outgoing_pending} nameKey="owner_name" actionLabel="撤销" onAction={item => setPendingAction({ id: item.id, action: 'revoke', title: '撤销日程管理申请', message: `撤销向“${item.owner_name}”发出的申请吗？` })} renderMeta={() => '等待对方处理'} /></div></section>
    <div className="dashboard-grid">
      <section className="dashboard-panel"><h3>状态分布</h3><div className="bar-chart">{Object.entries(status_distribution).map(([key, value]) => <div className="bar-row" key={key}><span className="bar-label">{STATUS_LABELS[key] || key}</span><div className="bar-track"><div className="bar-fill" style={{ width: `${(Number(value) / maxStatus) * 100}%`, backgroundColor: STATUS_COLORS[key] || '#9ca3af' }} /></div><span className="bar-value">{value}</span></div>)}</div></section>
      <section className="dashboard-panel"><h3>分类分布（Top 10）</h3>{category_distribution.length === 0 ? <div className="empty-state-small">暂无数据</div> : <div className="category-chart">{category_distribution.map((category, index) => <div className="bar-row" key={category.id || `${category.name}-${index}`}><i className="category-dot" style={{ backgroundColor: category.color || '#9ca3af' }} /><span className="bar-label">{category.name || '未分类'}</span><div className="bar-track"><div className="bar-fill" style={{ width: `${(Number(category.count) / maxCategory) * 100}%`, backgroundColor: category.color || '#9ca3af' }} /></div><span className="bar-value">{category.count || 0}</span></div>)}</div>}</section>
      <section className="dashboard-panel"><h3>近 7 天新建趋势</h3>{trend_7days.length === 0 ? <div className="empty-state-small">暂无数据</div> : <div className="trend-chart">{trend_7days.map((item, index) => <div className="trend-bar-col" key={`${item.date}-${index}`}><div className="trend-bar-value">{item.count || 0}</div><div className="trend-bar" style={{ height: `${((Number(item.count) || 0) / maxTrend) * 120}px` }} /><div className="trend-bar-date">{item.date}</div></div>)}</div>}</section>
      <section className="dashboard-panel"><h3>最近创建</h3>{recent_schedules.length === 0 ? <div className="empty-state-small">暂无数据</div> : <div className="recent-list">{recent_schedules.map(schedule => <Link to={`/schedules/${schedule.id}`} key={schedule.id} className="recent-item"><div className="recent-item-header"><span className="recent-title">{schedule.is_important && '🔶 '}{schedule.title || '未命名日程'}</span><span className={`status-badge status-${schedule.status}`}>{STATUS_LABELS[schedule.status] || schedule.status}</span></div><div className="recent-meta">{schedule.creator_name && <span>👤 {schedule.creator_name}</span>}{schedule.category_name && <span style={{ color: schedule.category_color }}>🏷️ {schedule.category_name}</span>}</div></Link>)}</div>}</section>
    </div>
    <ConfirmDialog open={!!pendingAction} danger={pendingAction?.action !== 'approve'} title={pendingAction?.title} message={pendingAction?.message} confirmText={pendingAction?.action === 'approve' ? '同意' : '确认'} onCancel={() => setPendingAction(null)} onConfirm={handleManagementAction} />
  </div>
}

function PermissionColumn({ title, empty, items, nameKey, actionLabel, onAction, secondaryAction, renderMeta }) {
  return <div className="permission-column"><h4>{title}</h4>{items.length ? items.map(item => <div className="permission-row" key={item.id}><div><strong>{item[nameKey] || '用户'}</strong><small>{renderMeta(item)}</small></div><div className="permission-actions"><Button variant={actionLabel === '同意' ? 'primary' : 'text'} onClick={() => onAction(item)}>{actionLabel}</Button>{secondaryAction && <Button variant="text" className="danger" onClick={() => secondaryAction.action(item)}>{secondaryAction.label}</Button>}</div></div>) : <div className="empty-state-small">{empty}</div>}</div>
}
