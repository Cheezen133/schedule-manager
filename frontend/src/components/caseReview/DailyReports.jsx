import { useCallback, useEffect, useMemo, useState } from 'react'
import { addDailyReportFiles, createDailyReport, dailyReportFileUrl, deleteDailyReport, deleteDailyReportFile, listDailyReports, updateDailyReport } from '../../api/caseReview'
import { downloadAuthorizedFile, getAuthorizedFileBlob } from '../../api/files'
import { formatBeijingTime } from '../../utils/dateTime'
import { ConfirmDialog, notify } from '../common/Ui'
import { beijingToday, errorText, formatSize, progressText } from './common'

const PAGE_SIZE = 30
const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
const isImage = file => (file.content_type || '').startsWith('image/')

// 时间轴上每天的标题：9月25日 周四，今天／昨天另外标出
function dayTitle(day) {
  const [year, month, date] = day.split('-').map(Number)
  const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, date)).getUTCDay()]
  const today = beijingToday()
  const yesterday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date(Date.now() - 86400000))
  const tag = day === today ? '今天' : day === yesterday ? '昨天' : ''
  const currentYear = Number(today.slice(0, 4))
  return { label: `${year === currentYear ? '' : `${year}年`}${month}月${date}日 ${weekday}`, tag }
}

// 需要登录才能取的图片：取回后转成本地地址显示
function AuthImage({ file, onOpen }) {
  const [src, setSrc] = useState('')
  useEffect(() => {
    let url = ''
    let cancelled = false
    getAuthorizedFileBlob(dailyReportFileUrl(file.id), { timeout: 0 }).then(blob => {
      if (cancelled) return
      url = URL.createObjectURL(blob)
      setSrc(url)
    }).catch(() => {})
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url) }
  }, [file.id])
  return <button type="button" className="cr-report-image" onClick={() => src && onOpen(src)} aria-label={`查看图片 ${file.name}`}>{src ? <img src={src} alt={file.name} /> : <span />}</button>
}

function ReportForm({ projectId, report, onClose, onSaved }) {
  const [reportDate, setReportDate] = useState(report?.report_date || beijingToday())
  const [content, setContent] = useState(report?.content || '')
  const [files, setFiles] = useState([])
  const [saving, setSaving] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  const submit = async event => {
    event.preventDefault()
    setSaving(true); setError('')
    const onProgress = progressEvent => setProgress(progressText(progressEvent))
    try {
      if (report) {
        await updateDailyReport(report.id, { report_date: reportDate, content: content.trim() || null })
        if (files.length) await addDailyReportFiles(report.id, files, onProgress)
      } else {
        await createDailyReport(projectId, { reportDate, content: content.trim(), files }, onProgress)
      }
      onSaved()
    } catch (err) {
      setError(errorText(err))
      setSaving(false)
    }
  }
  const empty = !content.trim() && !files.length && !(report?.files?.length)
  return <div className="modal-overlay">
    <form className="modal cr-modal" onSubmit={submit}>
      <div className="modal-header"><h3>{report ? '修改汇报' : '写汇报'}</h3><button type="button" className="text-button" onClick={onClose}>关闭</button></div>
      {error && <div className="error-message">{error}</div>}
      <label className="cr-field"><span>日期</span><input type="date" required value={reportDate} onChange={event => setReportDate(event.target.value)} /></label>
      <label className="cr-field"><span>内容</span><textarea autoFocus rows={5} maxLength={10000} value={content} onChange={event => setContent(event.target.value)} placeholder="今天纳入的患者、进展或问题" /></label>
      <label className="cr-field"><span>{report ? '追加图片或文件' : '图片或文件（可多选）'}</span><input type="file" multiple accept="image/*,*/*" onChange={event => setFiles(Array.from(event.target.files || []))} /></label>
      <div className="modal-actions">
        {saving && progress && <span className="cr-progress">上传中 {progress}</span>}
        <button type="button" className="btn-secondary" onClick={onClose}>取消</button>
        <button className="btn-primary" disabled={saving || empty}>{saving ? '保存中…' : '发布'}</button>
      </div>
    </form>
  </div>
}

// 每日汇报：按日期倒序排成时间轴。composerOpen 由父组件控制（手机上点导航栏「＋」打开）
export default function DailyReports({ projectId, canWrite, composerOpen, onComposerClose }) {
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [lightbox, setLightbox] = useState('')

  const load = useCallback(async (count = PAGE_SIZE) => {
    setLoading(true); setError('')
    try {
      const result = await listDailyReports(projectId, { offset: 0, limit: Math.min(100, Math.max(PAGE_SIZE, count)) })
      setItems(result.items)
      setTotal(result.total)
    } catch (err) {
      setError(errorText(err, '汇报加载失败'))
    } finally {
      setLoading(false)
    }
  }, [projectId])
  useEffect(() => { load() }, [load])

  const loadMore = async () => {
    try {
      const result = await listDailyReports(projectId, { offset: items.length, limit: PAGE_SIZE })
      setItems(previous => [...previous, ...result.items])
      setTotal(result.total)
    } catch (err) {
      notify(errorText(err, '加载失败'))
    }
  }

  const groups = useMemo(() => {
    const list = []
    items.forEach(item => {
      const last = list[list.length - 1]
      if (last?.day === item.report_date) last.items.push(item)
      else list.push({ day: item.report_date, items: [item] })
    })
    return list
  }, [items])

  const runConfirm = async () => {
    const target = confirm
    setConfirm(null)
    try {
      if (target.type === 'report') await deleteDailyReport(target.report.id)
      else await deleteDailyReportFile(target.file.id)
      await load(items.length)
    } catch (err) {
      notify(errorText(err, '删除失败'))
    }
  }
  const download = file => downloadAuthorizedFile(dailyReportFileUrl(file.id), file.name, { timeout: 0 }).catch(err => notify(errorText(err, '下载失败')))
  const closeForm = () => { setEditing(null); onComposerClose() }
  const afterSave = () => { closeForm(); load(items.length + 1) }

  return <div className="cr-reports">
    <div className="cr-reports-head"><p className="cr-muted">每天记录纳入的患者和进展，可附图片或文件。</p>{canWrite && <button type="button" className="btn-primary cr-desktop-only" onClick={() => setEditing('new')}>写汇报</button>}</div>
    {error && <div className="error-message">{error}</div>}
    {!loading && !items.length && !error && <div className="empty-state-small">还没有汇报</div>}
    <div className="cr-timeline">
      {groups.map(group => {
        const title = dayTitle(group.day)
        return <section className="cr-timeline-day" key={group.day}>
          <h3 className="cr-timeline-date">{title.label}{title.tag && <span className="cr-day-tag">{title.tag}</span>}</h3>
          {group.items.map(report => {
            const images = report.files.filter(isImage)
            const others = report.files.filter(file => !isImage(file))
            return <article className="cr-report" key={report.id}>
              <div className="cr-report-meta"><strong>{report.author?.nickname}</strong><span>{formatBeijingTime(report.created_at)}</span>
                {report.can_edit && <span className="cr-report-actions"><button type="button" className="text-button" onClick={() => setEditing(report)}>修改</button><button type="button" className="text-button cr-danger" onClick={() => setConfirm({ type: 'report', report })}>删除</button></span>}
              </div>
              {report.content && <p className="cr-report-text">{report.content}</p>}
              {images.length > 0 && <div className="cr-report-images">{images.map(file => <div className="cr-report-image-wrap" key={file.id}><AuthImage file={file} onOpen={setLightbox} />{report.can_edit && <button type="button" className="cr-file-remove" aria-label={`删除 ${file.name}`} onClick={() => setConfirm({ type: 'file', file })}>×</button>}</div>)}</div>}
              {others.length > 0 && <ul className="cr-report-files">{others.map(file => <li key={file.id}><button type="button" className="cr-file-chip" onClick={() => download(file)}>📎 {file.name}<small>{formatSize(file.file_size)}</small></button>{report.can_edit && <button type="button" className="cr-file-remove" aria-label={`删除 ${file.name}`} onClick={() => setConfirm({ type: 'file', file })}>×</button>}</li>)}</ul>}
            </article>
          })}
        </section>
      })}
    </div>
    {items.length < total && <button type="button" className="btn-secondary cr-load-more" onClick={loadMore}>加载更早的汇报</button>}
    {(editing || composerOpen) && <ReportForm projectId={projectId} report={editing && editing !== 'new' ? editing : null} onClose={closeForm} onSaved={afterSave} />}
    <ConfirmDialog open={Boolean(confirm)} danger title={confirm?.type === 'report' ? '删除汇报' : '删除附件'} message={confirm?.type === 'report' ? '汇报和它的图片、文件都会删除，无法恢复。' : `删除「${confirm?.file?.name}」？`} confirmText="删除" onConfirm={runConfirm} onCancel={() => setConfirm(null)} />
    {lightbox && <div className="cr-lightbox" onClick={() => setLightbox('')} role="presentation"><img src={lightbox} alt="汇报图片" /></div>}
  </div>
}
