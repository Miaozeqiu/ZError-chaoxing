import assert from 'node:assert/strict'
import { readFile, readdir, stat } from 'node:fs/promises'
import { dirname, resolve, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const skill = resolve(root, 'skills/chaoxing')
const inside = path => path === root || path.startsWith(`${root}${sep}`)
const walk = async dir => {
  const files = []
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const path = resolve(dir, item.name)
    assert(!item.isSymbolicLink(), `Unexpected symlink: ${relative(root, path)}`)
    if (item.isDirectory()) files.push(...await walk(path))
    else if (item.isFile()) files.push(path)
  }
  return files
}

const main = await readFile(resolve(skill, 'SKILL.md'), 'utf8')
const frontmatter = main.match(/^---\n([\s\S]*?)\n---\n/)
assert(frontmatter, 'SKILL.md needs YAML frontmatter')
assert(/^name: chaoxing$/m.test(frontmatter[1]), 'Skill name must match its directory')
assert(/^description: .+$/m.test(frontmatter[1]), 'Skill needs a description')

let links = 0
for (const path of [resolve(root, 'README.md'), ...await walk(skill)]) {
  if (!path.endsWith('.md')) continue
  const text = await readFile(path, 'utf8')
  assert(!/\[TODO:/.test(text), `Unfinished scaffold: ${relative(root, path)}`)
  for (const [, target] of text.matchAll(/\[[^\]]+\]\(([^)\s]+)\)/g)) {
    if (/^https?:\/\//.test(target) || target.startsWith('#')) continue
    const local = resolve(dirname(path), decodeURIComponent(target.split('#')[0]))
    assert(inside(local), `Link escapes repository: ${target}`)
    assert((await stat(local)).isFile(), `Missing linked file: ${target}`)
    links++
  }
}

const graph = JSON.parse(await readFile(resolve(skill, 'site-graph.json'), 'utf8'))
assert.equal(graph.id, 'chaoxing')
assert.equal(graph.host, 'chaoxing.com')
new RegExp(graph.hostPattern)
assert(Array.isArray(graph.nodes) && graph.nodes.length > 0, 'Graph needs nodes')
assert(Array.isArray(graph.edges), 'Graph needs edges')
const ids = new Set()
for (const node of graph.nodes) {
  assert(typeof node.id === 'string' && node.id && !ids.has(node.id), `Invalid or duplicate node: ${node.id}`)
  ids.add(node.id)
  assert(node.title && node.path && node.summary, `Incomplete node: ${node.id}`)
  assert(Number.isFinite(node.row) && Number.isFinite(node.col), `Invalid layout: ${node.id}`)
  assert(Array.isArray(node.patterns), `Missing patterns: ${node.id}`)
  for (const pattern of node.patterns) new RegExp(pattern)
  for (const frame of node.frames || []) for (const pattern of frame.patterns || []) new RegExp(pattern)
}
for (const edge of graph.edges) {
  assert(ids.has(edge.from) && ids.has(edge.to), `Dangling edge: ${edge.from} -> ${edge.to}`)
  assert(typeof edge.label === 'string' && edge.label.trim(), 'Edge needs a label')
}
console.log(`Validated chaoxing: ${links} local links, ${ids.size} nodes, ${graph.edges.length} edges.`)
