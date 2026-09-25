import { useEffect, useRef, useState } from 'react'
import { saveReviewConclusion } from '../../api/caseReview'
import { formatBeijingDateTime } from '../../utils/dateTime'
import { DECISION_OPTIONS, errorText } from './common'
import { VoicePlayer } from './Voice'

function ConclusionView({ conclusion, label = '结论' }) {
  return <div className="cr-conclusion-view">
    <div className="cr-conclusion-line"><span>{label}</span><strong className={`cr-decision cr-decision-${conclusion.decision}`}>{conclusion.decision_label}</strong></div>
    {conclusion.diagnosis && <div className="cr-conclusion-line"><span>病因诊断</span><p>{conclusion.diagnosis}</p></div>}
    {conclusion.comment && <div className="cr-conclusion-line"><span>审阅意见</span><p>{conclusion.comment}</p></div>}
    <small>{conclusion.reviewer?.nickname} · {formatBeijingDateTime(conclusion.updated_at)}</small>
  </div>
}

// 结论：病历状态取最新一份结论。有「下结论」权限的人看到自己的结论表单；每个人给过的结论都能在历史里看到
export function ConclusionPanel({ reviewCase, currentUserId, onSaved }) {
  const mine = reviewCase.conclusions.find(item => item.reviewer?.id === currentUserId)
  const [decision, setDecision] = useState(mine?.decision || '')
  const [diagnosis, setDiagnosis] = useState(mine?.diagnosis || '')
  const [comment, setComment] = useState(mine?.comment || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const latest = reviewCase.conclusion
  const history = reviewCase.conclusions.length > 1 || (latest && reviewCase.can_conclude && latest.reviewer?.id !== currentUserId)
  const current = latest
    ? <ConclusionView conclusion={latest} label="当前结论" />
    : <p className="cr-muted">{reviewCase.reviewer ? `等待 ${reviewCase.reviewer.nickname} 审阅` : '还没有人下结论'}</p>
  const historyList = history && <details className="cr-other-conclusions"><summary>全部结论记录（{reviewCase.conclusions.length}）</summary>{reviewCase.conclusions.map(item => <ConclusionView key={item.id} conclusion={item} />)}</details>

  if (!reviewCase.can_conclude) return <div className="cr-conclusion">{current}{historyList}</div>

  const submit = async event => {
    event.preventDefault()
    setSaving(true); setError(''); setSaved(false)
    try {
      await saveReviewConclusion(reviewCase.id, { decision, diagnosis: diagnosis.trim() || null, comment: comment.trim() || null })
      setSaved(true)
      onSaved()
    } catch (err) {
      setError(errorText(err))
    } finally {
      setSaving(false)
    }
  }
  return <form className="cr-conclusion cr-conclusion-form" onSubmit={submit}>
    {latest && latest.reviewer?.id !== currentUserId && current}
    {error && <div className="error-message">{error}</div>}
    <div className="cr-field"><span>{mine ? '我的结论' : '是否纳入'}</span><div className="cr-segmented" role="radiogroup" aria-label="是否纳入">
      {DECISION_OPTIONS.map(([value, label]) => <button type="button" key={value} role="radio" aria-checked={decision === value} className={decision === value ? `is-active cr-decision-${value}` : ''} onClick={() => setDecision(value)}>{label}</button>)}
    </div></div>
    <label className="cr-field"><span>病因诊断</span><textarea rows={2} maxLength={2000} value={diagnosis} onChange={event => setDiagnosis(event.target.value)} placeholder="最终病因诊断" /></label>
    <label className="cr-field"><span>审阅意见</span><textarea rows={3} maxLength={5000} value={comment} onChange={event => setComment(event.target.value)} placeholder="不纳入或待定的原因、需要补充的材料等" /></label>
    <div className="cr-conclusion-actions">
      {mine && <small>上次保存 {formatBeijingDateTime(mine.updated_at)}</small>}
      {saved && <small className="cr-saved">已保存</small>}
      <button className="btn-primary" disabled={saving || !decision}>{saving ? '保存中…' : mine ? '更新结论' : '提交结论'}</button>
    </div>
    {historyList}
  </form>
}

// 批注列表：编号与 PDF 上的标记一致，点一条就跳到它的位置；语音批注带播放按钮
export function AnnotationList({ notes, selectedId, onSelect, onEdit, onDelete }) {
  const listRef = useRef(null)
  useEffect(() => {
    if (selectedId) listRef.current?.querySelector(`[data-note="${selectedId}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [selectedId])
  if (!notes.length) return <p className="cr-muted cr-empty-notes">还没有批注。用工具栏的「点注」或「框选」在病历上标记。</p>
  return <ol className="cr-note-list" ref={listRef}>
    {notes.map((note, index) => <li key={note.id} data-note={note.id} className={note.id === selectedId ? 'is-selected' : ''}>
      <button type="button" className="cr-note-item" onClick={() => onSelect(note.id)}>
        <span className="cr-note-number">{index + 1}</span>
        <span className="cr-note-body"><span className="cr-note-meta">第 {note.page} 页 · {note.author?.nickname} · {formatBeijingDateTime(note.created_at, { includeYear: false })}</span>{note.content && <span className="cr-note-text">{note.content}</span>}</span>
      </button>
      {(note.has_audio || note.can_edit) && <div className="cr-note-footer">
        {note.has_audio && <VoicePlayer annotationId={note.id} duration={note.audio_duration} />}
        {note.can_edit && <span className="cr-note-actions"><button type="button" className="text-button" onClick={() => onEdit(note)}>修改</button><button type="button" className="text-button cr-danger" onClick={() => onDelete(note)}>删除</button></span>}
      </div>}
    </li>)}
  </ol>
}
