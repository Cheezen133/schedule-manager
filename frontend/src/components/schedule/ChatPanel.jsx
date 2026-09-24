import { useState, useEffect, useRef, useCallback } from 'react'
import { getMessages, sendTextMessage, sendVoiceMessage } from '../../api/messages'
import { useAuth } from '../../contexts/AuthContext'
import { formatBeijingDate, formatBeijingTime } from '../../utils/dateTime'
import { getAuthorizedFileBlob } from '../../api/files'

function formatDate(dt) {
  return formatBeijingDate(dt)
}

function ProtectedVoice({ url }) {
  const [source, setSource] = useState('')
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let active = true
    let objectUrl = ''
    setSource(''); setFailed(false)
    getAuthorizedFileBlob(url).then(blob => {
      objectUrl = URL.createObjectURL(blob)
      if (active) setSource(objectUrl)
      else URL.revokeObjectURL(objectUrl)
    }).catch(() => { if (active) setFailed(true) })
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [url])

  if (failed) return <span style={{ color: '#dc2626' }}>语音加载失败</span>
  if (!source) return <span style={{ color: '#9ca3af' }}>语音加载中…</span>
  return <audio controls src={source} style={{ height: 28, maxWidth: '100%' }} />
}

export default function ChatPanel({ scheduleId, customerName, customerPhone }) {
  const { user } = useAuth()
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [isClient, setIsClient] = useState(false)
  const [showHistory, setShowHistory] = useState(false)

  const [recording, setRecording] = useState(false)
  const [recordTime, setRecordTime] = useState(0)
  const mediaRecorder = useRef(null)
  const chunks = useRef([])
  const timerRef = useRef(null)
  const bottomRef = useRef(null)

  const hasCustomer = !!(customerName || customerPhone)

  const loadMessages = useCallback(async (withHistory) => {
    try {
      const res = await getMessages(scheduleId, withHistory)
      setMessages(res.data || [])
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [scheduleId])

  useEffect(() => { loadMessages(showHistory) }, [loadMessages, showHistory])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const handleSendText = async () => {
    if (!text.trim() || sending) return
    setSending(true)
    try {
      await sendTextMessage(scheduleId, text.trim(), isClient ? 1 : 0)
      setText('')
      loadMessages(showHistory)
    } catch (err) {
      alert(err.userMessage ||'发送失败')
    } finally { setSending(false) }
  }

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      mediaRecorder.current = mr; chunks.current = []
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunks.current.push(e.data) }
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(chunks.current, { type: 'audio/webm' })
        if (blob.size > 0) {
          setSending(true)
          try {
            await sendVoiceMessage(scheduleId, blob, recordTime, isClient ? 1 : 0)
            loadMessages(showHistory)
          } catch (err) { alert(err.userMessage ||'语音发送失败') }
          finally { setSending(false); setRecordTime(0) }
        }
      }
      mr.start(); setRecording(true)
      timerRef.current = setInterval(() => setRecordTime((t) => t + 1), 1000)
    } catch { alert('无法访问麦克风，请检查权限') }
  }, [scheduleId, recordTime, isClient, showHistory, loadMessages])

  const stopRecording = () => {
    if (mediaRecorder.current?.state === 'recording') mediaRecorder.current.stop()
    setRecording(false)
    if (timerRef.current) clearInterval(timerRef.current)
  }

  const formatTime = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

  const grouped = {}
  messages.forEach(m => {
    const key = formatDate(m.created_at)
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(m)
  })

  return (
    <div style={{ marginTop: '1.5rem', border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ background: '#f9fafb', padding: '0.75rem 1rem', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          💬 与 {customerName || '客户'} 的沟通记录
          {customerPhone && <span style={{ fontSize: '0.8rem', color: '#6b7280', fontWeight: 400 }}>📱 {customerPhone}</span>}
        </h4>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {hasCustomer && (
            <label style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer', color: '#4f46e5' }}>
              <input type="checkbox" checked={showHistory} onChange={(e) => setShowHistory(e.target.checked)} />
              显示全部历史
            </label>
          )}
          <label style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={isClient} onChange={(e) => setIsClient(e.target.checked)} />
            标记为{customerName || '客户'}消息
          </label>
        </div>
      </div>

      {/* Messages */}
      <div style={{ height: 340, overflowY: 'auto', padding: '0.75rem', background: '#fafbfc' }}>
        {loading ? <p style={{ color: '#9ca3af', fontSize: '0.85rem', textAlign: 'center', padding: '2rem' }}>加载中...</p> :
         messages.length === 0 ? <p style={{ color: '#9ca3af', fontSize: '0.85rem', textAlign: 'center', padding: '2rem' }}>
            暂无沟通记录{hasCustomer && !showHistory && '，勾选「显示全部历史」查看过往记录'}
          </p> :
         Object.entries(grouped).map(([date, msgs]) => (
           <div key={date}>
             <div style={{ textAlign: 'center', margin: '0.75rem 0' }}>
               <span style={{ background: '#e5e7eb', color: '#6b7280', padding: '2px 10px', borderRadius: '10px', fontSize: '0.7rem' }}>
                 {date}
               </span>
             </div>
             {msgs.map((msg) => {
               const isMe = msg.sender_id === user?.id
               const isClientMsg = msg.is_from_client
               const bubbleColor = isClientMsg ? '#fef3c7' : isMe ? '#dbeafe' : '#f3f4f6'
               const isOtherSchedule = msg.schedule_id !== scheduleId

               return (
                 <div key={msg.id} style={{
                   display: 'flex', flexDirection: 'column',
                   alignItems: isClientMsg ? 'flex-start' : isMe ? 'flex-end' : 'flex-start',
                   marginBottom: '0.5rem',
                 }}>
                   {isOtherSchedule && msg.schedule_title && (
                     <div style={{ fontSize: '0.65rem', color: '#9ca3af', marginBottom: '2px', textAlign: isMe ? 'right' : 'left' }}>
                       📅 {msg.schedule_title}
                     </div>
                   )}
                   <div style={{
                     maxWidth: '75%', background: bubbleColor, opacity: isOtherSchedule ? 0.85 : 1,
                     padding: '0.5rem 0.75rem', borderRadius: '10px', fontSize: '0.85rem',
                     wordBreak: 'break-word', position: 'relative',
                   }}>
                     <div style={{ fontSize: '0.7rem', color: '#6b7280', marginBottom: '2px' }}>
                       {isClientMsg ? `👤 ${customerName || '客户'}` : msg.sender_name}
                     </div>
                     {msg.msg_type === 'voice' ? (
                       <ProtectedVoice url={msg.voice_url} />
                     ) : (
                       <span>{msg.content}</span>
                     )}
                   </div>
                   <span style={{ fontSize: '0.65rem', color: '#9ca3af', marginTop: '2px' }}>
                     {formatBeijingTime(msg.created_at)}
                     {msg.voice_duration ? ` · ${msg.voice_duration}s` : ''}
                   </span>
                 </div>
               )
             })}
           </div>
         ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ padding: '0.75rem', borderTop: '1px solid #e5e7eb', background: 'white', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <button onClick={recording ? stopRecording : startRecording} disabled={sending} title={recording ? '停止录音' : '语音输入'}
          style={{ width: 40, height: 40, borderRadius: '50%', border: 'none', background: recording ? '#dc2626' : '#f3f4f6',
            color: recording ? 'white' : '#6b7280', fontSize: '1.1rem', cursor: 'pointer',
            animation: recording ? 'pulse 1.5s infinite' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {recording ? '⏹' : '🎤'}
        </button>
        {recording ? (
          <span style={{ color: '#dc2626', fontSize: '0.9rem', fontWeight: 600 }}>🔴 录音中 {formatTime(recordTime)}</span>
        ) : (
          <>
            <input type="text" value={text} onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendText()} placeholder="输入消息..."
              style={{ flex: 1, padding: '0.5rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '20px', fontSize: '0.85rem', outline: 'none', minWidth: 0 }} />
            <button onClick={handleSendText} disabled={!text.trim() || sending}
              style={{ background: text.trim() ? '#4f46e5' : '#d1d5db', color: 'white', border: 'none', borderRadius: '50%',
                width: 40, height: 40, fontSize: '1rem', cursor: text.trim() ? 'pointer' : 'default', flexShrink: 0 }}>
              ➤
            </button>
          </>
        )}
      </div>
    </div>
  )
}
