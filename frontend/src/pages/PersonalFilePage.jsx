import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import api from '../api/client'
import { BackButton } from '../components/memo/MemoNav'

export default function PersonalFilePage() {
  const [folders, setFolders] = useState([]), [files, setFiles] = useState([]), [folderId, setFolderId] = useState(null)
  const [q, setQ] = useState(''), [tag, setTag] = useState(''), [error, setError] = useState('')
  const [folderDialog, setFolderDialog] = useState(null), [moveDialog, setMoveDialog] = useState(null), [confirmDialog, setConfirmDialog] = useState(null)
  const input = useRef(null)
  const load = useCallback(async () => {
    try {
      const [folderRes, fileRes] = await Promise.all([
        api.get('/memos/folders'),
        api.get('/memos/files', { params: { ...(folderId ? { folder_id: folderId } : {}), ...(q ? { q } : {}), ...(tag ? { tag } : {}) } }),
      ])
      setFolders(folderRes.data?.data || []); setFiles(fileRes.data?.data || []); setError('')
    } catch { setError('无法加载个人文件。') }
  }, [folderId, q, tag])
  useEffect(() => { load() }, [load])
  const activeFolder = folders.find(folder => folder.id === folderId)
  const currentFolders = folders.filter(folder => folder.parent_id === folderId)
  const breadcrumbs = useMemo(() => {
    const result = [], seen = new Set(); let current = activeFolder
    while (current && !seen.has(current.id)) { result.unshift(current); seen.add(current.id); current = folders.find(folder => folder.id === current.parent_id) }
    return result
  }, [activeFolder, folders])
  const saveFolder = async event => {
    event.preventDefault(); const name = folderDialog.name.trim(); if (!name) return
    try {
      if (folderDialog.folder) await api.put(`/memos/folders/${folderDialog.folder.id}`, { name, parent_id: folderDialog.folder.parent_id })
      else await api.post('/memos/folders', { name, parent_id: folderId })
      setFolderDialog(null); load()
    } catch { setError('保存文件夹失败。') }
  }
  const upload = async event => {
    const file = event.target.files?.[0]; if (!file) return
    try {
      const form = new FormData(); form.append('file', file)
      if (folderId) form.append('folder_id', folderId); if (tag) form.append('tags', tag)
      await api.post('/memos/files', form); load()
    } catch { setError('上传文件失败。') } finally { event.target.value = '' }
  }
  const moveFile = async event => {
    event.preventDefault()
    try { await api.put(`/memos/files/${moveDialog.file.id}`, { folder_id: moveDialog.folder_id || null }); setMoveDialog(null); load() } catch { setError('移动文件失败。') }
  }
  const removeFile = async () => {
    try { await api.delete(`/memos/files/${confirmDialog.file.id}`); setConfirmDialog(null); load() } catch { setError('删除文件失败。') }
  }
  const clearFilters = () => { setQ(''); setTag('') }

  return <div className="memo-page personal-file-page">
    <BackButton fallback="/profile/memos/personal" />
    <section className="file-workspace">
      <div className="file-workspace-header">
        <div><span className="file-eyebrow">个人备忘录 · 文件</span><h2>文件管理</h2></div>
        <div className="file-primary-actions"><button className="btn-secondary" onClick={() => setFolderDialog({ name: '', folder: null })}>＋ 新建文件夹</button><button className="btn-primary" onClick={() => input.current?.click()}>↑ 上传文件</button><input ref={input} type="file" hidden onChange={upload} /></div>
      </div>
      <div className="file-location-bar">
        <nav className="file-breadcrumb" aria-label="文件路径"><button className={!folderId ? 'active' : ''} onClick={() => setFolderId(null)}>根目录</button>{breadcrumbs.map(folder => <span key={folder.id}><i>/</i><button className={folder.id === folderId ? 'active' : ''} onClick={() => setFolderId(folder.id)}>{folder.name}</button></span>)}</nav>
        {folderId && <button className="file-up-button" onClick={() => setFolderId(activeFolder?.parent_id || null)}>← 返回上一级</button>}
      </div>
      {error && <div className="error-message">{error}</div>}
      <form className="file-filter-bar" onSubmit={event => { event.preventDefault(); load() }}><label><span>搜索</span><input placeholder="文件名" value={q} onChange={event => setQ(event.target.value)} /></label><label><span>标签</span><input placeholder="例如：报告" value={tag} onChange={event => setTag(event.target.value)} /></label><button className="btn-secondary">应用筛选</button>{(q || tag) && <button className="file-clear-filter" type="button" onClick={clearFilters}>清除</button>}</form>
      <div className="file-browser file-table">
        <div className="file-table-head"><span>名称</span><span>标签 / 类型</span><span>操作</span></div>
        {currentFolders.map(folder => <div className="file-row folder" key={folder.id}><button className="file-name-cell" onClick={() => setFolderId(folder.id)}><b className="file-icon">📁</b><span><strong>{folder.name}</strong><small>文件夹</small></span></button><span className="file-kind">文件夹</span><span className="file-row-actions"><button className="text-button" onClick={() => setFolderDialog({ name: folder.name, folder })}>重命名</button></span></div>)}
        {files.map(item => <div className="file-row" key={item.id}><a className="file-name-cell" href={item.download_url} download><b className="file-icon">📄</b><span><strong>{item.name}</strong><small>{item.sender_name || '我'} · {item.created_at ? item.created_at.slice(0, 16).replace('T', ' ') : '未知时间'}</small></span></a><span className="file-tag">{item.tags || '无标签'}</span><span className="file-row-actions"><button className="text-button" onClick={() => setMoveDialog({ file: item, folder_id: item.folder_id || '' })}>移动</button><a className="text-button" href={item.download_url} download>下载</a><button className="text-button danger" onClick={() => setConfirmDialog({ file: item })}>删除</button></span></div>)}
        {!files.length && !currentFolders.length && <div className="file-empty"><span>📂</span><strong>此文件夹为空</strong><p>新建文件夹或上传文件，开始整理资料。</p></div>}
      </div>
    </section>
    {folderDialog && <div className="modal-overlay"><form className="modal compact-modal" onSubmit={saveFolder}><div className="modal-header"><h3>{folderDialog.folder ? '重命名文件夹' : '新建文件夹'}</h3><button type="button" className="text-button" onClick={() => setFolderDialog(null)}>关闭</button></div><label>文件夹名称<input autoFocus required value={folderDialog.name} onChange={event => setFolderDialog({ ...folderDialog, name: event.target.value })} /></label><div className="modal-actions"><button type="button" className="btn-secondary" onClick={() => setFolderDialog(null)}>取消</button><button className="btn-primary">保存</button></div></form></div>}
    {moveDialog && <div className="modal-overlay"><form className="modal compact-modal" onSubmit={moveFile}><div className="modal-header"><h3>移动文件</h3><button type="button" className="text-button" onClick={() => setMoveDialog(null)}>关闭</button></div><p>选择“{moveDialog.file.name}”的新位置。</p><label>目标文件夹<select value={moveDialog.folder_id} onChange={event => setMoveDialog({ ...moveDialog, folder_id: event.target.value ? Number(event.target.value) : '' })}><option value="">根目录</option>{folders.filter(folder => folder.id !== moveDialog.file.folder_id).map(folder => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></label><div className="modal-actions"><button type="button" className="btn-secondary" onClick={() => setMoveDialog(null)}>取消</button><button className="btn-primary">移动</button></div></form></div>}
    {confirmDialog && <div className="modal-overlay"><div className="modal confirm-modal"><h3>删除文件</h3><p>确定删除“{confirmDialog.file.name}”吗？删除后无法恢复。</p><div className="modal-actions"><button className="btn-secondary" onClick={() => setConfirmDialog(null)}>取消</button><button className="btn-primary danger" onClick={removeFile}>删除</button></div></div></div>}
  </div>
}
