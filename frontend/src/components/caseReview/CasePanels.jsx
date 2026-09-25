import { useEffect, useRef, useState } from 'react'
import { saveReviewConclusion } from '../../api/caseReview'
import { formatBeijingDateTime } from '../../utils/dateTime'
import { DECISION_OPTIONS, errorText } from './common'

function ConclusionView({ conclusion }) {
  return <div className="cr-conclusion-view">
    <div className="cr-conclusion-line"><span>结论</span><strong className={`cr-decision cr-decision-${conclusion.decision}`}>{conclusion.decision_label}</strong></div>
    {conclusion.diagnosis && <div className="cr-conclusion-line"><span>病因诊断</span><p>{conclusion.diagnosis}</p></div>}
    {conclusion.comment && <div className="cr-conclusion-line"><span>审阅意见</span><p>{conclusion.comment}</p></div>}
    <small>{conclusion.reviewer?.nickname} · {formatBeijingDateTime(conclusion.updated_at)}</small>
  </div>
}

// 结论：被指派的审阅人看到表单，其他人只能看
export function ConclusionPanel({ reviewCase, currentUserId, onSaved }) {
  const mine = reviewCase.conclusions.find(item => item.reviewer?.id === currentUserId)
  const [decision, setDecision] = useState(mine?.decision || '')
  const [diagnosis, setDiagnosis] = useState(mine?.diagnosis || '')
  const [comment, setComment] = useState(mine?.comment || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const others = reviewCase.conclusions.filter(item => item.reviewer?.id !== reviewCase.reviewer?.id)

  if (!reviewCase.can_conclude) {
    return <div className="cr-conclusion">
      {reviewCase.conclusion ? <ConclusionView conclusion={reviewCase.conclusion} />
        : <p className="cr-muted">{reviewCase.reviewer ? `等待 ${reviewCase.reviewer.nickname} 审阅` : '尚未指派审阅人'}</p>}
      {others.length > 0 && <details className="cr-other-conclusions"><summary>其他审阅人的结论（{others.length}）</summary>{others.map(item => <ConclusionView key={item.id} conclusion={item} />)}</details>}
    </div>
  }

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
    {error && <div className="error-message">{error}</div>}
    <div className="cr-field"><span>是否纳入</span><div className="cr-segmented" role="radiogroup" aria-label="是否纳入">
      {DECISION_OPTIONS.map(([value, label]) => <button type="button" key={value} role="radio" aria-checked={decision === value} className={decision === value ? `is-active cr-decision-${value}` : ''} onClick={() => setDecision(value)}>{label}</button>)}
    </div></div>
    <label className="cr-field"><span>病因诊断</span><textarea rows={2} maxLength={2000} value={diagnosis} onChange={event => setDiagnosis(event.target.value)} placeholder="最终病因诊断" /></label>
    <label className="cr-field"><span>审阅意见</span><textarea rows={3} maxLength={5000} value={comment} onChange={event => setComment(event.target.value)} placeholder="不纳入或待定的原因、需要补充的材料等" /></label>
    <div className="cr-conclusion-actions">
      {mine && <small>上次保存 {formatBeijingDateTime(mine.updated_at)}</small>}
      {saved && <small className="cr-saved">已保存</small>}
      <button className="btn-primary" disabled={saving || !decision}>{saving ? '保存中…' : mine ? '更新结论' : '提交结论'}</button>
    </div>
  </form>
}

// 批注列表：编号与 PDF 上的标记一致，点一条就跳到它的位置
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
        <span className="cr-note-body"><span className="cr-note-meta">第 {note.page} 页 · {note.author?.nickname} · {formatBeijingDateTime(note.created_at, { includeYear: false })}</span><span className="cr-note-text">{note.content}</span></span>
      </button>
      {note.can_edit && <span className="cr-note-actions"><button type="button" className="text-button" onClick={() => onEdit(note)}>修改</button><button type="button" className="text-button cr-danger" onClick={() => onDelete(note)}>删除</button></span>}
    </li>)}
  </ol>
}
