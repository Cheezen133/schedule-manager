import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { caseFileUrl, createAnnotation, createVoiceAnnotation, deleteAnnotation, deleteCaseFile, deleteReviewCase, getReviewCase, getReviewProject, listAnnotations, updateAnnotation, uploadCaseFiles } from '../api/caseReview'
import { downloadAuthorizedFile } from '../api/files'
import PdfViewer from '../components/caseReview/PdfViewer'
import { AnnotationList, ConclusionPanel } from '../components/caseReview/CasePanels'
import { AnnotationEditor, CaseFormModal } from '../components/caseReview/Forms'
import { VoicePlayer } from '../components/caseReview/Voice'
import { StatusPill, errorText, formatSize, progressText } from '../components/caseReview/common'
import { ConfirmDialog, notify } from '../components/common/Ui'
import { BackButton } from '../components/memo/MemoNav'
import MobileActionSheet from '../components/mobile/MobileActionSheet'
import { useMobileNav } from '../components/mobile/MobileNavBar'
import { useAuth } from '../contexts/AuthContext'
import useIsMobile from '../hooks/useIsMobile'
import { formatBeijingDateTime } from '../utils/dateTime'

// 病历页。正在看的 PDF 记在网址 ?file= 里：手机上它决定是否全屏打开阅读器，返回手势即可关闭
export default function CaseReviewCasePage() {
  const { projectId, caseId } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const { user } = useAuth()
  const [reviewCase, setReviewCase] = useState(null)
  const [members, setMembers] = useState([])
  const [reviewerRoleIds, setReviewerRoleIds] = useState([])
  const [error, setError] = useState('')
  const [notes, setNotes] = useState([])
  const [mode, setMode] = useState('view')
  const [draft, setDraft] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [focusRequest, setFocusRequest] = useState(null)
  const [editingNote, setEditingNote] = useState(null)
  const [editingCase, setEditingCase] = useState(false)
  const [confirm, setConfirm] = useState(null)
  const [sheet, setSheet] = useState(null)
  const [fileMenu, setFileMenu] = useState(null) // 手机上文件的「···」菜单
  const [uploadProgress, setUploadProgress] = useState('')

  const loadCase = useCallback(() => getReviewCase(caseId).then(setReviewCase).catch(err => setError(errorText(err, '病历不存在，或你不是项目成员'))), [caseId])
  useEffect(() => { loadCase() }, [loadCase])
  // 编辑病历时可指派的审阅人：有「下结论」权限的成员；身份里有「审阅人」的成员，批注换一种标记形状
  useEffect(() => {
    getReviewProject(projectId).then(project => {
      setMembers(project.members.filter(member => member.permissions.includes('conclude')))
      setReviewerRoleIds(project.members.filter(member => member.roles.includes('reviewer')).map(member => member.id))
    }).catch(() => {})
  }, [projectId])

  const files = reviewCase?.files || []
  const fileParam = searchParams.get('file')
  const activeFile = files.find(file => String(file.id) === fileParam) || (isMobile ? null : files[0]) || null
  const activeFileId = activeFile?.id

  const loadNotes = useCallback(() => (activeFileId ? listAnnotations(activeFileId).then(setNotes).catch(() => setNotes([])) : Promise.resolve(setNotes([]))), [activeFileId])
  useEffect(() => {
    setSelectedId(null); setDraft(null); setMode('view')
    loadNotes()
  }, [loadNotes])
  // 审阅人的批注：作者身份里有「审阅人」，或是这份病历指派的审阅人
  const assignedReviewerId = reviewCase?.reviewer?.id
  const markedNotes = useMemo(() => {
    const ids = new Set(reviewerRoleIds)
    if (assignedReviewerId) ids.add(assignedReviewerId)
    return notes.map(note => ({ ...note, byReviewer: ids.has(note.author?.id) }))
  }, [notes, reviewerRoleIds, assignedReviewerId])

  useMobileNav({ title: reviewCase ? `病历 ${reviewCase.code}` : '病历', rightLabel: reviewCase?.can_edit ? '编辑' : null, onRight: () => setEditingCase(true) })

  const openFile = id => setSearchParams({ file: String(id) }, { replace: !isMobile })
  const closeViewer = () => {
    if (window.history.state?.idx > 0) navigate(-1)
    else setSearchParams({}, { replace: true })
  }
  const focusNote = id => {
    setSelectedId(id)
    setFocusRequest({ id, nonce: Date.now() })
  }
  // 有录音就走语音批注接口（文字可空），否则只存文字
  const saveDraft = async (content, voice) => {
    const note = voice
      ? await createVoiceAnnotation(activeFileId, { ...draft, content, duration: voice.duration }, voice.blob, voice.filename)
      : await createAnnotation(activeFileId, { ...draft, content })
    setDraft(null); setMode('view')
    await loadNotes()
    setSelectedId(note.id)
    loadCase()
  }
  const saveEditedNote = async content => {
    await updateAnnotation(editingNote.id, content)
    setEditingNote(null)
    loadNotes()
  }
  const uploadFiles = async event => {
    const chosen = Array.from(event.target.files || [])
    event.target.value = ''
    if (!chosen.length) return
    setUploadProgress('0%')
    try {
      await uploadCaseFiles(reviewCase.id, chosen, progressEvent => setUploadProgress(progressText(progressEvent) || '…'))
      await loadCase()
      notify(`已上传 ${chosen.length} 份 PDF`, 'success')
    } catch (err) {
      notify(errorText(err, '上传失败'))
    } finally {
      setUploadProgress('')
    }
  }
  const download = file => downloadAuthorizedFile(caseFileUrl(file.id), file.name, { timeout: 0 }).catch(err => notify(errorText(err, '下载失败')))
  const runConfirm = async () => {
    const target = confirm
    setConfirm(null)
    try {
      if (target.type === 'case') {
        await deleteReviewCase(reviewCase.id)
        navigate(`/case-review/${projectId}`, { replace: true })
      } else if (target.type === 'file') {
        await deleteCaseFile(target.file.id)
        if (String(target.file.id) === fileParam) setSearchParams({}, { replace: true })
        await loadCase()
      } else {
        await deleteAnnotation(target.note.id)
        setSelectedId(null)
        await loadNotes()
        loadCase()
      }
    } catch (err) {
      notify(errorText(err, '删除失败'))
    }
  }

  if (error) return <div className="memo-page"><BackButton fallback={`/case-review/${projectId}`} /><div className="error-message">{error}</div></div>
  if (!reviewCase) return <div className="memo-page"><div className="cr-muted">加载中…</div></div>

  const selectedNote = markedNotes.find(note => note.id === selectedId)
  const canDeleteFile = file => reviewCase.can_manage_project || file.uploaded_by?.id === user?.id
  const toggleMode = next => setMode(mode === next ? 'view' : next)
  const modeButtons = reviewCase.can_annotate && <div className="cr-toolbar-group cr-mode-buttons">
    <button type="button" className={mode === 'point' ? 'is-active' : ''} aria-pressed={mode === 'point'} onClick={() => toggleMode('point')}>点注</button>
    <button type="button" className={mode === 'rect' ? 'is-active' : ''} aria-pressed={mode === 'rect'} onClick={() => toggleMode('rect')}>框选</button>
  </div>
  const toolbarExtra = isMobile ? <>{modeButtons}<div className="cr-toolbar-group"><button type="button" onClick={() => setSheet('notes')}>批注 {notes.length}</button><button type="button" onClick={() => setSheet('conclusion')}>结论</button></div></> : modeButtons
  const viewer = activeFile && <PdfViewer key={activeFile.id} fileId={activeFile.id} notes={markedNotes} mode={mode} selectedId={selectedId} focusRequest={focusRequest} draft={draft} onSelect={setSelectedId} onDraft={setDraft} toolbarExtra={toolbarExtra} />
  const conclusion = <ConclusionPanel key={`${reviewCase.id}-${reviewCase.reviewer?.id}`} reviewCase={reviewCase} currentUserId={user?.id} onSaved={loadCase} />
  const noteList = <AnnotationList notes={markedNotes} selectedId={selectedId} onSelect={id => { setSheet(null); focusNote(id) }} onEdit={note => { setSheet(null); setEditingNote(note) }} onDelete={note => { setSheet(null); setConfirm({ type: 'note', note }) }} />
  const uploadButton = reviewCase.can_upload && <label className={`btn-secondary cr-upload${uploadProgress ? ' is-busy' : ''}`}>{uploadProgress ? `上传中 ${uploadProgress}` : '上传 PDF'}<input type="file" accept="application/pdf,.pdf" multiple hidden disabled={Boolean(uploadProgress)} onChange={uploadFiles} /></label>
  const info = <dl className="cr-case-info">
    <div><dt>编号</dt><dd>{reviewCase.code}</dd></div>
    {reviewCase.title && <div><dt>标题</dt><dd>{reviewCase.title}</dd></div>}
    <div><dt>审阅人</dt><dd>{reviewCase.reviewer?.nickname || '未指派'}</dd></div>
    <div><dt>状态</dt><dd><StatusPill status={reviewCase.status} label={reviewCase.status_label} /></dd></div>
    <div><dt>创建</dt><dd>{reviewCase.created_by?.nickname} · {formatBeijingDateTime(reviewCase.created_at)}</dd></div>
    {reviewCase.note && <div className="cr-info-note"><dt>备注</dt><dd>{reviewCase.note}</dd></div>}
  </dl>
  const fileList = <ul className="cr-file-list">
    {files.map(file => <li key={file.id} className={!isMobile && file.id === activeFileId ? 'is-active' : ''}>
      <button type="button" className="cr-file-open" onClick={() => openFile(file.id)}>
        <span className="cr-file-icon">PDF</span>
        <span className="cr-file-name"><span className="cr-file-title" title={file.name}>{file.name}</span><small>{formatSize(file.file_size)} · 批注 {file.annotation_count} · {file.uploaded_by?.nickname}</small></span>
      </button>
      {isMobile
        ? <button type="button" className="text-button cr-file-more" aria-label={`${file.name} 的操作`} onClick={() => setFileMenu(file)}>···</button>
        : <span className="cr-file-actions"><button type="button" className="text-button" onClick={() => download(file)}>下载</button>{canDeleteFile(file) && <button type="button" className="text-button cr-danger" onClick={() => setConfirm({ type: 'file', file })}>删除</button>}</span>}
    </li>)}
    {!files.length && <li className="cr-muted">还没有上传病历 PDF</li>}
  </ul>
  const dialogs = <>
    {draft && <AnnotationEditor draft={draft} onCancel={() => setDraft(null)} onSave={saveDraft} />}
    {editingNote && <AnnotationEditor initialContent={editingNote.content} allowEmpty={editingNote.has_audio} onCancel={() => setEditingNote(null)} onSave={saveEditedNote} />}
    {editingCase && <CaseFormModal projectId={Number(projectId)} members={members} reviewCase={reviewCase} onClose={() => setEditingCase(false)} onSaved={() => { setEditingCase(false); loadCase() }} />}
    <ConfirmDialog open={Boolean(confirm)} danger confirmText="删除" onConfirm={runConfirm} onCancel={() => setConfirm(null)}
      title={confirm?.type === 'case' ? '删除病历' : confirm?.type === 'file' ? '删除 PDF' : '删除批注'}
      message={confirm?.type === 'case' ? `病历 ${reviewCase.code} 的全部 PDF、批注和结论都会删除，无法恢复。` : confirm?.type === 'file' ? `删除「${confirm.file.name}」及其上的批注？` : '删除这条批注？'} />
  </>

  if (isMobile) return <div className="cr-case-page cr-case-mobile">
    <h3 className="cr-section-title">病历信息</h3>
    <section className="cr-panel">{info}</section>
    <h3 className="cr-section-title">审阅结论</h3>
    <section className="cr-panel">{conclusion}</section>
    <div className="cr-section-head"><h3 className="cr-section-title">病历 PDF</h3>{uploadButton}</div>
    <section className="cr-panel">{fileList}</section>
    {reviewCase.can_edit && <button type="button" className="cr-delete-case" onClick={() => setConfirm({ type: 'case' })}>删除病历</button>}
    {activeFile && <div className="cr-viewer-full">
      <div className="cr-viewer-top"><button type="button" onClick={closeViewer}>关闭</button><span>{activeFile.name}</span><span className="cr-viewer-top-spacer" /></div>
      {viewer}
      {selectedNote && <div className="cr-note-card">
        <div className="cr-note-meta">第 {selectedNote.page} 页 · {selectedNote.author?.nickname}{selectedNote.byReviewer && <> <span className="cr-tag is-reviewer">审阅人</span></>}</div>
        {selectedNote.content && <p>{selectedNote.content}</p>}
        {selectedNote.has_audio && <VoicePlayer key={selectedNote.id} annotationId={selectedNote.id} duration={selectedNote.audio_duration} />}
        <div className="cr-note-card-actions">{selectedNote.can_edit && <><button type="button" className="text-button" onClick={() => setEditingNote(selectedNote)}>修改</button><button type="button" className="text-button cr-danger" onClick={() => setConfirm({ type: 'note', note: selectedNote })}>删除</button></>}<button type="button" className="text-button" onClick={() => setSelectedId(null)}>收起</button></div>
      </div>}
    </div>}
    {fileMenu && <MobileActionSheet title={fileMenu.name} onClose={() => setFileMenu(null)} actions={[
      { label: '下载', onClick: () => download(fileMenu) },
      ...(canDeleteFile(fileMenu) ? [{ label: '删除', danger: true, onClick: () => setConfirm({ type: 'file', file: fileMenu }) }] : []),
    ]} />}
    {sheet && <div className="modal-overlay"><div className="modal cr-modal">
      <div className="modal-header"><h3>{sheet === 'notes' ? `批注（${notes.length}）` : '审阅结论'}</h3><button type="button" className="text-button" onClick={() => setSheet(null)}>完成</button></div>
      {sheet === 'notes' ? noteList : conclusion}
    </div></div>}
    {dialogs}
  </div>

  return <div className="memo-page cr-case-page">
    <BackButton fallback={`/case-review/${projectId}`} />
    <div className="memo-header"><div><h2>病历 {reviewCase.code}{reviewCase.title ? ` · ${reviewCase.title}` : ''}</h2><p>{reviewCase.project.name}</p></div>
      {reviewCase.can_edit && <div className="cr-header-actions"><button type="button" className="btn-secondary" onClick={() => setEditingCase(true)}>编辑</button><button type="button" className="btn-secondary cr-danger" onClick={() => setConfirm({ type: 'case' })}>删除病历</button></div>}
    </div>
    <div className="cr-case-body">
      <section className="cr-viewer-pane">
        {files.length > 1 && <div className="cr-file-tabs">{files.map(file => <button type="button" key={file.id} className={file.id === activeFileId ? 'is-active' : ''} onClick={() => openFile(file.id)}>{file.name}</button>)}</div>}
        {viewer || <div className="empty-state cr-empty">还没有上传病历 PDF。{uploadButton}</div>}
      </section>
      <aside className="cr-side">
        <section className="cr-panel"><h3>审阅结论</h3>{conclusion}</section>
        <section className="cr-panel"><h3>批注 <small>{notes.length}</small></h3>{noteList}</section>
        <section className="cr-panel"><h3>病历信息</h3>{info}</section>
        <section className="cr-panel"><div className="cr-section-head"><h3>病历 PDF</h3>{uploadButton}</div>{fileList}</section>
      </aside>
    </div>
    {dialogs}
  </div>
}
