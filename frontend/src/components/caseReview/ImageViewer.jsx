import { useEffect, useMemo, useRef, useState } from 'react'
import { caseFileUrl } from '../../api/caseReview'
import { getAuthorizedFileBlob } from '../../api/files'
import AnnotationOverlay from './AnnotationOverlay'
import { errorText } from './common'

const ZOOMS = [1, 1.25, 1.5, 2, 3]

export default function ImageViewer({ fileId, name, notes, mode, selectedId, focusRequest, draft, onSelect, onDraft, toolbarExtra }) {
  const scrollRef = useRef(null)
  const [containerWidth, setContainerWidth] = useState(0)
  const [image, setImage] = useState(null)
  const [zoom, setZoom] = useState(1)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')

  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setContainerWidth(entry.contentRect.width))
    observer.observe(scrollRef.current)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    let objectUrl = null
    let decoded = null
    let cancelled = false
    setImage(null); setError(''); setProgress(0); setZoom(1)
    getAuthorizedFileBlob(caseFileUrl(fileId), {
      timeout: 0, signal: controller.signal,
      onDownloadProgress: event => { if (!cancelled && event.total) setProgress(event.loaded / event.total) },
    }).then(blob => {
      if (cancelled) return
      objectUrl = URL.createObjectURL(blob)
      decoded = new Image()
      decoded.onload = () => {
        if (!cancelled) setImage({ url: objectUrl, width: decoded.naturalWidth, height: decoded.naturalHeight })
      }
      decoded.onerror = () => {
        if (!cancelled) {
          setError('图片打开失败，文件可能已损坏')
          URL.revokeObjectURL(objectUrl)
          objectUrl = null
        }
      }
      decoded.src = objectUrl
    }).catch(err => { if (!cancelled) setError(errorText(err, '图片下载失败')) })
    return () => {
      cancelled = true
      controller.abort()
      if (decoded) { decoded.onload = null; decoded.onerror = null }
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [fileId])

  useEffect(() => {
    if (focusRequest && image) scrollRef.current?.querySelector(`#cr-note-${focusRequest.id}`)?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' })
  }, [focusRequest, image])

  const numbers = useMemo(() => Object.fromEntries(notes.map((note, index) => [note.id, index + 1])), [notes])
  const width = Math.max(0, Math.floor((containerWidth - 16) * zoom))
  const height = image ? width * image.height / image.width : 0
  const changeZoom = step => setZoom(previous => ZOOMS[Math.min(ZOOMS.length - 1, Math.max(0, ZOOMS.indexOf(previous) + step))])

  return <div className="cr-viewer">
    <div className="cr-viewer-toolbar">
      <span className="cr-page-indicator">图片 · 1 / 1</span>
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
      {!error && !image && <div className="cr-viewer-status">{progress > 0 && progress < 1 ? `正在下载图片 ${Math.round(progress * 100)}%` : '正在打开图片…'}</div>}
      {image && width > 0 && <div className="cr-page" data-page="1" style={{ width, height }}>
        <img src={image.url} alt={name} draggable={false} style={{ display: 'block', width, height }} />
        <AnnotationOverlay pageNumber={1} notes={notes} numbers={numbers} mode={mode} selectedId={selectedId} draft={draft} onSelect={onSelect} onDraft={onDraft} />
      </div>}
    </div>
  </div>
}
