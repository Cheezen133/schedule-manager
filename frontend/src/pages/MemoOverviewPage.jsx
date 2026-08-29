import { Link } from 'react-router-dom'

export default function MemoOverviewPage() {
  return <div className="memo-page memo-overview-page">
    <div className="memo-header"><div><h2>备忘录</h2><p>选择要进入的备忘录空间；个人资料与群聊协作内容相互独立。</p></div></div>
    <div className="memo-space-grid">
      <Link className="memo-space-card" to="/profile/memos/personal"><span className="memo-space-icon">👤</span><h3>个人备忘录</h3><p>管理个人病例、文件夹、收藏消息和共享资料。</p><span>进入个人备忘录 →</span></Link>
      <Link className="memo-space-card" to="/profile/memos/team"><span className="memo-space-icon">👥</span><h3>团队群聊备忘录</h3><p>按群聊进入协作空间，查看公告、待办和群共享文件。</p><span>进入团队备忘录 →</span></Link>
    </div>
  </div>
}
