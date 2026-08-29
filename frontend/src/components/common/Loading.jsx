export default function Loading({ text = '加载中...' }) {
  return (
    <div className="loading-container">
      <div style={{ textAlign: 'center' }}>
        <div className="spinner" style={{ margin: '0 auto 1rem' }}></div>
        <p style={{ color: '#6b7280', fontSize: '0.9rem' }}>{text}</p>
      </div>
    </div>
  )
}
