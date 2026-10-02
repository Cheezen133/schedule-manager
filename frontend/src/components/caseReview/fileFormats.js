export const CASE_FILE_EXTENSIONS = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'jpg', 'jpeg', 'png', 'txt']
export const CASE_FILE_ACCEPT = CASE_FILE_EXTENSIONS.map(extension => `.${extension}`).join(',')
export const CASE_FILE_HINT = '支持 PDF、Word、Excel、PPT、JPG/PNG 图片和 TXT'

export const fileExtension = name => /\.([^.]+)$/.exec(name || '')?.[1].toLowerCase() || ''
export const isSupportedCaseFile = file => CASE_FILE_EXTENSIONS.includes(fileExtension(file.name))
export const fileTypeLabel = file => fileExtension(file.name).toUpperCase() || '文件'
