import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { IconButton, SearchInput } from './Ui'

export default function SearchBar() {
  const [keyword, setKeyword] = useState('')
  const navigate = useNavigate()
  const handleSubmit = event => {
    event.preventDefault()
    const trimmed = keyword.trim()
    if (trimmed) navigate(`/search?q=${encodeURIComponent(trimmed)}`)
  }
  return <form className="search-bar" onSubmit={handleSubmit}>
    <SearchInput placeholder="搜索日程、联系人…" value={keyword} onChange={event => setKeyword(event.target.value)} />
    <IconButton type="submit" className="search-btn" label="搜索">⌕</IconButton>
  </form>
}
