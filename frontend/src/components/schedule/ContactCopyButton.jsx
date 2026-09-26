import { useState } from 'react'

export default function ContactCopyButton({ phone, name, label }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(phone)
    } catch {
      // 降级方案
      const textarea = document.createElement('textarea')
      textarea.value = phone
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button className={`copy-btn ${copied ? 'copied' : ''}`} onClick={handleCopy}>
      {copied ? '已复制!' : (label || `📋 ${name || phone}`)}
    </button>
  )
}
