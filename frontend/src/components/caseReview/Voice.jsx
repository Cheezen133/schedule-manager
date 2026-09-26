import { useEffect, useRef, useState } from 'react'
import { annotationAudioUrl } from '../../api/caseReview'
import { getAuthorizedFileBlob } from '../../api/files'
import { notify } from '../common/Ui'

const MAX_SECONDS = 300 // 单条语音最长 5 分钟，到时自动停止
// 按设备支持情况选录音格式：苹果设备只能录 mp4，安卓和电脑 Chrome 多为 webm
const RECORD_TYPES = [['audio/mp4', '.m4a'], ['audio/webm;codecs=opus', '.webm'], ['audio/webm', '.webm'], ['audio/ogg;codecs=opus', '.ogg']]
const SpeechRecognition = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null
const formatSeconds = seconds => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`

// 浏览器能录音的前提：https（或本机）加上 MediaRecorder
export const canRecord = () => Boolean(window.isSecureContext && navigator.mediaDevices?.getUserMedia && window.MediaRecorder)

// 语音转文字：用浏览器自带的语音识别，识别结果交给 onText。浏览器不支持时不显示
export function DictationButton({ onText }) {
  const [listening, setListening] = useState(false)
  const recognitionRef = useRef(null)
  useEffect(() => () => recognitionRef.current?.abort(), [])
  if (!SpeechRecognition) return null
  const start = () => {
    const recognition = new SpeechRecognition()
    recognition.lang = 'zh-CN'
    recognition.interimResults = false
    recognition.continuous = false
    recognition.onresult = event => {
      const text = Array.from(event.results).map(result => result[0].transcript).join('')
      if (text.trim()) onText(text.trim())
    }
    recognition.onerror = event => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') notify('请允许使用麦克风后重试')
      else if (event.error === 'network') notify('语音识别服务连接不上，这个浏览器暂时用不了语音转文字')
      else if (event.error !== 'no-speech' && event.error !== 'aborted') notify('语音识别失败，请重试')
    }
    recognition.onend = () => setListening(false)
    recognitionRef.current = recognition
    recognition.start()
    setListening(true)
  }
  return <button type="button" className={`cr-voice-button${listening ? ' is-active' : ''}`} onClick={listening ? () => recognitionRef.current?.stop() : start}>
    {listening ? '正在听，点击结束' : '语音转文字'}
  </button>
}

// 录音：value 为 { blob, url, duration, filename } 或 null，录好或删除时通过 onChange 通知
export function VoiceRecorder({ value, onChange }) {
  const [recording, setRecording] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const recorderRef = useRef(null)
  const timerRef = useRef(null)
  const startedRef = useRef(0)

  useEffect(() => () => {
    clearInterval(timerRef.current)
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
  }, [])
  useEffect(() => () => { if (value?.url) URL.revokeObjectURL(value.url) }, [value])

  if (!canRecord()) return <p className="cr-muted cr-voice-hint">录音需要通过 https 访问（本机测试除外），当前环境无法录音。</p>

  const stop = () => {
    clearInterval(timerRef.current)
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
  }
  const start = async () => {
    let stream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      notify('无法使用麦克风，请在浏览器设置里允许后重试')
      return
    }
    const [mimeType, ext] = RECORD_TYPES.find(([type]) => window.MediaRecorder.isTypeSupported?.(type)) || ['', '.webm']
    const recorder = new window.MediaRecorder(stream, mimeType ? { mimeType } : undefined)
    const chunks = []
    recorder.ondataavailable = event => { if (event.data.size > 0) chunks.push(event.data) }
    recorder.onstop = () => {
      stream.getTracks().forEach(track => track.stop())
      setRecording(false)
      const duration = Math.max(1, Math.round((Date.now() - startedRef.current) / 1000))
      const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || 'audio/webm' })
      if (blob.size) onChange({ blob, url: URL.createObjectURL(blob), duration, filename: `语音批注${ext}` })
    }
    recorderRef.current = recorder
    startedRef.current = Date.now()
    setSeconds(0)
    recorder.start()
    setRecording(true)
    timerRef.current = setInterval(() => {
      const elapsed = Math.round((Date.now() - startedRef.current) / 1000)
      setSeconds(elapsed)
      if (elapsed >= MAX_SECONDS) stop()
    }, 500)
  }

  if (recording) return <div className="cr-recorder"><span className="cr-recording-dot" />正在录音 {formatSeconds(seconds)}<button type="button" className="cr-voice-button is-active" onClick={stop}>停止</button></div>
  if (value) return <div className="cr-recorder"><audio controls src={value.url} /><button type="button" className="text-button cr-danger" onClick={() => onChange(null)}>删除重录</button></div>
  return <div className="cr-recorder"><button type="button" className="cr-voice-button" onClick={start}>● 录一段语音</button><span className="cr-muted">最长 5 分钟</span></div>
}

// 播放已保存的语音批注：点了才下载，避免打开页面就加载所有语音
export function VoicePlayer({ annotationId, duration }) {
  const [src, setSrc] = useState('')
  const [loading, setLoading] = useState(false)
  const audioRef = useRef(null)
  useEffect(() => () => { if (src) URL.revokeObjectURL(src) }, [src])
  const load = async event => {
    event.stopPropagation()
    setLoading(true)
    try {
      const blob = await getAuthorizedFileBlob(annotationAudioUrl(annotationId), { timeout: 0 })
      setSrc(URL.createObjectURL(blob))
      requestAnimationFrame(() => audioRef.current?.play().catch(() => {}))
    } catch {
      notify('语音加载失败')
    } finally {
      setLoading(false)
    }
  }
  if (src) return <audio ref={audioRef} className="cr-voice-audio" controls src={src} onClick={event => event.stopPropagation()} />
  return <button type="button" className="cr-voice-play" onClick={load} disabled={loading}>{loading ? '加载中…' : `▶ 语音${duration ? ` ${formatSeconds(duration)}` : ''}`}</button>
}
