import assert from 'node:assert/strict'
import { readFile, readdir, stat } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
for (const folder of await readdir(resolve(root, 'skills'), { withFileTypes: true })) {
  if (!folder.isDirectory()) continue
  const dir = resolve(root, 'skills', folder.name)
  const website = JSON.parse(await readFile(resolve(dir, 'website.json'), 'utf8'))
  assert.equal(website.version, 1)
  assert.equal(website.id, folder.name)
  assert(website.name && website.host && /^assets\/[a-zA-Z0-9_-]+\.(png|ico|jpe?g|webp|gif)$/.test(website.icon))
  const icon = await readFile(resolve(dir, website.icon))
  assert(icon.length && icon.length <= 256 * 1024, 'Icon must be within 256 KB')
  assert(icon.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) || icon.subarray(0,4).equals(Buffer.from([0,0,1,0])), 'Expected PNG or ICO image bytes')
  const main = await readFile(resolve(dir, 'SKILL.md'), 'utf8')
  const front = main.match(/^---\n([\s\S]*?)\n---/)
  assert(front && new RegExp(`^name: ${website.id}$`, 'm').test(front[1]) && /^description: .+$/m.test(front[1]), 'Skill frontmatter must match website id')
  const walk = async current => {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      assert(!entry.isSymbolicLink(), 'Symlinks are not supported')
      const path = resolve(current, entry.name)
      if (entry.isDirectory()) await walk(path)
      else if (path.endsWith('.md')) {
        const text = await readFile(path, 'utf8')
        for (const [, target] of text.matchAll(/\[[^\]]+\]\(([^)\s]+)\)/g)) {
          if (/^https?:\/\//.test(target) || target.startsWith('#')) continue
          const link = resolve(dirname(path), target.split('#')[0])
          assert(link.startsWith(root + '/') && (await stat(link)).isFile(), `Invalid local link: ${target}`)
        }
      }
    }
  }
  await walk(dir)
  const graph = JSON.parse(await readFile(resolve(dir, 'site-graph.json'), 'utf8'))
  assert.equal(graph.id, website.id); assert.equal(graph.host, website.host)
  new RegExp(graph.hostPattern)
  const ids = new Set()
  for (const node of graph.nodes) {
    assert(node.id && !ids.has(node.id)); ids.add(node.id)
    assert(node.title && node.path && node.summary && Number.isFinite(node.row) && Number.isFinite(node.col))
    for (const pattern of node.patterns) new RegExp(pattern)
  }
  for (const edge of graph.edges) assert(ids.has(edge.from) && ids.has(edge.to) && edge.label)
  console.log(`Validated ${website.id}: ${ids.size} nodes, ${graph.edges.length} edges, ${icon.length} icon bytes.`)
}
