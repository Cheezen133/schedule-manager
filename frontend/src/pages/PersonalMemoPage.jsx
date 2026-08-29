import { Link } from 'react-router-dom'
import { BackButton } from '../components/memo/MemoNav'

export default function PersonalMemoPage() {
  return <div className="memo-page">
    <BackButton fallback="/profile/memos" />
    <div className="memo-header"><div><h2>个人备忘录</h2><p>在独立分区中管理个人资料。</p></div></div>
    <div className="memo-space-grid">
      <Link className="memo-space-card" to="/profile/memos/personal/cases"><h3>病例</h3><p>管理病人档案、病例时间轴和自定义分组。</p><span>查看病例 →</span></Link>
      <Link className="memo-space-card" to="/profile/memos/personal/files"><h3>文件</h3><p>按 Windows 文件夹方式管理个人文件。</p><span>管理文件 →</span></Link>
      <Link className="memo-space-card" to="/profile/memos/personal/favorites"><h3>收藏夹</h3><p>搜索和分类查看已收藏聊天消息。</p><span>查看收藏 →</span></Link>
      <Link className="memo-space-card" to="/profile/memos/personal/shared-files"><h3>共享文件</h3><p>跨会话查找可访问的共享文件。</p><span>查看共享文件 →</span></Link>
    </div>
  </div>
}
