import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { deleteReviewProject, exportUrl, getReviewProject, listReviewCases } from '../api/caseReview'
import { downloadAuthorizedFile } from '../api/files'
import DailyReports from '../components/caseReview/DailyReports'
import ProjectMembers from '../components/caseReview/ProjectMembers'
import { CaseFormModal, ProjectFormModal } from '../components/caseReview/Forms'
import { STATUS_OPTIONS, StatusPill, errorText } from '../components/caseReview/common'
import { ConfirmDialog, notify } from '../components/common/Ui'
import { BackButton } from '../components/memo/MemoNav'
import MobileActionSheet from '../components/mobile/MobileActionSheet'
import { useMobileNav } from '../components/mobile/MobileNavBar'
import useIsMobile from '../hooks/useIsMobile'

const TABS = [['cases', '病历'], ['reports', '每日汇报'], ['members', '成员']]

// 项目页：病历、每日汇报、成员三栏（当前栏记在网址里，返回时不丢）
export default function CaseReviewProjectPage() {
  const { projectId } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = TABS.some(([key]) => key === searchParams.get('tab')) ? searchParams.get('tab') : 'cases'
  const isMobile = useIsMobile()
  const navigate = useNavigate()
  const [project, setProject] = useState(null)
  const [cases, setCases] = useState([])
  const [status, setStatus] = useState('')
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  const [caseForm, setCaseForm] = useState(false)
  const [projectForm, setProjectForm] = useState(false)
  const [composerOpen, setComposerOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const loadProject = useCallback(() => getReviewProject(projectId).then(setProject).catch(err => setError(errorText(err, '项目不存在，或你不是项目成员'))), [projectId])
  const loadCases = useCallback(() => listReviewCases(projectId).then(setCases).catch(() => {}), [projectId])
  useEffect(() => { loadProject(); loadCases() }, [loadProject, loadCases])

  const switchTab = key => setSearchParams(key === 'cases' ? {} : { tab: key }, { replace: true })
  const exportCases = () => downloadAuthorizedFile(exportUrl(projectId), `病历审阅_${project?.name || projectId}.csv`, { timeout: 0 }).catch(err => notify(errorText(err, '导出失败')))
  const removeProject = async () => {
    setConfirmDelete(false)
    try {
      await deleteReviewProject(projectId)
      navigate('/case-review', { replace: true })
    } catch (err) {
      notify(errorText(err, '删除失败'))
    }
  }
  const onAdd = tab === 'cases' ? () => setCaseForm(true) : tab === 'reports' ? () => setComposerOpen(true) : project?.can_manage ? () => setPickerOpen(true) : undefined
  const addLabel = { cases: '新建病历', reports: '写汇报', members: '添加成员' }[tab]
  useMobileNav({ title: project?.name || '项目', onAdd, addLabel, rightLabel: project ? '···' : null, onRight: () => setMenuOpen(true) })

  const counts = useMemo(() => {
    const result = { '': cases.length }
    cases.forEach(item => { result[item.status] = (result[item.status] || 0) + 1 })
    return result
  }, [cases])
  const visibleCases = useMemo(() => {
    const keyword = query.trim()
    return cases.filter(item => (!status || item.status === status) && (!keyword || item.code.includes(keyword) || (item.title || '').includes(keyword)))
  }, [cases, status, query])

  if (error) return <div className="memo-page"><BackButton fallback="/case-review" /><div className="error-message">{error}</div></div>
  if (!project) return <div className="memo-page"><div className="cr-muted">加载中…</div></div>

  const menuActions = [
    { label: '导出结论表格', onClick: exportCases },
    ...(project.can_manage ? [{ label: '编辑项目', onClick: () => setProjectForm(true) }, { label: '删除项目', danger: true, onClick: () => setConfirmDelete(true) }] : []),
  ]
  return <div className="memo-page cr-project">
    {!isMobile && <>
      <BackButton fallback="/case-review" />
      <div className="memo-header"><div><h2>{project.name}</h2><p>{project.description || '暂无说明'}</p></div>
        <div className="cr-header-actions">{menuActions.map(action => <button type="button" key={action.label} className={action.danger ? 'btn-secondary cr-danger' : 'btn-secondary'} onClick={action.onClick}>{action.label}</button>)}</div>
      </div>
    </>}
    <div className="cr-tabs" role="tablist">
      {TABS.map(([key, label]) => <button type="button" role="tab" key={key} aria-selected={tab === key} className={tab === key ? 'is-active' : ''} onClick={() => switchTab(key)}>{label}{key === 'cases' ? ` ${cases.length}` : key === 'members' ? ` ${project.members.length}` : ''}</button>)}
    </div>

    {tab === 'cases' && <div className="cr-cases">
      <div className="cr-case-toolbar">
        <div className="cr-status-filter">{STATUS_OPTIONS.map(([key, label]) => <button type="button" key={key || 'all'} className={status === key ? 'is-active' : ''} onClick={() => setStatus(key)}>{label}<span>{counts[key] || 0}</span></button>)}</div>
        <input className="cr-case-search" value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索编号或标题" />
        <button type="button" className="btn-primary cr-desktop-only" onClick={() => setCaseForm(true)}>新建病历</button>
      </div>
      {!cases.length && <div className="empty-state cr-empty">还没有病历。{isMobile ? '点右上角「＋」' : '点「新建病历」'}添加，并上传病历 PDF。</div>}
      {cases.length > 0 && !visibleCases.length && <div className="empty-state-small">没有符合条件的病历</div>}
      <div className="cr-case-list">
        {visibleCases.map(item => <Link key={item.id} to={`/case-review/${projectId}/cases/${item.id}`} className="cr-case-row">
          <div className="cr-case-main">
            <div className="cr-case-title"><strong>{item.code}</strong>{item.title && <span>{item.title}</span>}</div>
            <div className="cr-case-meta">审阅人：{item.reviewer?.nickname || '未指派'} · PDF {item.file_count} · 批注 {item.annotation_count}</div>
            {item.conclusion?.diagnosis && <div className="cr-case-diagnosis">病因诊断：{item.conclusion.diagnosis}</div>}
          </div>
          <StatusPill status={item.status} label={item.status_label} />
        </Link>)}
      </div>
    </div>}
    {tab === 'reports' && <DailyReports projectId={project.id} composerOpen={composerOpen} onComposerClose={() => setComposerOpen(false)} />}
    {tab === 'members' && <ProjectMembers project={project} onChanged={() => { loadProject(); loadCases() }} pickerOpen={pickerOpen} onPickerClose={() => setPickerOpen(false)} />}

    {caseForm && <CaseFormModal projectId={project.id} members={project.members} onClose={() => setCaseForm(false)} onSaved={id => navigate(`/case-review/${project.id}/cases/${id}`)} />}
    {projectForm && <ProjectFormModal project={project} onClose={() => setProjectForm(false)} onSaved={() => { setProjectForm(false); loadProject() }} />}
    {menuOpen && <MobileActionSheet title={project.name} actions={menuActions} onClose={() => setMenuOpen(false)} />}
    <ConfirmDialog open={confirmDelete} danger title="删除项目" message={`删除「${project.name}」会同时删除其中全部病历、PDF、批注、结论和每日汇报，无法恢复。`} confirmText="删除" onConfirm={removeProject} onCancel={() => setConfirmDelete(false)} />
  </div>
}
