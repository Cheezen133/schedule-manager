import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import api from '../api/client'
import { beijingInputToUtcIso, beijingNowInputValue, dateOnlyToNaiveIso, formatBeijingDateTime, toBeijingInputValue } from '../utils/dateTime'
import { BackButton } from '../components/memo/MemoNav'

const RECORD_TYPES = [
  ['visit', '就诊'], ['diagnosis', '诊断'], ['treatment', '治疗'],
  ['examination', '检查'], ['followup', '随访'], ['condition', '一般情况'],
]
const blankEntry = () => ({ record_type: 'visit', occurred_at: beijingNowInputValue(), title: '', content: '' })

const patientFormData = patient => ({
  ...patient,
  birth_date: patient.birth_date?.slice(0, 10) || '',
  group_ids: (patient.groups || []).slice(0, 1).map(group => group.id),
})

export default function PatientDetailPage() {
  const { patientId } = useParams()
  const navigate = useNavigate()
  const [patient, setPatient] = useState(null)
  const [groups, setGroups] = useState([])
  const [entries, setEntries] = useState([])
  const [q, setQ] = useState('')
  const [recordType, setRecordType] = useState('')
  const [entryForm, setEntryForm] = useState(null)
  const [editForm, setEditForm] = useState(null)
  const [confirmAction, setConfirmAction] = useState(null)
  const [actionsOpen, setActionsOpen] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const [patientRes, timelineRes, groupRes] = await Promise.all([
        api.get(`/memos/patients/${patientId}`),
        api.get(`/memos/patients/${patientId}/timeline`, { params: { ...(q ? { q } : {}), ...(recordType ? { record_type: recordType } : {}) } }),
        api.get('/memos/patients/groups'),
      ])
      setPatient(patientRes.data?.data)
      setEntries(timelineRes.data?.data || [])
      setGroups(groupRes.data?.data || [])
      setError('')
    } catch {
      setError('无法加载病人档案或病例记录。')
    }
  }, [patientId, q, recordType])

  useEffect(() => { load() }, [load])

  const saveEntry = async event => {
    event.preventDefault()
    try {
      const body = { ...entryForm, occurred_at: beijingInputToUtcIso(entryForm.occurred_at) }
      if (entryForm.id) await api.put(`/memos/patients/${patientId}/timeline/${entryForm.id}`, body)
      else await api.post(`/memos/patients/${patientId}/timeline`, body)
      setEntryForm(null)
      load()
    } catch {
      setError('保存病例记录失败。')
    }
  }

  const savePatient = async event => {
    event.preventDefault()
    try {
      await api.put(`/memos/patients/${patientId}`, {
        ...editForm,
        birth_date: dateOnlyToNaiveIso(editForm.birth_date),
      })
      setEditForm(null)
      load()
    } catch {
      setError('保存病人信息失败。')
    }
  }

  const executeConfirm = async () => {
    if (!confirmAction) return
    try {
      if (confirmAction.type === 'archive') {
        await api.post(`/memos/patients/${patientId}/archive`)
        navigate('/profile/memos/personal/cases')
      }
      if (confirmAction.type === 'delete-entry') {
        await api.delete(`/memos/patients/${patientId}/timeline/${confirmAction.entry.id}`)
        setConfirmAction(null)
        load()
      }
    } catch {
      setError('操作失败，请稍后重试。')
    }
  }

  if (!patient) return <div className="memo-page">正在加载病人档案…</div>

  return <div className="memo-page patient-page">
    <BackButton fallback="/profile/memos/personal/cases" />
    <div className="memo-header">
      <div>
        <h2>{patient.name}</h2>
        <p>{patient.gender || '未填写性别'} · {patient.phone || '未填写联系电话'} · {(patient.groups || []).map(group => group.name).join('、') || '未分组'}</p>
      </div>
      <div className="patient-action-menu">
        <button className="btn-secondary" onClick={() => setActionsOpen(!actionsOpen)}>档案操作 {actionsOpen ? '⌃' : '⌄'}</button>
        {actionsOpen && <div className="patient-action-popover">
          <button onClick={() => { setActionsOpen(false); setEditForm(patientFormData(patient)) }}>编辑信息</button>
          <button className="danger" onClick={() => { setActionsOpen(false); setConfirmAction({ type: 'archive' }) }}>归档病人</button>
        </div>}
      </div>
    </div>
    {error && <div className="error-message">{error}</div>}

    <section className="patient-profile">
      <h3>病人信息</h3>
      <dl>
        <dt>出生日期</dt><dd>{patient.birth_date ? patient.birth_date.slice(0, 10) : '未填写'}</dd>
        <dt>过敏史</dt><dd>{patient.allergies || '未填写'}</dd>
        <dt>既往史</dt><dd>{patient.medical_history || '未填写'}</dd>
        <dt>备注</dt><dd>{patient.notes || '未填写'}</dd>
      </dl>
    </section>

    <div className="memo-header timeline-head">
      <div><h3>病例时间轴</h3><p>按发生时间从新到旧排列。</p></div>
      <button className="btn-primary" onClick={() => setEntryForm(blankEntry())}>添加记录</button>
    </div>
    <form className="memo-filters" onSubmit={event => { event.preventDefault(); load() }}>
      <input placeholder="搜索标题或详情" value={q} onChange={event => setQ(event.target.value)} />
      <select value={recordType} onChange={event => setRecordType(event.target.value)}>
        <option value="">全部类型</option>
        {RECORD_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
      <button className="btn-secondary">筛选</button>
    </form>
    <div className="timeline">
      {entries.map(entry => <article className="timeline-item" key={entry.id}>
        <time>{formatBeijingDateTime(entry.occurred_at)}</time>
        <div>
          <span className={`timeline-type ${entry.record_type}`}>{RECORD_TYPES.find(([value]) => value === entry.record_type)?.[1] || entry.record_type}</span>
          <h4>{entry.title}</h4><p>{entry.content || '无详细说明'}</p>
          <button className="text-button" onClick={() => setEntryForm({ ...entry, occurred_at: toBeijingInputValue(entry.occurred_at) })}>编辑</button>
          <button className="text-button danger" onClick={() => setConfirmAction({ type: 'delete-entry', entry })}>删除</button>
        </div>
      </article>)}
      {!entries.length && <div className="empty-state-small">暂无病例记录</div>}
    </div>

    {entryForm && <div className="modal-overlay"><form className="modal patient-form" onSubmit={saveEntry}>
      <div className="modal-header"><h3>{entryForm.id ? '编辑记录' : '添加病例记录'}</h3><button type="button" className="text-button" onClick={() => setEntryForm(null)}>关闭</button></div>
      <select value={entryForm.record_type} onChange={event => setEntryForm({ ...entryForm, record_type: event.target.value })}>{RECORD_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
      <label>发生时间（北京时间）<input type="datetime-local" required value={entryForm.occurred_at} onChange={event => setEntryForm({ ...entryForm, occurred_at: event.target.value })} /></label>
      <input required placeholder="记录标题 *" value={entryForm.title} onChange={event => setEntryForm({ ...entryForm, title: event.target.value })} />
      <textarea placeholder="情况与详情" value={entryForm.content || ''} onChange={event => setEntryForm({ ...entryForm, content: event.target.value })} />
      <button className="btn-primary">保存记录</button>
    </form></div>}

    {editForm && <div className="modal-overlay"><form className="modal patient-form" onSubmit={savePatient}>
      <div className="modal-header"><h3>编辑病人信息</h3><button type="button" className="text-button" onClick={() => setEditForm(null)}>关闭</button></div>
      <input required placeholder="姓名" value={editForm.name} onChange={event => setEditForm({ ...editForm, name: event.target.value })} />
      <select value={editForm.gender || ''} onChange={event => setEditForm({ ...editForm, gender: event.target.value })}><option value="">性别（可选）</option><option value="男">男</option><option value="女">女</option><option value="其他">其他</option></select>
      <label>出生日期<input type="date" value={editForm.birth_date} onChange={event => setEditForm({ ...editForm, birth_date: event.target.value })} /></label>
      <input placeholder="联系电话" value={editForm.phone || ''} onChange={event => setEditForm({ ...editForm, phone: event.target.value })} />
      <textarea placeholder="过敏史" value={editForm.allergies || ''} onChange={event => setEditForm({ ...editForm, allergies: event.target.value })} />
      <textarea placeholder="既往史" value={editForm.medical_history || ''} onChange={event => setEditForm({ ...editForm, medical_history: event.target.value })} />
      <textarea placeholder="备注" value={editForm.notes || ''} onChange={event => setEditForm({ ...editForm, notes: event.target.value })} />
      <div className="group-checks">{groups.map(group => <label key={group.id}><input type="radio" name="patient-group" checked={editForm.group_ids.includes(group.id)} onChange={() => setEditForm({ ...editForm, group_ids: [group.id] })} />{group.name}</label>)}{editForm.group_ids.length > 0 && <button type="button" className="text-button" onClick={() => setEditForm({ ...editForm, group_ids: [] })}>设为未分组</button>}</div>
      <button className="btn-primary">保存修改</button>
    </form></div>}

    {confirmAction && <div className="modal-overlay"><div className="modal confirm-modal">
      <h3>{confirmAction.type === 'archive' ? '归档病人' : '删除病例记录'}</h3>
      <p>{confirmAction.type === 'archive' ? '归档后可在归档列表中恢复，或选择彻底删除。' : `确定删除“${confirmAction.entry.title}”吗？此操作不可恢复。`}</p>
      <div className="modal-actions"><button className="btn-secondary" onClick={() => setConfirmAction(null)}>取消</button><button className="btn-primary danger" onClick={executeConfirm}>确认</button></div>
    </div></div>}
  </div>
}
