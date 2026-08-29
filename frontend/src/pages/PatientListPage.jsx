import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'
import { BackButton } from '../components/memo/MemoNav'
import { longPressProps } from '../components/common/longPress'

const blankPatient = () => ({ name: '', gender: '', birth_date: '', phone: '', allergies: '', medical_history: '', notes: '', group_ids: [] })
const patientFormData = patient => ({ ...patient, birth_date: patient.birth_date?.slice(0, 10) || '', group_ids: (patient.groups || []).slice(0, 1).map(group => group.id) })

export default function PatientListPage() {
  const navigate = useNavigate()
  const [patients, setPatients] = useState([]), [groups, setGroups] = useState([])
  const [q, setQ] = useState(''), [selectedGroupId, setSelectedGroupId] = useState(null), [archived, setArchived] = useState(false)
  const [patientForm, setPatientForm] = useState(null), [groupDialog, setGroupDialog] = useState(null), [confirmDialog, setConfirmDialog] = useState(null), [menu, setMenu] = useState(null), [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const [patientRes, groupRes] = await Promise.all([api.get('/memos/patients', { params: { ...(q ? { q } : {}), archived } }), api.get('/memos/patients/groups')])
      setPatients(patientRes.data?.data || []); setGroups(groupRes.data?.data || []); setError('')
    } catch { setError('无法加载病人档案。') }
  }, [q, archived])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    const close = () => setMenu(null), escape = event => { if (event.key === 'Escape') setMenu(null) }
    document.addEventListener('click', close); document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('click', close); document.removeEventListener('keydown', escape) }
  }, [])

  const visiblePatients = patients.filter(patient => {
    const ids = (patient.groups || []).map(group => group.id)
    return selectedGroupId === null || (selectedGroupId === -1 ? !ids.length : ids.includes(selectedGroupId))
  })
  const savePatient = async event => {
    event.preventDefault()
    try {
      const body = { ...patientForm, group_ids: (patientForm.group_ids || []).slice(0, 1), birth_date: patientForm.birth_date ? new Date(patientForm.birth_date).toISOString() : null }
      if (patientForm.id) await api.put(`/memos/patients/${patientForm.id}`, body); else await api.post('/memos/patients', body)
      setPatientForm(null); load()
    } catch { setError('保存病人信息失败。') }
  }
  const saveGroup = async event => {
    event.preventDefault()
    try {
      if (groupDialog.id) await api.put(`/memos/patients/groups/${groupDialog.id}`, { name: groupDialog.name }); else await api.post('/memos/patients/groups', { name: groupDialog.name })
      setGroupDialog(null); load()
    } catch { setError('保存分组失败。') }
  }
  const executeConfirm = async () => {
    if (!confirmDialog) return
    try {
      const { type, patient, group } = confirmDialog
      if (type === 'delete-group') await api.delete(`/memos/patients/groups/${group.id}`)
      if (type === 'archive') await api.post(`/memos/patients/${patient.id}/archive`)
      if (type === 'restore') await api.post(`/memos/patients/${patient.id}/restore`)
      if (type === 'purge') await api.delete(`/memos/patients/${patient.id}`)
      setConfirmDialog(null); load()
    } catch { setError('操作失败，请稍后重试。') }
  }
  const menuAction = action => {
    const patient = menu?.patient; setMenu(null); if (!patient) return
    if (action === 'open') navigate(`/profile/memos/personal/cases/${patient.id}`)
    if (action === 'edit') setPatientForm(patientFormData(patient))
    if (action === 'archive') setConfirmDialog({ type: 'archive', patient })
    if (action === 'restore') setConfirmDialog({ type: 'restore', patient })
    if (action === 'purge') setConfirmDialog({ type: 'purge', patient })
  }

  return <div className="memo-page patient-list-page">
    <BackButton fallback="/profile/memos/personal" />
    <div className="memo-header"><div><h2>病例</h2><p>管理私有病人档案、分组和病例时间轴。</p></div><button className="btn-primary" onClick={() => setPatientForm(blankPatient())}>添加病人</button></div>
    {error && <div className="error-message">{error}</div>}
    <div className="patient-toolbar"><input value={q} onChange={event => setQ(event.target.value)} placeholder="搜索姓名、联系电话或备注" /><button className={`btn-secondary ${archived ? '' : 'active'}`} onClick={() => setArchived(false)}>在档</button><button className={`btn-secondary ${archived ? 'active' : ''}`} onClick={() => setArchived(true)}>已归档</button><button className="btn-secondary" onClick={() => setGroupDialog({ name: '' })}>新建分组</button></div>
    <div className="patient-group-bar"><button className={selectedGroupId === null ? 'active' : ''} onClick={() => setSelectedGroupId(null)}>全部</button><button className={selectedGroupId === -1 ? 'active' : ''} onClick={() => setSelectedGroupId(-1)}>未分组</button>{groups.map(group => <span className="patient-group-filter" key={group.id}><button className={selectedGroupId === group.id ? 'active' : ''} onClick={() => setSelectedGroupId(group.id)}>{group.name}</button><button aria-label={`编辑${group.name}`} onClick={() => setGroupDialog({ id: group.id, name: group.name })}>⋯</button></span>)}</div>
    <div className="patient-card-grid">{visiblePatients.map(patient => <article className="patient-card" key={patient.id} onClick={() => navigate(`/profile/memos/personal/cases/${patient.id}`)} onContextMenu={event => { event.preventDefault(); setMenu({ patient, x: event.clientX, y: event.clientY }) }} {...longPressProps(event => setMenu({ patient, x: event.clientX, y: event.clientY }))}><div><h3>{patient.name}</h3><p>{patient.gender || '未填写性别'} · {patient.phone || '未填写联系电话'}</p></div><div className="patient-card-groups">{(patient.groups || []).slice(0, 1).map(group => <span key={group.id}>{group.name}</span>)}{!(patient.groups || []).length && <span>未分组</span>}</div><small>更新于 {patient.updated_at?.slice(0, 10) || patient.created_at?.slice(0, 10) || '—'}</small></article>)}{!visiblePatients.length && <div className="empty-state-small">{archived ? '暂无已归档病人' : '暂无病人档案，点击“添加病人”开始创建。'}</div>}</div>
    {menu && <div className="patient-context-menu" style={{ left: menu.x, top: menu.y }} onClick={event => event.stopPropagation()}>{!menu.patient.is_archived ? <><button onClick={() => menuAction('open')}>打开档案</button><button onClick={() => menuAction('edit')}>编辑信息</button><button className="danger" onClick={() => menuAction('archive')}>归档病人</button></> : <><button onClick={() => menuAction('restore')}>恢复病人</button><button className="danger" onClick={() => menuAction('purge')}>彻底删除</button></>}</div>}
    {patientForm && <div className="modal-overlay"><form className="modal patient-form" onSubmit={savePatient}><div className="modal-header"><h3>{patientForm.id ? '编辑病人信息' : '添加病人'}</h3><button type="button" className="text-button" onClick={() => setPatientForm(null)}>关闭</button></div><input required placeholder="姓名 *" value={patientForm.name} onChange={event => setPatientForm({ ...patientForm, name: event.target.value })} /><select value={patientForm.gender || ''} onChange={event => setPatientForm({ ...patientForm, gender: event.target.value })}><option value="">性别（可选）</option><option value="男">男</option><option value="女">女</option><option value="其他">其他</option></select><label>出生日期<input type="date" value={patientForm.birth_date || ''} onChange={event => setPatientForm({ ...patientForm, birth_date: event.target.value })} /></label><input placeholder="联系电话" value={patientForm.phone || ''} onChange={event => setPatientForm({ ...patientForm, phone: event.target.value })} /><textarea placeholder="过敏史" value={patientForm.allergies || ''} onChange={event => setPatientForm({ ...patientForm, allergies: event.target.value })} /><textarea placeholder="既往史" value={patientForm.medical_history || ''} onChange={event => setPatientForm({ ...patientForm, medical_history: event.target.value })} /><textarea placeholder="备注" value={patientForm.notes || ''} onChange={event => setPatientForm({ ...patientForm, notes: event.target.value })} /><div className="group-checks">{groups.map(group => <label key={group.id}><input type="radio" name="patient-group" checked={patientForm.group_ids.includes(group.id)} onChange={() => setPatientForm({ ...patientForm, group_ids: [group.id] })} />{group.name}</label>)}{patientForm.group_ids.length > 0 && <button type="button" className="text-button" onClick={() => setPatientForm({ ...patientForm, group_ids: [] })}>设为未分组</button>}</div><button className="btn-primary">保存病人</button></form></div>}
    {groupDialog && <div className="modal-overlay"><form className="modal compact-modal" onSubmit={saveGroup}><div className="modal-header"><h3>{groupDialog.id ? '重命名分组' : '新建分组'}</h3><button type="button" className="text-button" onClick={() => setGroupDialog(null)}>关闭</button></div><input autoFocus required placeholder="分组名称" value={groupDialog.name} onChange={event => setGroupDialog({ ...groupDialog, name: event.target.value })} /><div className="modal-actions"><button className="btn-secondary" type="button" onClick={() => setGroupDialog(null)}>取消</button><button className="btn-primary">保存</button>{groupDialog.id && <button className="text-button danger" type="button" onClick={() => { setConfirmDialog({ type: 'delete-group', group: groupDialog }); setGroupDialog(null) }}>删除分组</button>}</div></form></div>}
    {confirmDialog && <div className="modal-overlay"><div className="modal confirm-modal"><h3>{confirmDialog.type === 'delete-group' ? '删除分组' : confirmDialog.type === 'archive' ? '归档病人' : confirmDialog.type === 'restore' ? '恢复病人' : '彻底删除病人'}</h3><p>{confirmDialog.type === 'delete-group' ? '仅删除分组关系；病人及其时间轴记录会保留。没有剩余分组的病人会显示为未分组。' : confirmDialog.type === 'archive' ? '归档后可在已归档列表恢复，或选择彻底删除。' : confirmDialog.type === 'restore' ? '确认恢复该病人到在档列表吗？' : '将永久删除病人档案及其病例时间轴，无法恢复。确认继续吗？'}</p><div className="modal-actions"><button className="btn-secondary" onClick={() => setConfirmDialog(null)}>取消</button><button className="btn-primary danger" onClick={executeConfirm}>确认</button></div></div></div>}
  </div>
}
