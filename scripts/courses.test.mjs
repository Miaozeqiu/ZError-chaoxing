import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'

const manifest = JSON.parse(await readFile(new URL('../dist/script-manifest.json', import.meta.url)))
const bundle = manifest.bundles.courses
const code = await readFile(new URL(bundle.url, new URL('../dist/script-manifest.json', import.meta.url)), 'utf8')
const homework = manifest.bundles.homework
const homeworkCode = await readFile(new URL(homework.url, new URL('../dist/script-manifest.json', import.meta.url)), 'utf8')
const courses = [
  { id: 1, title: '计算机基础' }, { id: 2, title: '计算机基础（实践）' },
  { id: 3, title: '大学英语', teacher: '陈老师' }, { id: 4, title: '大学英语', teacher: '李老师' },
]
const run = (operation, query, teacher) => JSON.parse(runInNewContext(`${code}\nJSON.stringify(ZErrorSiteScript.run(input))`, { input: { operation, query, teacher, courses } }))

test('publishes a verified browser-consumable bundle', () => {
  assert.equal(manifest.siteId, 'chaoxing')
  assert.equal(manifest.apiVersion, 1)
  assert.equal(createHash('sha256').update(code).digest('hex'), bundle.sha256)
  assert.equal(createHash('sha256').update(homeworkCode).digest('hex'), homework.sha256)
})

test('homework selects a unique assignment title and returns all duplicate candidates', () => {
  const assignments = [{ id: 0, title: '实验作业' }, { id: 1, title: '实验作业（补交）' }, { id: 2, title: '复习作业' }, { id: 3, title: '复习作业' }]
  const runHomework = (operation, query) => JSON.parse(runInNewContext(`${homeworkCode}\nJSON.stringify(ZErrorSiteScript.run(input))`, {
    input: { operation, query, assignments },
  }))
  assert.deepEqual(runHomework('list', ''), { ids: [0, 1, 2, 3] })
  assert.deepEqual(runHomework('open', '实验 作业'), { ids: [0], selected: 0 })
  assert.deepEqual(runHomework('open', '复习作业'), { ids: [2, 3] })
})
test('lists courses, prioritizes exact names, and opens a unique partial match', () => {
  assert.deepEqual(run('list'), { ids: [1, 2, 3, 4] })
  assert.deepEqual(run('open', '计算机 基础'), { ids: [1], selected: 1 })
  assert.deepEqual(run('open', '实践'), { ids: [2], selected: 2 })
})
test('does not select a course for duplicate titles, missing titles, or empty input', () => {
  assert.deepEqual(run('open', '大学英语'), { ids: [3, 4] })
  assert.deepEqual(run('open', '大学英语', '陈老师'), { ids: [3], selected: 3 })
  assert.deepEqual(run('open', '世界历史'), { ids: [] })
  assert.deepEqual(run('open', ' '), { ids: [1, 2, 3, 4] })
})

test('homework accepts only agreeing, unambiguous exact answers for current controls', () => {
  const options = [{ label: 'A', text: '乙' }, { label: 'B', text: '甲' }, { label: 'C', text: '丙' }]
  const q = (id, type, matches, extra) => ({ id, type, options, blankCount: 0, matches: matches.map((answer, i) => ({ id: i + 1, answer })), ...extra })
  const questions = [
    q('reordered', 'single', ['甲']),
    q('agree', 'multiple', ['甲###乙', '乙###甲']),
    q('conflict', 'single', ['甲', '乙']),
    q('duplicate', 'single', ['甲'], { options: [...options, { label: 'D', text: '甲' }] }),
    q('miss', 'single', []),
    q('not-a-letter-guess', 'single', ['B']),
    q('boolean', 'judgement', ['false'], { options: [{ label: 'A', text: '错误' }, { label: 'B', text: '正确' }] }),
    q('blanks', 'completion', ['第一###第二'], { options: [], blankCount: 2 }),
    q('blank-gap', 'completion', ['###第二'], { options: [], blankCount: 2 }),
  ]
  const result = JSON.parse(runInNewContext(homeworkCode + '\nJSON.stringify(ZErrorSiteScript.run(input))', {
    input: { operation: 'resolve_answers', questions },
  }))
  assert.deepEqual(result.decisions, [
    { id: 'reordered', status: 'ready', bankId: 1, choices: ['B'] },
    { id: 'agree', status: 'ready', bankId: 1, choices: ['A', 'B'] },
    { id: 'conflict', status: 'conflict' },
    { id: 'duplicate', status: 'unmatched' },
    { id: 'miss', status: 'no_match' },
    { id: 'not-a-letter-guess', status: 'unmatched' },
    { id: 'boolean', status: 'ready', bankId: 1, choices: ['A'] },
    { id: 'blanks', status: 'ready', bankId: 1, blanks: ['第一', '第二'] },
    { id: 'blank-gap', status: 'unmatched' },
  ])
})
