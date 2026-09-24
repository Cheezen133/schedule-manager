import { useState, useEffect, useRef } from 'react'
import { getAttachments, uploadAttachment, deleteAttachment, getAttachmentDownloadUrl } from '../../api/attachments'
import { downloadAuthorizedFile, getAuthorizedFileBlob, openAuthorizedFile } from '../../api/files'
import { useAuth } from '../../contexts/AuthContext'

function ProtectedAttachmentImage({ attachmentId, alt, onOpen }) {
  const [src, setSrc] = useState('')
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let active = true
    let objectUrl = ''
    setSrc(''); setFailed(false)
    getAuthorizedFileBlob(getAttachmentDownloadUrl(attachmentId))
      .then(blob => {
        objectUrl = URL.createObjectURL(blob)
        if (active) setSrc(objectUrl)
        else URL.revokeObjectURL(objectUrl)
      })
      .catch(() => { if (active) setFailed(true) })
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [attachmentId])

  if (failed) return <span style={{ fontSize: '1.5rem' }} title="预览加载失败">🖼️</span>
  if (!src) return <span style={{ width: 48, textAlign: 'center', color: '#9ca3af' }}>···</span>
  return <button type="button" onClick={onOpen} style={{ padding: 0, border: 0, background: 'none', cursor: 'pointer' }}><img src={src} alt={alt} style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 4, border: '1px solid #e5e7eb' }} /></button>
}

export default function AttachmentsPanel({ scheduleId, customerPhone }) {
  const { user, isAdmin } = useAuth()
  const [attachments, setAttachments] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [desc, setDesc] = useState('')
  const [showHistory, setShowHistory] = useState(false)
  const fileRef = useRef(null)

  const hasCustomer = !!customerPhone

  useEffect(() => { loadAttachments() }, [scheduleId, showHistory])

  const loadAttachments = async () => {
    try {
      const res = await getAttachments(scheduleId, showHistory)
      setAttachments(res.data || [])
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }

  const handleUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      await uploadAttachment(scheduleId, file, desc)
      setDesc('')
      if (fileRef.current) fileRef.current.value = ''
      loadAttachments()
    } catch (err) {
      alert(err.userMessage ||'上传失败')
    } finally { setUploading(false) }
  }

  const handleDelete = async (attId) => {
    if (!confirm('删除此附件？')) return
    try { await deleteAttachment(attId); loadAttachments() }
    catch (err) { alert(err.userMessage ||'删除失败') }
  }

  const handleOpen = async (att) => {
    try { await openAuthorizedFile(getAttachmentDownloadUrl(att.id)) }
    catch (err) { alert(err.userMessage || '打开附件失败') }
  }

  const handleDownload = async (att) => {
    try { await downloadAuthorizedFile(getAttachmentDownloadUrl(att.id), att.filename) }
    catch (err) { alert(err.userMessage || '下载附件失败') }
  }

  const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const isImage = (ct) => ct?.startsWith('image/')

  return (
    <div style={{ marginTop: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <h4 style={{ margin: 0 }}>📎 附件资料 ({attachments.length})</h4>
        {hasCustomer && (
          <label style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer', color: '#4f46e5' }}>
            <input type="checkbox" checked={showHistory} onChange={(e) => setShowHistory(e.target.checked)} />
            显示全部历史附件
          </label>
        )}
      </div>

      {/* Upload */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <input type="text" value={desc} onChange={(e) => setDesc(e.target.value)}
          placeholder="描述（可选）" maxLength={200}
          style={{ padding: '0.4rem 0.6rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.85rem', width: '160px' }} />
        <input ref={fileRef} type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
          onChange={handleUpload} style={{ display: 'none' }} id="att-upload" />
        <label htmlFor="att-upload" style={{ background: '#4f46e5', color: 'white', padding: '0.4rem 0.8rem', borderRadius: '6px',
            fontSize: '0.85rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          {uploading ? '上传中...' : '📷 拍照/上传文件'}
        </label>
        <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>图片、PDF、Office文档</span>
      </div>

      {/* Grid */}
      {loading ? <p style={{ color: '#9ca3af', fontSize: '0.85rem' }}>加载中...</p> :
       attachments.length === 0 ? <p style={{ color: '#9ca3af', fontSize: '0.85rem' }}>
          {hasCustomer && !showHistory ? '暂无附件，勾选「显示全部历史」查看过往资料' : '暂无附件'}
        </p> :
       <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.5rem' }}>
         {attachments.map((att) => (
           <div key={att.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem',
               padding: '0.6rem 0.8rem', background: 'white', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '0.85rem' }}>
             {isImage(att.content_type) ? (
               <ProtectedAttachmentImage attachmentId={att.id} alt={att.filename} onOpen={() => handleOpen(att)} />
             ) : (
               <span style={{ fontSize: '1.5rem' }}>📄</span>
             )}
             <div style={{ flex: 1, minWidth: 0 }}>
               <button type="button" onClick={() => handleOpen(att)} style={{ padding: 0, border: 'none', background: 'none', cursor: 'pointer', color: '#4f46e5', fontWeight: 500 }}>
                 {att.filename}
               </button>
               {att.description && <span style={{ color: '#6b7280', marginLeft: '0.5rem', fontSize: '0.8rem' }}>- {att.description}</span>}
               <div style={{ fontSize: '0.7rem', color: '#9ca3af' }}>
                 {formatSize(att.file_size)} · {att.uploader_name}
                 {att.schedule_id !== scheduleId && att.schedule_title && (
                   <span style={{ color: '#4f46e5' }}> · 📅 {att.schedule_title}</span>
                 )}
               </div>
             </div>
             <button onClick={() => handleDownload(att)} title="下载附件"
               style={{ background: 'none', border: 'none', color: '#4f46e5', cursor: 'pointer', fontSize: '0.85rem' }}>⬇</button>
             {(isAdmin || att.uploaded_by === user?.id) && <button onClick={() => handleDelete(att.id)}
               style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '0.85rem' }}>🗑</button>
             }
           </div>
         ))}
       </div>
      }
    </div>
  )
}
