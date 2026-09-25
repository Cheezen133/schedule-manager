import { useEffect, useState } from 'react'

// 手机端断点（与 styles/mobile.css 里的 @media 保持一致）
const MOBILE_QUERY = '(max-width: 768px)'

export default function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.matchMedia(MOBILE_QUERY).matches)
  useEffect(() => {
    const media = window.matchMedia(MOBILE_QUERY)
    const update = () => setIsMobile(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  return isMobile
}
