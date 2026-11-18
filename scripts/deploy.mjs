// Copy the built site to a folder on the mounted webshare.
//
//   npm run deploy
//
// The destination comes from WEBSHARE_DIR in .env.local, for example
//   WEBSHARE_DIR=X:\path\to\share\portfolio
// Only index.html and the assets folder are written. The share's own files
// (.htaccess, .default.html) are never touched.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'

const env = existsSync('.env.local') ? readFileSync('.env.local', 'utf8') : ''
const line = env.split(/\r?\n/).find(l => l.trim().startsWith('WEBSHARE_DIR='))
const target = (process.env.WEBSHARE_DIR ?? line?.slice(line.indexOf('=') + 1) ?? '').trim().replace(/^["']|["']$/g, '')

if (!target) {
  console.error('Set WEBSHARE_DIR in .env.local to the portfolio folder on the mounted webshare.')
  process.exit(1)
}
if (!existsSync('dist/index.html')) {
  console.error('No build found. Run "npm run build" first (npm run deploy does this for you).')
  process.exit(1)
}
const parent = resolve(target, '..')
if (!existsSync(parent)) {
  console.error(`Cannot find ${parent}. Is the webshare mounted?`)
  process.exit(1)
}

mkdirSync(target, { recursive: true })
// Asset file names change with every build, so clear the old ones first.
rmSync(join(target, 'assets'), { recursive: true, force: true })
cpSync('dist/assets', join(target, 'assets'), { recursive: true })
cpSync('dist/index.html', join(target, 'index.html'))
console.log(`Deployed to ${target}`)
