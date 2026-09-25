import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { listReviewProjects } from '../api/caseReview'
import { ProjectFormModal } from '../components/caseReview/Forms'
import { errorText } from '../components/caseReview/common'
import { useMobileNav } from '../components/mobile/MobileNavBar'
import useIsMobile from '../hooks/useIsMobile'

// 病历审阅首页：我参与的项目（管理员可看到全部项目）
export default function CaseReviewHomePage() {
  const isMobile = useIsMobile()
  const navigate = useNavigate()
  const [projects, setProjects] = useState(null)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)

  const load = useCallback(() => {
    listReviewProjects().then(setProjects).catch(err => setError(errorText(err, '项目加载失败')))
  }, [])
  useEffect(() => { load() }, [load])
  useMobileNav({ title: '病历审阅', onAdd: () => setCreating(true), addLabel: '新建项目' })

  const meta = project => `成员 ${project.member_count} · 病历 ${project.case_count}`
  return <div className="memo-page cr-home">
    {!isMobile && <div className="memo-header"><div><h2>病历审阅</h2><p>上传病历 PDF，由审阅人批注并给出是否纳入与病因诊断；每日汇报记录纳入进度。</p></div><button type="button" className="btn-primary" onClick={() => setCreating(true)}>新建项目</button></div>}
    {error && <div className="error-message">{error}</div>}
    {projects && !projects.length && <div className="empty-state cr-empty">还没有项目。新建一个项目，把审阅人加为成员后，就可以上传病历了。</div>}
    {projects?.length > 0 && <div className="cr-project-list">
      {projects.map(project => <Link key={project.id} to={`/case-review/${project.id}`} className="cr-project-card">
        <div className="cr-project-main"><strong>{project.name}</strong>{project.description && <p>{project.description}</p>}<small>{meta(project)}</small></div>
        {project.waiting_count > 0 && <span className="cr-waiting-badge" title="指派给我、尚未审阅">待我审阅 {project.waiting_count}</span>}
      </Link>)}
    </div>}
    {creating && <ProjectFormModal onClose={() => setCreating(false)} onSaved={id => navigate(`/case-review/${id}`)} />}
  </div>
}
