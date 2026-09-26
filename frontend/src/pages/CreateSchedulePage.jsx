import { useSearchParams, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import ScheduleForm from '../components/schedule/ScheduleForm'
import { createSchedule } from '../api/schedules'
import { getManagementFriends } from '../api/scheduleManagement'
import { useAuth } from '../contexts/AuthContext'
import useIsMobile from '../hooks/useIsMobile'
import MobilePickerSheet from '../components/mobile/MobilePickerSheet'

export default function CreateSchedulePage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const prefilledDate = searchParams.get('date')
  const prefilledTitle = searchParams.get('title')
  const forUserParam = searchParams.get('for_user')
  const [managedUsers, setManagedUsers] = useState([])
  const [permissionsLoaded, setPermissionsLoaded] = useState(false)
  const [forUserId, setForUserId] = useState(forUserParam ? parseInt(forUserParam) : null)
  const [managedSearch, setManagedSearch] = useState('')
  const [showManagedDropdown, setShowManagedDropdown] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const isMobile = useIsMobile()
  const filteredManagedUsers = managedUsers.filter(u => !managedSearch || u.nickname.includes(managedSearch) || (u.username||'').includes(managedSearch))

  useEffect(() => {
    getManagementFriends().then((res) => {
      setManagedUsers((res.data || []).filter(x => x.management?.status === 'approved').map(x => ({ ...x, owner_id: x.id })))
    }).catch(() => {}).finally(() => setPermissionsLoaded(true))
  }, [])

  const managedUser = managedUsers.find(u => u.owner_id === forUserId)
  const readerNeedsManagedOwner = user?.role === 'reader'
  const canShowForm = !readerNeedsManagedOwner || Boolean(managedUser)

  const initialData = (prefilledDate || prefilledTitle)
    ? {
        ...(prefilledDate ? {
          start_time: `${prefilledDate}T09:00`,
          end_time: `${prefilledDate}T10:00`,
        } : {}),
        ...(prefilledTitle ? { title: prefilledTitle } : {}),
      }
    : undefined

  const handleSubmit = async (formData) => {
    await createSchedule(formData, forUserId)
    // 如果替他人创建，返回他的日历视图；否则返回自己日历
    if (forUserId) {
      navigate(`/?view=${forUserId}`)
    } else {
      navigate('/')
    }
  }

  return (
    <div>
      {/* 手机端：创建对象显示为一行，点开从底部弹出选择面板 */}
      {isMobile && <>
        <section className="m-list">
          <button type="button" className="m-cell m-kv" onClick={() => setPickerOpen(true)}>
            <span>创建对象</span>
            <span className="m-kv-value">{forUserId ? `${managedUser?.nickname || '已授权用户'} 的日程` : '我的日程'}</span>
            <svg className="m-chevron" viewBox="0 0 8 14" aria-hidden="true"><path d="M1 1l6 6-6 6" /></svg>
          </button>
        </section>
        {pickerOpen && <MobilePickerSheet
          title="选择创建对象"
          searchPlaceholder="搜索可管理的好友"
          options={[
            ...(readerNeedsManagedOwner ? [] : [{ id: null, label: '自己', pinned: true }]),
            ...managedUsers.map(u => ({ id: u.owner_id, label: `${u.nickname} 的日程`, keywords: [u.nickname, u.username] })),
          ]}
          selectedId={forUserId}
          onSelect={id => { setForUserId(id); setPickerOpen(false) }}
          onClose={() => setPickerOpen(false)}
        />}
      </>}

      {/* 有效日程管理权限的用户选择器 */}
      {!isMobile && <div className="for-user-selector" style={{ position: 'relative' }}>
          <label>👤 创建对象</label>
          <input
            className="search-input managed-search-input"
            aria-label="搜索可管理用户"
            placeholder="输入姓名或用户名搜索可管理用户"
            value={managedSearch}
            onChange={(e) => { setManagedSearch(e.target.value); setShowManagedDropdown(true) }}
            onFocus={() => setShowManagedDropdown(true)}
            onBlur={() => setTimeout(() => setShowManagedDropdown(false), 150)}
            style={{ flex: 1, fontSize: '0.8rem', padding: '0.3rem 0.5rem', cursor: 'pointer' }}
          />
          <small className="managed-picker-current">当前：{forUserId ? `${managedUsers.find(u => u.owner_id === forUserId)?.nickname || '已授权用户'} 的日程` : '我的日程'}</small>
          {forUserId && (
            <span onClick={() => { setForUserId(null); setManagedSearch('') }}
              style={{ position: 'absolute', right: 8, top: 34, cursor: 'pointer', color: '#9ca3af', fontSize: '0.8rem', zIndex: 1 }}>✕</span>
          )}
          {showManagedDropdown && (
            <div className="managed-dropdown" style={{ top: '100%', left: 80 }}>
              <div className="managed-dropdown-heading">选择创建对象</div>
              {!readerNeedsManagedOwner && <div className={`managed-dropdown-item ${!forUserId ? 'active' : ''}`}
                onMouseDown={(e) => { e.preventDefault(); setForUserId(null); setManagedSearch(''); setShowManagedDropdown(false) }}>
                <span>📋</span> 自己
              </div>}
              {filteredManagedUsers.map(u => (
                <div key={u.owner_id} className={`managed-dropdown-item ${forUserId === u.owner_id ? 'active' : ''}`}
                  onMouseDown={(e) => { e.preventDefault(); setForUserId(u.owner_id); setManagedSearch(''); setShowManagedDropdown(false) }}>
                  <span>🔗</span> {u.nickname} 的日程
                </div>
              ))}
              {filteredManagedUsers.length === 0 && managedSearch && (
                <div className="managed-dropdown-item" style={{ color: '#9ca3af' }}>未找到匹配用户</div>
              )}
            </div>
          )}
      </div>}

      {!isMobile && managedUser && (
        <div className="for-user-banner">
          📝 正在为 <strong>{managedUser.nickname}</strong> 创建日程
          {!readerNeedsManagedOwner && <button className="btn-cancel-sm" onClick={() => setForUserId(null)} style={{ marginLeft: '1rem' }}>
            取消
          </button>}
        </div>
      )}

      {permissionsLoaded && readerNeedsManagedOwner && !managedUser && (
        <div className="empty-state">请选择一位已授权你管理日程的好友；当前不能为自己新建日程。</div>
      )}

      {canShowForm && <ScheduleForm
        initialData={initialData}
        ownerId={forUserId}
        ownerName={managedUser?.nickname || null}
        onSubmit={handleSubmit}
        isEditing={false}
      />}
    </div>
  )
}
