import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import CalendarView from '../components/calendar/CalendarView'
import Loading from '../components/common/Loading'
import { getSchedules, exportIcal } from '../api/schedules'
import { getManagementFriends } from '../api/scheduleManagement'
import { getBeijingCurrentMonthRange } from '../utils/dateTime'

const SWITCH_KEY = 'calendar_selected_user'

export default function CalendarPage() {
  const [searchParams] = useSearchParams()
  const [schedules, setSchedules] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [managedUsers, setManagedUsers] = useState([])
  const [managedSearch, setManagedSearch] = useState('')
  const [showManagedDropdown, setShowManagedDropdown] = useState(false)
  const filteredManagedUsers = managedUsers.filter(u => !managedSearch || u.nickname.includes(managedSearch) || (u.username||'').includes(managedSearch))
  // 优先级：URL view 参数 > sessionStorage > null
  const [selectedUserId, setSelectedUserId] = useState(() => {
    const fromUrl = searchParams.get('view')
    if (fromUrl) return parseInt(fromUrl)
    const saved = sessionStorage.getItem(SWITCH_KEY)
    return saved ? parseInt(saved) : null
  })
  const navigate = useNavigate()

  // 持久化选择
  useEffect(() => {
    if (selectedUserId) {
      sessionStorage.setItem(SWITCH_KEY, String(selectedUserId))
    } else {
      sessionStorage.removeItem(SWITCH_KEY)
    }
  }, [selectedUserId])

  // 所有好友都可查看忙碌占位；只有已批准管理者可查看详情和代建日程。
  useEffect(() => {
    getManagementFriends().then((res) => {
      setManagedUsers((res.data || []).map(x => ({ ...x, owner_id: x.id })))
    }).catch(() => {})
  }, [])

  const fetchSchedules = useCallback(async () => {
    try {
      setError('')
      const params = {}
      if (selectedUserId) params.created_by = selectedUserId
      const result = await getSchedules(params)
      setSchedules(result.data || [])
    } catch (err) {
      setError('获取日程失败')
    } finally {
      setLoading(false)
    }
  }, [selectedUserId])

  useEffect(() => {
    setLoading(true)
    fetchSchedules()
  }, [fetchSchedules])

  const handleEventClick = (eventId) => {
    navigate(`/schedules/${eventId}`)
  }

  const handleDateClick = (dateStr) => {
    const params = new URLSearchParams()
    params.set('date', dateStr)
    if (selectedUserId) {
      const selected = managedUsers.find(user => user.owner_id === selectedUserId)
      if (selected?.management?.status !== 'approved') {
        alert('你只能查看该好友的忙碌时间；获得日程管理权限后才能代为创建日程。')
        return
      }
      params.set('for_user', String(selectedUserId))
    }
    navigate(`/schedules/new?${params.toString()}`)
  }

  const handleExport = async () => {
    const { startDate, endDate } = getBeijingCurrentMonthRange()
    const selected = selectedUserId ? managedUsers.find(user => user.owner_id === selectedUserId) : null
    if (selectedUserId && selected?.management?.status !== 'approved') {
      alert('没有该好友日程的有效管理权限，无法导出。')
      return
    }
    try {
      const blob = await exportIcal(startDate, endDate, selectedUserId)
      const objectUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objectUrl
      a.download = `schedules_${startDate}_${endDate}.ics`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
    } catch (error) {
      alert(error.response?.status === 403 ? '没有该好友日程的有效管理权限，无法导出。' : (error.userMessage || '导出失败'))
    }
  }

  const selectedLabel = selectedUserId
    ? (managedUsers.find(u => u.owner_id === selectedUserId)?.nickname || '其他用户')
    : '我的日程'

  const pendingCount = schedules.filter((s) => s.status === 'pending').length
  const confirmedCount = schedules.filter((s) => s.status === 'confirmed').length
  const importantCount = schedules.filter((s) => s.is_important).length

  if (loading) return <Loading />

  return (
    <div className="calendar-page">
      <div className="calendar-toolbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <h2>📆 日历视图</h2>
          <div className="managed-picker" style={{ position: 'relative' }}>
              <span className="managed-picker-label">日历对象</span>
              <input
                className="search-input managed-search-input"
                aria-label="搜索好友日历"
                placeholder="输入姓名或用户名搜索好友"
                value={managedSearch}
                onChange={(e) => { setManagedSearch(e.target.value); setShowManagedDropdown(true) }}
                onFocus={() => setShowManagedDropdown(true)}
                onBlur={() => setTimeout(() => setShowManagedDropdown(false), 150)}
                style={{ width: 220, fontSize: '0.8rem', padding: '0.3rem 0.5rem', cursor: 'pointer' }}
              />
              <small className="managed-picker-current">当前：{selectedUserId ? `${managedUsers.find(u => u.owner_id === selectedUserId)?.nickname || '已授权用户'} 的日程` : '我的日程'}</small>
              {selectedUserId && (
                <span onClick={() => { setSelectedUserId(null); setManagedSearch('') }}
                  style={{ position: 'absolute', right: 8, top: 27, cursor: 'pointer', color: '#9ca3af', fontSize: '0.8rem' }}>✕</span>
              )}
              {showManagedDropdown && (
                <div className="managed-dropdown">
                  <div className="managed-dropdown-heading">选择日程对象</div>
                  <div className={`managed-dropdown-item ${!selectedUserId ? 'active' : ''}`}
                    onMouseDown={(e) => { e.preventDefault(); setSelectedUserId(null); setManagedSearch(''); setShowManagedDropdown(false) }}>
                    <span>📋</span> 我的日程
                  </div>
                  {filteredManagedUsers.map(u => (
                    <div key={u.owner_id} className={`managed-dropdown-item ${selectedUserId === u.owner_id ? 'active' : ''}`}
                      onMouseDown={(e) => { e.preventDefault(); setSelectedUserId(u.owner_id); setManagedSearch(''); setShowManagedDropdown(false) }}>
                      <span>{u.management?.status === 'approved' ? '🔗' : '👤'}</span> {u.nickname} 的日程 {u.management?.status === 'approved' ? '（可管理）' : '（仅忙碌）'}
                    </div>
                  ))}
                  {filteredManagedUsers.length === 0 && managedSearch && (
                    <div className="managed-dropdown-item" style={{ color: '#9ca3af' }}>未找到匹配用户</div>
                  )}
                </div>
              )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          {selectedUserId && (
            <span className="user-switcher-hint">
              {selectedLabel}
            </span>
          )}
          <button className="btn-export" onClick={handleExport}>
            📤 导出 iCal
          </button>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="calendar-legend" style={{ marginBottom: '1rem' }}>
        <div className="legend-item">
          <div className="legend-dot confirmed"></div>
          <span>已确认 ({confirmedCount})</span>
        </div>
        <div className="legend-item">
          <div className="legend-dot pending"></div>
          <span>待审核 ({pendingCount})</span>
        </div>
        <div className="legend-item">
          <div className="legend-dot rejected"></div>
          <span>已驳回</span>
        </div>
        <div className="legend-item">
          <div className="legend-dot important"></div>
          <span>重要 ({importantCount})</span>
        </div>
      </div>

      <CalendarView
        schedules={schedules}
        onEventClick={handleEventClick}
        onDateClick={handleDateClick}
      />
    </div>
  )
}
