import { Link } from 'react-router-dom'
import { BackButton } from '../components/memo/MemoNav'

export default function TeamMemoPage() {
  return <div className="memo-page">
    <BackButton fallback="/profile/memos" />
    <div className="memo-header"><div><h2>团队群聊备忘录</h2><p>按群聊聚合协作信息，并可在各分区独立筛选。</p></div></div>
    <div className="memo-space-grid">
      <Link className="memo-space-card" to="/profile/memos/team/announcements"><h3>群公告</h3><p>按群聊和时间查看团队公告。</p><span>查看群公告 →</span></Link>
      <Link className="memo-space-card" to="/profile/memos/team/todos"><h3>群待办</h3><p>按群聊、时间和完成状态筛选待办。</p><span>查看群待办 →</span></Link>
      <Link className="memo-space-card" to="/profile/memos/team/shared-files"><h3>群共享文件</h3><p>按群聊、时间和文件类型查找资料。</p><span>查看群文件 →</span></Link>
    </div>
  </div>
}
