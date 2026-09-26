import { useEffect, useMemo, useRef, useState } from 'react'
import { createReviewCase, getReviewCase, listReviewCases, uploadCaseFiles } from '../../api/caseReview'
import useIsMobile from '../../hooks/useIsMobile'
import { groupFiles } from './caseCodes'
import { errorText, formatSize } from './common'

const MAX_CODE = 50 // 与后端编号长度上限一致
const sizeOf = items => items.reduce((sum, item) => sum + item.file.size, 0)
const countOf = tasks => tasks.reduce((sum, task) => sum + task.items.length, 0)
// 上传名和原文件名不同（同名文件加了子文件夹前缀）时，换个名字再传，内容不复制
const asUpload = item => (item.name === item.file.name ? item.file : new File([item.file], item.name, { type: item.file.type || 'application/pdf', lastModified: item.file.lastModified }))

// 批量导入病历：电脑上可选整个文件夹（每个患者一个子文件夹，子文件夹名即编号），也可多选 PDF（按文件名开头的编号分组）；
// 手机上选不了文件夹，只能多选 PDF。先预览分组、可改编号，确认后逐个文件上传：编号已存在就追加到原病历，
// 病历里已有同名文件的跳过，所以中断后重新导入同一批不会重复
export default function BatchImportModal({ projectId, cases, reviewers, onClose, onImported }) {
  const isMobile = useIsMobile()
  const folderInput = useRef(null)
  const fileInput = useRef(null)
  const [rows, setRows] = useState(null) // null 表示还没选文件；每行 { key, code, items, include }
  const [ignored, setIgnored] = useState(0)
  const [reviewerId, setReviewerId] = useState('')
  const [running, setRunning] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [progress, setProgress] = useState(null)
  const [result, setResult] = useState(null)
  const stopRef = useRef(false)
  const caseIds = useRef(new Map(cases.map(item => [item.code, item.id]))) // 编号 → 病历 id，本次新建的也记进来
  const knownNames = useRef(new Map()) // 病历 id → 其中已有的文件名

  // 上传期间关闭或刷新页面前先提醒
  useEffect(() => {
    if (!running) return undefined
    const warn = event => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [running])

  const pick = byFolder => event => {
    const { groups, ignored: skipped } = groupFiles(Array.from(event.target.files || []), byFolder)
    event.target.value = '' // 允许再次选同一个文件夹
    setRows(groups.map((group, index) => ({ key: `${index}-${group.code}`, code: group.code, items: group.items, include: true })))
    setIgnored(skipped)
  }
  const update = (index, changes) => setRows(previous => previous.map((row, i) => (i === index ? { ...row, ...changes } : row)))

  // 预览：每行导入后的去向，以及合计
  const plan = useMemo(() => {
    if (!rows) return null
    const seen = new Set()
    const total = { files: 0, bytes: 0, created: 0, appended: 0, invalid: 0 }
    const status = rows.map(row => {
      if (!row.include) return { text: '不导入' }
      const code = row.code.trim()
      if (!code) { total.invalid += 1; return { error: '请填写编号' } }
      if (code.length > MAX_CODE) { total.invalid += 1; return { error: `编号最多 ${MAX_CODE} 个字` } }
      total.files += row.items.length
      total.bytes += sizeOf(row.items)
      if (caseIds.current.has(code)) {
        if (!seen.has(code)) total.appended += 1
        seen.add(code)
        return { text: '追加到已有病历' }
      }
      if (seen.has(code)) return { text: '并入同编号的病历' }
      seen.add(code)
      total.created += 1
      return { text: '新建病历' }
    })
    return { status, ...total }
  }, [rows])

  // 找到编号对应的病历，没有就新建；编号刚被别人建了（409）时，重新读列表拿到它
  const ensureCase = async (code, summary) => {
    if (caseIds.current.has(code)) return caseIds.current.get(code)
    try {
      const { id } = await createReviewCase(projectId, { code, reviewer_id: reviewerId === '' ? null : Number(reviewerId) })
      caseIds.current.set(code, id)
      knownNames.current.set(id, new Set())
      summary.created += 1
      return id
    } catch (err) {
      if (err?.response?.status !== 409) throw err
      const found = (await listReviewCases(projectId)).find(item => item.code === code)
      if (!found) throw err
      caseIds.current.set(code, found.id)
      return found.id
    }
  }
  const namesOf = async caseId => {
    if (!knownNames.current.has(caseId)) knownNames.current.set(caseId, new Set((await getReviewCase(caseId)).files.map(file => file.name)))
    return knownNames.current.get(caseId)
  }

  // 逐个文件上传。tasks：[{ code, items }]。没传上的（失败或停止后没轮到的）留在 leftover，可以接着传
  const run = async tasks => {
    stopRef.current = false
    setStopping(false); setResult(null); setRunning(true)
    const total = countOf(tasks)
    const totalBytes = tasks.reduce((sum, task) => sum + sizeOf(task.items), 0) || 1
    const percent = bytes => Math.min(100, Math.floor((bytes / totalBytes) * 100))
    const summary = { created: 0, uploaded: 0, skipped: 0, failures: [], leftover: [], stopped: false }
    const leave = (code, items, message) => {
      summary.leftover.push({ code, items })
      if (message) items.forEach(item => summary.failures.push({ code, name: item.name, message }))
    }
    let doneBytes = 0
    let index = 0
    for (const task of tasks) {
      if (stopRef.current) { leave(task.code, task.items); continue }
      let caseId
      let names
      try {
        caseId = await ensureCase(task.code, summary)
        names = await namesOf(caseId)
      } catch (err) {
        leave(task.code, task.items, errorText(err, '建病历失败'))
        doneBytes += sizeOf(task.items)
        index += task.items.length
        continue
      }
      for (const item of task.items) {
        if (stopRef.current) { leave(task.code, [item]); continue }
        index += 1
        setProgress({ index, total, name: item.name, percent: percent(doneBytes) })
        if (names.has(item.name)) {
          summary.skipped += 1
        } else {
          try {
            const before = doneBytes
            await uploadCaseFiles(caseId, [asUpload(item)], event => setProgress(previous => previous && { ...previous, percent: percent(before + (event?.loaded || 0)) }))
            names.add(item.name)
            summary.uploaded += 1
          } catch (err) {
            leave(task.code, [item], errorText(err, '上传失败'))
          }
        }
        doneBytes += item.file.size
      }
    }
    summary.stopped = stopRef.current
    setRunning(false); setProgress(null); setResult(summary)
    onImported()
  }
  const start = () => run(rows.filter(row => row.include).map(row => ({ code: row.code.trim(), items: row.items })))
  const stop = () => { stopRef.current = true; setStopping(true) }

  const leftoverCount = result ? countOf(result.leftover) : 0
  return <div className="modal-overlay">
    <div className="modal cr-modal cr-batch" role="dialog" aria-label="批量导入病历">
      <div className="modal-header"><h3>批量导入病历</h3>{!running && <button type="button" className="text-button" onClick={onClose}>{result ? '完成' : '关闭'}</button>}</div>
      <input ref={folderInput} type="file" webkitdirectory="" multiple hidden onChange={pick(true)} />
      <input ref={fileInput} type="file" accept="application/pdf,.pdf" multiple hidden onChange={pick(false)} />

      {!rows && <div className="cr-batch-intro">
        {!isMobile && <p>选一个总文件夹：里面每个患者一个子文件夹，<strong>子文件夹名就是编号</strong>，放这个患者的全部 PDF，几份都行。</p>}
        <p>{isMobile ? '手机上不能选文件夹，可以直接多选 PDF' : '也可以直接多选 PDF'}：按文件名开头的编号分组，编号后面用下划线或空格隔开，如「123_入院记录.pdf」。{isMobile && '整个文件夹导入请用电脑。'}</p>
        <p className="cr-muted">编号已存在的，PDF 追加到原病历；病历里已有同名文件的会跳过，所以中断后把同一批重新导入一遍也不会重复。</p>
        <div className="cr-batch-pickers">
          {!isMobile && <button type="button" className="btn-primary" onClick={() => folderInput.current.click()}>选择文件夹</button>}
          <button type="button" className={isMobile ? 'btn-primary' : 'btn-secondary'} onClick={() => fileInput.current.click()}>选择 PDF 文件</button>
        </div>
      </div>}

      {rows && !running && !result && <>
        <p className="cr-batch-summary">
          {rows.length ? `共 ${rows.length} 个编号、${plan.files} 份 PDF（${formatSize(plan.bytes)}）：新建病历 ${plan.created} 份，追加到已有病历 ${plan.appended} 份。` : '没有找到可以导入的 PDF。'}
          {ignored > 0 && `已跳过 ${ignored} 个不是 PDF 或隐藏的文件。`}
        </p>
        {plan.created > 0 && <label className="cr-field"><span>新建病历的审阅人</span><select value={reviewerId} onChange={event => setReviewerId(event.target.value)}>
          <option value="">暂不指派</option>
          {reviewers.map(member => <option key={member.id} value={member.id}>{member.nickname}{member.username ? `（@${member.username}）` : ''}</option>)}
        </select></label>}
        {rows.length > 0 && <ul className="cr-batch-list">
          {rows.map((row, index) => <li key={row.key} className={row.include ? '' : 'is-off'}>
            <input type="checkbox" checked={row.include} onChange={event => update(index, { include: event.target.checked })} aria-label={`导入编号 ${row.code}`} />
            <div className="cr-batch-row">
              <input className="cr-batch-code" value={row.code} onChange={event => update(index, { code: event.target.value })} disabled={!row.include} aria-label="编号" />
              <span className={`cr-batch-status${plan.status[index].error ? ' cr-danger' : ''}`}>{plan.status[index].error || plan.status[index].text}</span>
              <details><summary>{row.items.length} 份 PDF · {formatSize(sizeOf(row.items))}</summary>
                <ul>{row.items.map((item, i) => <li key={i}>{item.name}</li>)}</ul>
              </details>
            </div>
          </li>)}
        </ul>}
        <div className="modal-actions">
          <button type="button" className="text-button" onClick={() => setRows(null)}>重新选择</button>
          <button type="button" className="btn-primary" disabled={!plan.files || plan.invalid > 0} onClick={start}>开始导入{plan.files ? `（${plan.files} 份 PDF）` : ''}</button>
        </div>
      </>}

      {running && <div className="cr-batch-progress">
        <div className="cr-batch-bar"><span style={{ width: `${progress?.percent || 0}%` }} /></div>
        <p>{progress ? `正在上传第 ${progress.index} / ${progress.total} 个：${progress.name}` : '准备中…'}</p>
        <p className="cr-muted">上传期间请不要关闭页面。已传完的不会丢，停止后可以接着传。</p>
        <div className="modal-actions"><button type="button" className="text-button cr-danger" disabled={stopping} onClick={stop}>{stopping ? '传完这一个就停…' : '停止'}</button></div>
      </div>}

      {result && <div className="cr-batch-result">
        <p>{result.stopped ? '已停止。' : '导入完成。'}新建病历 {result.created} 份，上传 PDF {result.uploaded} 个{result.skipped ? `，跳过同名 ${result.skipped} 个` : ''}{leftoverCount ? `，还有 ${leftoverCount} 个没传上` : ''}。</p>
        {result.failures.length > 0 && <ul className="cr-batch-failures">{result.failures.map((failure, index) => <li key={index}>{failure.code} / {failure.name}：{failure.message}</li>)}</ul>}
        <div className="modal-actions">
          {leftoverCount > 0 && <button type="button" className="text-button" onClick={() => run(result.leftover)}>{result.stopped ? '继续上传' : '重试'}剩下的 {leftoverCount} 个</button>}
          <button type="button" className="btn-primary" onClick={onClose}>完成</button>
        </div>
      </div>}
    </div>
  </div>
}
