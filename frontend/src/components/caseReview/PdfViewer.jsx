import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'
import { fetchCaseFile } from '../../api/caseReview'
import { errorText } from './common'

// 用 PDF.js 的 legacy 构建渲染病历：兼容较旧的企业微信内置浏览器。
// 字符映射、标准字体、图片解码器由 vite.config.js 的 pdfjsAssets 插件提供（打包后在 dist/pdfjs）。
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
const ASSETS = `${import.meta.env.BASE_URL}pdfjs/`
const DOCUMENT_OPTIONS = { cMapUrl: `${ASSETS}cmaps/`, cMapPacked: true, standardFontDataUrl: `${ASSETS}standard_fonts/`, wasmUrl: `${ASSETS}wasm/`, iccUrl: `${ASSETS}iccs/` }
const ZOOMS = [1, 1.25, 1.5, 2, 3]
const MAX_CANVAS_PIXELS = 16_000_000 // 部分 iOS 设备单个画布超过约 1600 万像素就画不出来
const clamp = value => Math.min(1, Math.max(0, value))
const percent = value => `${value * 100}%`

// 把指针位置换算成相对页面的比例坐标（0–1），手机和电脑上都能对上
function relativePoint(event, element) {
  const rect = element.getBoundingClientRect()
  return { x: clamp((event.clientX - rect.left) / rect.width), y: clamp((event.clientY - rect.top) / rect.height) }
}
const boxOf = (a, b) => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) })
const boxStyle = box => ({ left: percent(box.x), top: percent(box.y), width: percent(box.width), height: percent(box.height) })

function PdfPage({ page, pageNumber, width, scrollRoot, notes, numbers, mode, selectedId, draft, onSelect, onDraft, onVisible }) {
  const wrapRef = useRef(null)
  const canvasRef = useRef(null)
  const overlayRef = useRef(null)
  const [near, setNear] = useState(false)
  const [drawing, setDrawing] = useState(null)
  const base = useMemo(() => page.getViewport({ scale: 1 }), [page])
  const height = Math.round((width * base.height) / base.width)

  // 只渲染视口附近的页面；离得远就释放画布，长病历在手机上也不会占满内存
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setNear(entry.isIntersecting), { root: scrollRoot, rootMargin: '150% 0px' })
    observer.observe(wrapRef.current)
    return () => observer.disconnect()
  }, [scrollRoot])

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => onVisible(pageNumber, entry.intersectionRatio), { root: scrollRoot, threshold: [0, 0.25, 0.5, 0.75, 1] })
    observer.observe(wrapRef.current)
    return () => observer.disconnect()
  }, [scrollRoot, pageNumber, onVisible])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!near || !width) {
      canvas.width = 0
      canvas.height = 0
      return undefined
    }
    const ratio = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(MAX_CANVAS_PIXELS / (width * height)))
    const viewport = page.getViewport({ scale: (width * ratio) / base.width })
    canvas.width = Math.floor(viewport.width)
    canvas.height = Math.floor(viewport.height)
    const task = page.render({ canvas, viewport })
    task.promise.catch(() => {})
    return () => task.cancel()
  }, [page, base, near, width, height])

  const handleClick = event => {
    if (mode !== 'point') return
    const { x, y } = relativePoint(event, overlayRef.current)
    onDraft({ page: pageNumber, kind: 'point', x, y, width: 0, height: 0 })
  }
  const handlePointerDown = event => {
    if (mode !== 'rect') return
    event.preventDefault()
    overlayRef.current.setPointerCapture?.(event.pointerId)
    const start = relativePoint(event, overlayRef.current)
    setDrawing({ start, end: start })
  }
  const handlePointerMove = event => {
    if (drawing) setDrawing({ ...drawing, end: relativePoint(event, overlayRef.current) })
  }
  const handlePointerUp = event => {
    if (!drawing) return
    const box = boxOf(drawing.start, relativePoint(event, overlayRef.current))
    setDrawing(null)
    if (box.width > 0.01 && box.height > 0.005) onDraft({ page: pageNumber, kind: 'rect', ...box })
  }
  const selectNote = id => event => {
    event.stopPropagation()
    onSelect(id)
  }
  const stop = event => event.stopPropagation()

  return <div className="cr-page" ref={wrapRef} data-page={pageNumber} style={{ width, height }}>
    <canvas ref={canvasRef} style={{ width, height }} />
    <div ref={overlayRef} className={`cr-page-overlay cr-mode-${mode}`} onClick={handleClick} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={() => setDrawing(null)}>
      {notes.map(note => note.kind === 'rect'
        ? <button type="button" key={note.id} id={`cr-note-${note.id}`} className={`cr-note-rect${note.id === selectedId ? ' is-selected' : ''}`} style={boxStyle(note)} onClick={selectNote(note.id)} onPointerDown={stop} aria-label={`批注 ${numbers[note.id]}`}><span>{numbers[note.id]}</span></button>
        : <button type="button" key={note.id} id={`cr-note-${note.id}`} className={`cr-note-pin${note.id === selectedId ? ' is-selected' : ''}`} style={{ left: percent(note.x), top: percent(note.y) }} onClick={selectNote(note.id)} onPointerDown={stop} aria-label={`批注 ${numbers[note.id]}`}>{numbers[note.id]}</button>)}
      {draft?.page === pageNumber && (draft.kind === 'rect'
        ? <div className="cr-note-rect is-draft" style={boxStyle(draft)} />
        : <div className="cr-note-pin is-draft" style={{ left: percent(draft.x), top: percent(draft.y) }}>＋</div>)}
      {drawing && <div className="cr-note-rect is-draft" style={boxStyle(boxOf(drawing.start, drawing.end))} />}
    </div>
    <span className="cr-page-number">{pageNumber}</span>
  </div>
}

// fileId：要看的 PDF；notes：该文件的批注（按页、位置排好序）；mode：view／point／rect
// focusRequest：{ id, nonce }，列表里点某条批注时滚动到它；toolbarExtra：工具栏右侧的附加按钮
export default function PdfViewer({ fileId, notes, mode, selectedId, focusRequest, draft, onSelect, onDraft, toolbarExtra }) {
  const scrollRef = useRef(null)
  const [scrollRoot, setScrollRoot] = useState(null)
  const [pages, setPages] = useState(null)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')
  const [containerWidth, setContainerWidth] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [currentPage, setCurrentPage] = useState(1)
  const ratios = useRef(new Map())
  const pendingPage = useRef(null)

  useEffect(() => {
    const element = scrollRef.current
    setScrollRoot(element)
    const observer = new ResizeObserver(([entry]) => setContainerWidth(entry.contentRect.width))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    let cancelled = false
    let loadingTask = null
    setPages(null); setError(''); setProgress(0); setCurrentPage(1); ratios.current = new Map()
    fetchCaseFile(fileId, event => event.total && setProgress(event.loaded / event.total))
      .then(buffer => {
        if (cancelled) return null
        loadingTask = pdfjs.getDocument({ data: new Uint8Array(buffer), ...DOCUMENT_OPTIONS })
        return loadingTask.promise
      })
      .then(pdf => pdf && Promise.all(Array.from({ length: pdf.numPages }, (_, index) => pdf.getPage(index + 1))))
      .then(list => { if (list && !cancelled) setPages(list) })
      .catch(err => { if (!cancelled) setError(err?.name === 'PasswordException' ? '这份 PDF 设有密码，无法在线打开' : errorText(err, 'PDF 打开失败，文件可能已损坏')) })
    return () => {
      cancelled = true
      loadingTask?.destroy()
    }
  }, [fileId])

  const onVisible = useCallback((pageNumber, ratio) => {
    ratios.current.set(pageNumber, ratio)
    let best = 1
    let bestRatio = -1
    ratios.current.forEach((value, key) => { if (value > bestRatio) { best = key; bestRatio = value } })
    setCurrentPage(best)
  }, [])

  const goToPage = useCallback(pageNumber => {
    scrollRef.current?.querySelector(`[data-page="${pageNumber}"]`)?.scrollIntoView({ block: 'start' })
  }, [])

  const changeZoom = step => {
    const next = ZOOMS[Math.min(ZOOMS.length - 1, Math.max(0, ZOOMS.indexOf(zoom) + step))]
    if (next === zoom) return
    pendingPage.current = currentPage
    setZoom(next)
  }
  // 缩放后回到缩放前看的那一页
  useEffect(() => {
    if (pendingPage.current == null) return
    const pageNumber = pendingPage.current
    pendingPage.current = null
    requestAnimationFrame(() => goToPage(pageNumber))
  }, [zoom, goToPage])

  useEffect(() => {
    if (!focusRequest || !pages) return
    document.getElementById(`cr-note-${focusRequest.id}`)?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' })
  }, [focusRequest, pages])

  const numbers = useMemo(() => Object.fromEntries(notes.map((note, index) => [note.id, index + 1])), [notes])
  const notesByPage = useMemo(() => {
    const map = {}
    notes.forEach(note => { (map[note.page] ||= []).push(note) })
    return map
  }, [notes])
  const pageWidth = Math.max(0, Math.floor((containerWidth - 16) * zoom))
  const total = pages?.length || 0

  return <div className="cr-viewer">
    <div className="cr-viewer-toolbar">
      <div className="cr-toolbar-group">
        <button type="button" onClick={() => goToPage(currentPage - 1)} disabled={currentPage <= 1} aria-label="上一页">‹</button>
        <span className="cr-page-indicator">{total ? `${currentPage} / ${total}` : '– / –'}</span>
        <button type="button" onClick={() => goToPage(currentPage + 1)} disabled={!total || currentPage >= total} aria-label="下一页">›</button>
      </div>
      <div className="cr-toolbar-group">
        <button type="button" onClick={() => changeZoom(-1)} disabled={zoom === ZOOMS[0]} aria-label="缩小">－</button>
        <span className="cr-zoom-indicator">{Math.round(zoom * 100)}%</span>
        <button type="button" onClick={() => changeZoom(1)} disabled={zoom === ZOOMS[ZOOMS.length - 1]} aria-label="放大">＋</button>
      </div>
      {toolbarExtra}
    </div>
    {mode !== 'view' && <div className="cr-mode-hint">{mode === 'point' ? '点一下要批注的位置' : '按住拖动，框出要批注的区域'}</div>}
    <div className={`cr-viewer-scroll${zoom > 1 ? ' is-zoomed' : ''}`} ref={scrollRef}>
      {error && <div className="cr-viewer-status error-message">{error}</div>}
      {!error && !pages && <div className="cr-viewer-status">{progress > 0 && progress < 1 ? `正在下载病历 ${Math.round(progress * 100)}%` : '正在打开病历…'}</div>}
      {pages && scrollRoot && pageWidth > 0 && pages.map((page, index) => <PdfPage
        key={index} page={page} pageNumber={index + 1} width={pageWidth} scrollRoot={scrollRoot}
        notes={notesByPage[index + 1] || []} numbers={numbers} mode={mode} selectedId={selectedId} draft={draft}
        onSelect={onSelect} onDraft={onDraft} onVisible={onVisible}
      />)}
    </div>
  </div>
}
