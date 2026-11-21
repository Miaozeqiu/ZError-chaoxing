import { createHash } from 'node:crypto'
import { build, context } from 'esbuild'
import { mkdir, readFile, readdir, rename, writeFile, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'node:http'
import { automations } from '../src/runtime/rules.js'
import { tools } from '../src/runtime/tools.js'

const root = fileURLToPath(new URL('../', import.meta.url)), out = resolve(root, 'dist')
const site = 'chaoxing', skill = resolve(root, 'skills', site)
const publish = process.argv.includes('--publish'), serve = process.argv.includes('--serve')
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
let current
async function atomic(path, bytes) {
  await mkdir(resolve(path, '..'), { recursive: true })
  const temp = `${path}.${process.pid}.tmp`; await writeFile(temp, bytes); await rename(temp, path)
}
async function experience(runtime) {
  const website = JSON.parse(await readFile(resolve(skill, 'website.json'), 'utf8'))
  const refs = (await readdir(resolve(skill, 'references'))).filter(name => /^[\w-]+\.md$/.test(name)).sort().map(name => 'references/' + name)
  const paths = ['SKILL.md', 'site-graph.json', ...refs]
  const files = Object.fromEntries(await Promise.all(paths.map(async path => [path, await readFile(resolve(skill, path), 'utf8')])))
  const icon = { path: website.icon, dataUrl: 'data:image/png;base64,' + (await readFile(resolve(skill, website.icon))).toString('base64') }
  const data = { website, files, icon, runtime }
  return { ...data, revision: digest(JSON.stringify(data)) }
}
const options = {
  absWorkingDir: root, entryPoints: ['src/runtime/index.js'], bundle: true, format: 'iife', globalName: 'ZErrorSitePackage',
  // QuickJS 0.32 rejects yield* inside for-of iterator expressions; preserve the tested statement layout.
  target: 'es2020', write: false, minifyWhitespace: true, minifyIdentifiers: true, minifySyntax: false, legalComments: 'none',
  plugins: [{ name: 'runtime-artifact', setup(builder) {
    builder.onEnd(async result => {
      if (result.errors.length) return
      const code = result.outputFiles[0].text
      const runtime = { automations, apiVersion: 2, bundle: { code, sha256: digest(code) }, tools }
      if (Buffer.byteLength(code) > 256 * 1024 || Buffer.byteLength(JSON.stringify(tools)) > 64 * 1024) throw new Error('Runtime artifact exceeds host limits')
      const bytes = JSON.stringify(runtime, null, 2) + '\n'
      await mkdir(out, { recursive: true })
      await atomic(resolve(out, 'runtime.json'), bytes)
      await atomic(resolve(out, 'experience.json'), JSON.stringify(await experience(runtime), null, 2) + '\n')
      if (publish) await atomic(resolve(skill, 'runtime.json'), bytes)
      current = runtime
      console.log(`${site} host API 2 ${runtime.bundle.sha256.slice(0, 12)} (${Buffer.byteLength(code)} bytes)`)
    })
  } }],
}
// There is one runtime format. Do not leave stale v1 manifests in the HTTP output.
await rm(resolve(out, 'script-manifest.json'), { force: true })
await rm(resolve(out, 'scripts'), { force: true, recursive: true })
if (!serve) await build(options)
else {
  const builder = await context(options)
  try { await builder.rebuild(); await builder.watch() } catch (error) { await builder.dispose(); throw error }
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost')
      if (req.method !== 'GET' || !['/experience.json', '/runtime.json'].includes(url.pathname)) return res.writeHead(404).end()

      if (!current) return res.writeHead(503).end()
      // Docs are read fresh; capture one compiled runtime so each snapshot remains internally consistent.
      const runtime = current
      const bytes = JSON.stringify(url.pathname === '/runtime.json' ? runtime : await experience(runtime))
      const etag = `"${digest(bytes)}"`
      res.setHeader('ETag', etag); res.setHeader('Cache-Control', 'no-cache')
      if (req.headers['if-none-match'] === etag) return res.writeHead(304).end()
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' }).end(bytes)
    } catch { res.writeHead(500).end(JSON.stringify({ error: 'Unable to read website runtime' })) }
  })
  server.listen(Number(process.env.ZERROR_SCRIPT_PORT || 8817), '127.0.0.1', () => console.log(`http://127.0.0.1:${server.address().port}/experience.json`))
  const stop = async () => { server.close(); await builder.dispose() }
  server.once('error', async error => { console.error(error.message); await stop(); process.exitCode = 1 })
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, stop)
}
