import { useRef, useState } from 'react'
import { createReviewCase, createReviewProject, updateReviewCase, updateReviewProject, uploadCaseFiles } from '../../api/caseReview'
import { errorText, progressText } from './common'
import { DictationButton, VoiceRecorder } from './Voice'

// 新建／编辑项目
export function ProjectFormModal({ project, onClose, onSaved }) {
  const [name, setName] = useState(project?.name || '')
  const [description, setDescription] = useState(project?.description || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const submit = async event => {
    event.preventDefault()
    setSaving(true); setError('')
    try {
      const values = { name: name.trim(), description: description.trim() || null }
      const result = project ? await updateReviewProject(project.id, values) : await createReviewProject(values)
      onSaved(project ? project.id : result.id)
    } catch (err) {
      setError(errorText(err))
      setSaving(false)
    }
  }
  return <div className="modal-overlay">
    <form className="modal cr-modal" onSubmit={submit}>
      <div className="modal-header"><h3>{project ? '编辑项目' : '新建项目'}</h3><button type="button" className="text-button" onClick={onClose}>关闭</button></div>
      {error && <div className="error-message">{error}</div>}
      <label className="cr-field"><span>项目名称</span><input autoFocus required maxLength={100} value={name} onChange={event => setName(event.target.value)} placeholder="例如：炎症升高患者病历审阅" /></label>
      <label className="cr-field"><span>说明（选填）</span><textarea rows={3} value={description} onChange={event => setDescription(event.target.value)} placeholder="审阅范围、要求等" /></label>
      <div className="modal-actions"><button type="button" className="btn-secondary" onClick={onClose}>取消</button><button className="btn-primary" disabled={saving || !name.trim()}>{saving ? '保存中…' : '保存'}</button></div>
    </form>
  </div>
}

// 新建／编辑病历；新建时可以顺便选好 PDF 一起上传
export function CaseFormModal({ projectId, members, reviewCase, onClose, onSaved }) {
  const editing = Boolean(reviewCase)
  const [values, setValues] = useState({ code: reviewCase?.code || '', title: reviewCase?.title || '', note: reviewCase?.note || '', reviewer_id: reviewCase?.reviewer?.id ?? '' })
  const [files, setFiles] = useState([])
  const [saving, setSaving] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  const createdId = useRef(null) // 病历已建好但上传失败时，重试只补传文件，不重复建病历
  const set = key => event => setValues(previous => ({ ...previous, [key]: event.target.value }))
  const submit = async event => {
    event.preventDefault()
    setSaving(true); setError(''); setProgress('')
    const payload = { code: values.code.trim(), title: values.title.trim() || null, note: values.note.trim() || null, reviewer_id: values.reviewer_id === '' ? null : Number(values.reviewer_id) }
    try {
      let caseId = reviewCase?.id || createdId.current
      if (editing) await updateReviewCase(caseId, payload)
      else if (!caseId) caseId = createdId.current = (await createReviewCase(projectId, payload)).id
      if (files.length) await uploadCaseFiles(caseId, files, progressEvent => setProgress(progressText(progressEvent)))
      onSaved(caseId)
    } catch (err) {
      setError(createdId.current ? `病历已建好，但 PDF 上传失败：${errorText(err)}。可以重试上传。` : errorText(err))
      setSaving(false)
    }
  }
  return <div className="modal-overlay">
    <form className="modal cr-modal" onSubmit={submit}>
      <div className="modal-header"><h3>{editing ? '编辑病历' : '新建病历'}</h3><button type="button" className="text-button" onClick={onClose}>关闭</button></div>
      {error && <div className="error-message">{error}</div>}
      <label className="cr-field"><span>编号</span><input autoFocus={!editing} required maxLength={50} value={values.code} onChange={set('code')} placeholder="例如研究编号 123" disabled={Boolean(createdId.current)} /></label>
      <label className="cr-field"><span>标题（选填）</span><input maxLength={200} value={values.title} onChange={set('title')} placeholder="例如：发热待查" disabled={Boolean(createdId.current)} /></label>
      <label className="cr-field"><span>审阅人</span><select value={values.reviewer_id} onChange={set('reviewer_id')} disabled={Boolean(createdId.current)}>
        <option value="">暂不指派</option>
        {members.map(member => <option key={member.id} value={member.id}>{member.nickname}{member.username ? `（@${member.username}）` : ''}</option>)}
      </select></label>
      <label className="cr-field"><span>备注（选填）</span><textarea rows={3} value={values.note} onChange={set('note')} placeholder="给审阅人的说明" disabled={Boolean(createdId.current)} /></label>
      {!editing && <label className="cr-field"><span>病历 PDF（选填，可多选）</span><input type="file" accept="application/pdf,.pdf" multiple onChange={event => setFiles(Array.from(event.target.files || []))} /></label>}
      <div className="modal-actions">
        {saving && progress && <span className="cr-progress">上传中 {progress}</span>}
        <button type="button" className="btn-secondary" onClick={onClose}>取消</button>
        <button className="btn-primary" disabled={saving || !values.code.trim()}>{saving ? '保存中…' : createdId.current ? '重试上传' : '保存'}</button>
      </div>
    </form>
  </div>
}

// 写批注：draft 是在 PDF 上点出或框出的位置。新批注可以附一段录音；allowEmpty 用于修改语音批注（文字可删空）
export function AnnotationEditor({ draft, initialContent = '', allowEmpty = false, onCancel, onSave }) {
  const [content, setContent] = useState(initialContent)
  const [voice, setVoice] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const submit = async event => {
    event.preventDefault()
    setSaving(true); setError('')
    try {
      await onSave(content.trim(), voice)
    } catch (err) {
      setError(errorText(err))
      setSaving(false)
    }
  }
  const canSave = Boolean(content.trim() || voice || allowEmpty)
  return <div className="modal-overlay">
    <form className="modal cr-modal" onSubmit={submit}>
      <div className="modal-header"><h3>{draft ? `第 ${draft.page} 页 · ${draft.kind === 'rect' ? '框选批注' : '点注'}` : '修改批注'}</h3><button type="button" className="text-button" onClick={onCancel}>取消</button></div>
      {error && <div className="error-message">{error}</div>}
      <textarea className="cr-note-input" autoFocus rows={4} maxLength={2000} value={content} onChange={event => setContent(event.target.value)} placeholder={draft ? '写下对这里的意见，也可以只录一段语音' : '写下对这里的意见'} />
      <div className="cr-voice-tools"><DictationButton onText={text => setContent(previous => previous ? `${previous}${text}` : text)} /></div>
      {draft && <VoiceRecorder value={voice} onChange={setVoice} />}
      <div className="modal-actions"><button type="button" className="btn-secondary" onClick={onCancel}>取消</button><button className="btn-primary" disabled={saving || !canSave}>{saving ? '保存中…' : '保存批注'}</button></div>
    </form>
  </div>
}
