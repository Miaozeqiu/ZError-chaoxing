import { build, context } from 'esbuild'
import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const out = resolve(root, 'dist')
const skill = resolve(root, 'skills/chaoxing')
const toolsPath = resolve(root, 'site-tools/tools.json')
const publish = process.argv.includes('--publish')
const serve = process.argv.includes('--serve')
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const writeJson = async (name, data) => {
  const path = resolve(out, name)
  const temp = `${path}.${process.pid}.tmp`
  await writeFile(temp, JSON.stringify(data, null, 2) + '\n')
  await rename(temp, path)
}

const experience = async () => {
  const website = JSON.parse(await readFile(resolve(skill, 'website.json'), 'utf8'))
  const references = (await readdir(resolve(skill, 'references'))).filter(name => /^[a-z0-9-]+\.md$/.test(name)).map(name => `references/${name}`)
  const files = Object.fromEntries(await Promise.all(['SKILL.md', 'site-graph.json', ...references].map(async path => [path, await readFile(resolve(skill, path), 'utf8')])))
  const icon = { path: website.icon, dataUrl: `data:image/png;base64,${(await readFile(resolve(skill, website.icon))).toString('base64')}` }
  const tools = JSON.parse(await readFile(toolsPath, 'utf8'))
  return { revision: digest(JSON.stringify({ files, website, icon, tools })), website, files, icon, tools, scriptManifest: './script-manifest.json' }
}

const options = {
  absWorkingDir: root,
  entryPoints: { courses: 'src/courses/index.ts', homework: 'src/homework/index.ts', chapters: 'src/chapters/index.ts', login: 'src/login/index.js' },
  outdir: 'scripts',
  bundle: true,
  format: 'iife',
  globalName: 'ZErrorSiteScript',
  target: 'es2020',
  write: false,
  plugins: [{ name: 'publish-website-scripts', setup({ onEnd }) {
    onEnd(async result => {
      if (result.errors.length) return
      await mkdir(resolve(out, 'scripts'), { recursive: true })
      const bundles = Object.fromEntries(await Promise.all(result.outputFiles.map(async ({ contents, path: output }) => {
        const name = basename(output, '.js')
        const sha256 = digest(contents)
        const path = `scripts/${name}.${sha256.slice(0, 16)}.js`
        await writeFile(resolve(out, path), contents)
        return [name, { url: `./${path}`, sha256 }]
      })))
      await writeJson('experience.json', await experience())
      const revision = digest(JSON.stringify(bundles))
      await writeJson('script-manifest.json', { apiVersion: 1, siteId: 'chaoxing', revision, bundles })
      if (publish) {
        await mkdir(resolve(root, 'site-tools'), { recursive: true })
        for (const [name, bundle] of Object.entries(bundles)) {
          await writeFile(resolve(root, 'site-tools', name + '.js'), await readFile(resolve(out, bundle.url)))
        }
      }
      console.log(`Published ${Object.keys(bundles).join(', ')} ${revision.slice(0, 12)}`)
    })
  } }],
}

if (serve) {
  const builder = await context(options)
  await builder.rebuild()
  await builder.watch()
  const server = createServer(async (request, response) => {
    try {
      const path = new URL(request.url, 'http://localhost').pathname
      if (request.method !== 'GET' || !/^\/(?:experience\.json|script-manifest\.json|scripts\/(?:courses|homework|chapters|login)\.[a-f0-9]{16}\.js)$/.test(path)) {
        response.writeHead(404).end()
        return
      }
      const bytes = await readFile(resolve(out, `.${path}`))
      const etag = `"${digest(bytes)}"`
      response.setHeader('ETag', etag)
      response.setHeader('Cache-Control', path.endsWith('.js') ? 'public, max-age=31536000, immutable' : 'no-cache')
      if (request.headers['if-none-match'] === etag) response.writeHead(304).end()
      else response.writeHead(200, { 'Content-Type': path.endsWith('.json') ? 'application/json' : 'text/javascript' }).end(bytes)
    } catch {
      response.writeHead(404).end()
    }
  })
  const port = Number(process.env.ZERROR_SCRIPT_PORT || 8817)
  server.listen(port, '127.0.0.1', () => console.log(`http://127.0.0.1:${port}/experience.json`))
  server.once('error', async error => { console.error(error.message); await builder.dispose(); process.exitCode = 1 })
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { server.close(); await builder.dispose() })
} else {
  await build(options)
}
