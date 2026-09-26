// 病历编号相关的纯函数（不含界面，便于单独测试）：
// 新建病历时默认填的下一个编号；批量导入时从文件夹路径或文件名取编号、筛掉不该上传的文件、按编号分组

// 编号按自然顺序比较：1、2、10，而不是 1、10、2
export const compareCodes = (a, b) => a.localeCompare(b, 'zh-CN', { numeric: true })

// 下一个编号：在已有编号里找末尾数字最大的一个，数字加 1，前缀和位数照旧
// （已有 1、2、10 → 11；FUO-009 → FUO-010）。没有以数字结尾的编号时返回空字符串，由用户自己填
export function nextCaseCode(codes) {
  let best = null
  for (const code of codes) {
    const match = /^(.*?)(\d+)$/.exec(code || '')
    const value = match ? Number(match[2]) : NaN
    if (!Number.isSafeInteger(value)) continue
    if (!best || value > best.value) best = { prefix: match[1], width: match[2].length, value }
  }
  return best ? best.prefix + String(best.value + 1).padStart(best.width, '0') : ''
}

// 批量导入要跳过的文件：隐藏文件和系统生成的文件夹（名字以「.」开头，如 .DS_Store、._病历.pdf；
// 苹果电脑解压留下的 __MACOSX），以及不是 PDF 的文件
export function isImportable(file, path = file.name) {
  if (path.split('/').some(part => part.startsWith('.') || part === '__MACOSX')) return false
  return /\.pdf$/i.test(file.name) || file.type === 'application/pdf'
}

// 选文件夹时，每个文件带着相对路径（如「总文件夹/123/入院记录.pdf」）：
// 放在子文件夹里的，按第一层子文件夹名算编号，子文件夹里再分层也归到这个编号；
// 直接放在所选文件夹里的，按所选文件夹名算编号（例如只选了一个患者的文件夹）
export function codeFromPath(path) {
  const parts = path.split('/').filter(Boolean)
  return (parts.length >= 3 ? parts[1] : parts[0] || '').trim()
}

// 直接选文件时，按文件名开头算编号：取第一个下划线或空格之前的部分（123_入院记录.pdf → 123）；
// 文件名里没有这两种分隔符时，整个文件名（去掉 .pdf）就是编号
export function codeFromName(name) {
  return name.replace(/\.pdf$/i, '').split(/[_＿\s]/)[0].trim()
}

// 把选中的文件整理成「每个编号一组」。byFolder：按文件夹导入（否则按文件名开头分组）。
// 返回 { groups: [{ code, items: [{ file, name }] }], ignored: 跳过的文件数 }，编号按自然顺序排，组内按文件名排。
// name 是上传后的文件名，一般就是原文件名；同一编号下不同子文件夹里有同名文件时，前面加上子文件夹名
// （检验_报告.pdf），免得后一个被当成「病历里已有同名文件」跳过
export function groupFiles(files, byFolder) {
  const byCode = new Map()
  let ignored = 0
  for (const file of files) {
    const path = byFolder ? file.webkitRelativePath || file.name : file.name
    if (!isImportable(file, path)) { ignored += 1; continue }
    const code = byFolder ? codeFromPath(path) : codeFromName(file.name)
    if (!byCode.has(code)) byCode.set(code, [])
    byCode.get(code).push({ file, path })
  }
  const groups = [...byCode].map(([code, entries]) => {
    const counts = new Map()
    entries.forEach(({ file }) => counts.set(file.name, (counts.get(file.name) || 0) + 1))
    const items = entries.map(({ file, path }) => {
      if (counts.get(file.name) < 2) return { file, name: file.name }
      const parts = path.split('/').filter(Boolean)
      const folders = parts.slice(parts.length >= 3 ? 2 : 1, -1) // 编号文件夹下面的各层子文件夹
      return { file, name: [...folders, file.name].join('_') }
    })
    items.sort((a, b) => compareCodes(a.name, b.name))
    return { code, items }
  })
  groups.sort((a, b) => compareCodes(a.code, b.code))
  return { groups, ignored }
}
