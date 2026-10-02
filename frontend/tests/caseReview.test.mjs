import assert from 'node:assert/strict'
import test from 'node:test'
import { groupFiles, codeFromName, nextCaseCode } from '../src/components/caseReview/caseCodes.js'
import { CASE_FILE_EXTENSIONS, isSupportedCaseFile } from '../src/components/caseReview/fileFormats.js'

const file = (name, path = '', type = '') => ({ name, webkitRelativePath: path, type })

test('mixed formats use the same patient number and extension allowlist', () => {
  assert.deepEqual(CASE_FILE_EXTENSIONS, ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'jpg', 'jpeg', 'png', 'txt'])
  const files = CASE_FILE_EXTENSIONS.map(ext => file(`123_材料.${ext.toUpperCase()}`, '', 'text/html'))
  const { groups, ignored } = groupFiles([...files, file('123_script.html'), file('123_no-extension', '', 'application/pdf')], false)
  assert.equal(ignored, 2)
  assert.equal(groups.length, 1)
  assert.equal(groups[0].code, '123')
  assert.equal(groups[0].items.length, CASE_FILE_EXTENSIONS.length)
  for (const item of files) assert.equal(isSupportedCaseFile(item), true)
})

test('filenames without separators drop each supported extension', () => {
  for (const ext of CASE_FILE_EXTENSIONS) assert.equal(codeFromName(`FUO-009.${ext}`), 'FUO-009')
  assert.equal(codeFromName('123＿入院记录.DOCX'), '123')
  assert.equal(codeFromName('123 入院记录.png'), '123')
  assert.equal(nextCaseCode(['FUO-009', 'FUO-010']), 'FUO-011')
})

test('folder import skips hidden/system files, sorts naturally and retains mixed files', () => {
  const files = [
    file('报告.pdf', '总文件夹/10/报告.pdf'),
    file('照片.png', '总文件夹/2/检查/照片.png'),
    file('记录.docx', '总文件夹/2/记录.docx'),
    file('.隐藏.txt', '总文件夹/2/.隐藏.txt'),
    file('报告.pdf', '总文件夹/__MACOSX/报告.pdf'),
    file('说明.txt', '总文件夹/2/.隐藏/说明.txt'),
    file('程序.exe', '总文件夹/2/程序.exe'),
  ]
  const { groups, ignored } = groupFiles(files, true)
  assert.equal(ignored, 4)
  assert.deepEqual(groups.map(group => group.code), ['2', '10'])
  assert.equal(groups[0].items.length, 2)
  assert.deepEqual(groupFiles([file('图片.JPG', '患者123/图片.JPG')], true).groups.map(group => group.code), ['患者123'])
})

test('same names in different subfolders get stable names for retry deduplication', () => {
  const files = [file('报告.docx', '总文件夹/123/入院/报告.docx'), file('报告.docx', '总文件夹/123/复查/报告.docx'), file('报告.png', '总文件夹/123/报告.png')]
  const first = groupFiles(files, true)
  const retry = groupFiles(files, true)
  assert.deepEqual(first, retry)
  const names = first.groups[0].items.map(item => item.name)
  assert.equal(new Set(names).size, 3)
  assert.ok(names.includes('入院_报告.docx'))
  assert.ok(names.includes('复查_报告.docx'))
  assert.ok(names.includes('报告.png'))
})
