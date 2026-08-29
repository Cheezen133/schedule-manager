import { useState, useRef, useCallback } from 'react'

/**
 * 语音输入按钮 — 使用浏览器 Web Speech API
 * 支持 Chrome/Edge，点击后录音并将结果传给 onChange
 */
export default function VoiceInputButton({ onResult, label = '语音输入' }) {
  const [isListening, setIsListening] = useState(false)
  const [supported, setSupported] = useState(true)
  const recognitionRef = useRef(null)

  const startListening = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      setSupported(false)
      alert('您的浏览器不支持语音输入，请使用 Chrome 或 Edge 浏览器')
      return
    }

    const recognition = new SpeechRecognition()
    recognition.lang = 'zh-CN'
    recognition.interimResults = false
    recognition.continuous = false
    recognition.maxAlternatives = 1

    recognition.onstart = () => {
      setIsListening(true)
    }

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript
      // 去掉末尾标点
      const cleaned = transcript.replace(/[，。！？、；：""''（）]/g, '').trim()
      if (onResult && cleaned) {
        onResult(cleaned)
      }
    }

    recognition.onerror = (event) => {
      console.error('语音识别错误:', event.error)
      setIsListening(false)
      if (event.error === 'not-allowed') {
        alert('请允许麦克风权限后重试')
      }
    }

    recognition.onend = () => {
      setIsListening(false)
    }

    recognitionRef.current = recognition
    recognition.start()
  }, [onResult])

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop()
    }
    setIsListening(false)
  }, [])

  if (!supported) {
    return (
      <button type="button" title="浏览器不支持语音" disabled
        style={{
          background: 'var(--gray-200)', border: 'none', borderRadius: '6px',
          padding: '4px 8px', fontSize: '0.85rem', cursor: 'not-allowed', opacity: 0.5,
        }}>
        🎤
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={isListening ? stopListening : startListening}
      title={isListening ? '点击停止' : label}
      style={{
        background: isListening ? '#dc2626' : 'white',
        color: isListening ? 'white' : '#6b7280',
        border: `1px solid ${isListening ? '#dc2626' : '#d1d5db'}`,
        borderRadius: '6px',
        padding: '4px 10px',
        fontSize: '0.85rem',
        cursor: 'pointer',
        animation: isListening ? 'pulse 1.5s infinite' : 'none',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        transition: 'all 0.15s',
      }}
    >
      {isListening ? '🔴 录音中...' : '🎤 ' + label}
    </button>
  )
}
