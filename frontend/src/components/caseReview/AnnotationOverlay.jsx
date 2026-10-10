import { useRef, useState } from 'react'

const clamp = value => Math.min(1, Math.max(0, value))
const percent = value => `${value * 100}%`

// 把指针位置换算成相对页面的比例坐标（0–1），手机和电脑上都能对上
function relativePoint(event, element) {
  const rect = element.getBoundingClientRect()
  return { x: clamp((event.clientX - rect.left) / rect.width), y: clamp((event.clientY - rect.top) / rect.height) }
}
const boxOf = (a, b) => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) })
const boxStyle = box => ({ left: percent(box.x), top: percent(box.y), width: percent(box.width), height: percent(box.height) })

// 框选结束时把选区从页面画布/图片上裁下来（本地完成，供批注框里做 OCR 识别）
function captureCrop(box, host) {
  if (!host) return undefined
  const canvas = host.querySelector('canvas')
  const image = host.querySelector('img')
  try {
    let source, sx, sy, sw, sh
    if (canvas) {
      source = canvas
      sx = Math.round(box.x * canvas.width); sy = Math.round(box.y * canvas.height)
      sw = Math.max(1, Math.round(box.width * canvas.width)); sh = Math.max(1, Math.round(box.height * canvas.height))
    } else if (image?.naturalWidth) {
      source = image
      sx = Math.round(box.x * image.naturalWidth); sy = Math.round(box.y * image.naturalHeight)
      sw = Math.max(1, Math.round(box.width * image.naturalWidth)); sh = Math.max(1, Math.round(box.height * image.naturalHeight))
    } else return undefined
    if (sw < 8 || sh < 8) return undefined
    const out = document.createElement('canvas')
    out.width = sw; out.height = sh
    out.getContext('2d').drawImage(source, sx, sy, sw, sh, 0, 0, sw, sh)
    return out.toDataURL('image/png')
  } catch {
    return undefined
  }
}

export default function AnnotationOverlay({ pageNumber, notes, numbers, mode, selectedId, draft, onSelect, onDraft }) {
  const overlayRef = useRef(null)
  const [drawing, setDrawing] = useState(null)
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
    if (box.width > 0.01 && box.height > 0.005) onDraft({ page: pageNumber, kind: 'rect', ...box, crop: captureCrop(box, overlayRef.current?.parentElement) })
  }
  const selectNote = id => event => {
    event.stopPropagation()
    onSelect(id)
  }
  const stop = event => event.stopPropagation()

  return <div ref={overlayRef} className={`cr-page-overlay cr-mode-${mode}`} onClick={handleClick} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={() => setDrawing(null)}>
    {notes.map(note => {
      // 审阅人的批注用另一种形状（见 caseReview.css）
      const state = `${note.byReviewer ? ' is-reviewer' : ''}${note.id === selectedId ? ' is-selected' : ''}`
      const label = `批注 ${numbers[note.id]}${note.byReviewer ? '（审阅人）' : ''}`
      return note.kind === 'rect'
        ? <button type="button" key={note.id} id={`cr-note-${note.id}`} className={`cr-note-rect${state}`} style={boxStyle(note)} onClick={selectNote(note.id)} onPointerDown={stop} aria-label={label}><span>{numbers[note.id]}</span></button>
        : <button type="button" key={note.id} id={`cr-note-${note.id}`} className={`cr-note-pin${state}`} style={{ left: percent(note.x), top: percent(note.y) }} onClick={selectNote(note.id)} onPointerDown={stop} aria-label={label}>{numbers[note.id]}</button>
    })}
    {draft?.page === pageNumber && (draft.kind === 'rect'
      ? <div className="cr-note-rect is-draft" style={boxStyle(draft)} />
      : <div className="cr-note-pin is-draft" style={{ left: percent(draft.x), top: percent(draft.y) }}>＋</div>)}
    {drawing && <div className="cr-note-rect is-draft" style={boxStyle(boxOf(drawing.start, drawing.end))} />}
  </div>
}
