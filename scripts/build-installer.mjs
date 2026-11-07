// Builds a single MoreCode-Setup-<version>.exe:
//   1. electron-vite build (typecheck + bundle)
//   2. electron-builder --dir  -> dist/win-unpacked
//   3. Inno Setup compiles installer.iss -> dist/MoreCode-Setup-<version>.exe
//   4. removes intermediate build output so dist/ holds only the setup file
// Flags: --skip-build (reuse out/), --repack (force re-run of electron-builder)
import { execSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync, statSync, readdirSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const dist = join(root, 'dist')
const unpacked = join(dist, 'win-unpacked')
const run = (cmd) => execSync(cmd, { cwd: root, stdio: 'inherit' })

function findISCC() {
  const candidates = [
    process.env.ISCC_PATH,
    join(process.env.LOCALAPPDATA || '', 'Programs', 'Inno Setup 6', 'ISCC.exe'),
    'C:\\Program Files (x86)\\Inno Setup 6\\ISCC.exe',
    'C:\\Program Files\\Inno Setup 6\\ISCC.exe'
  ].filter(Boolean)
  for (const p of candidates) if (existsSync(p)) return p
  try {
    const out = execSync('where ISCC.exe', { stdio: 'pipe' }).toString().trim()
    if (out) return out.split(/\r?\n/)[0]
  } catch {}
  return null
}

console.log(`=== MoreCode Installer Builder (v${version}) ===\n`)

for (const f of ['build/icon.ico', 'build/setup.ico', 'build/setup-wizard.png']) {
  if (!existsSync(join(root, f))) {
    console.error(`ERROR: ${f} is missing (needed by installer.iss).`)
    process.exit(1)
  }
}

const iscc = findISCC()
if (!iscc) {
  console.error('ERROR: Inno Setup compiler (ISCC.exe) not found. Install Inno Setup 6 or set ISCC_PATH.')
  process.exit(1)
}

const skipBuild = process.argv.includes('--skip-build')
if (!skipBuild || process.argv.includes('--repack') || !existsSync(unpacked)) {
  console.log('[1/3] Building and packaging app (electron-builder --dir)...')
  if (!skipBuild) run('npm run build')
  rmSync(unpacked, { recursive: true, force: true })
  run('npx electron-builder --win --dir')
} else {
  console.log('[1/3] Reusing existing dist/win-unpacked.')
}

console.log('[2/3] Compiling installer with Inno Setup...')
run(`"${iscc}" /DMyAppVersion=${version} "${join(root, 'installer.iss')}"`)

console.log('[3/3] Cleaning intermediate build artifacts...')
for (const entry of readdirSync(dist)) {
  if (/^MoreCode-Setup-.*\.exe$/.test(entry)) continue
  try { rmSync(join(dist, entry), { recursive: true, force: true }) } catch (e) {
    console.warn(`Could not remove dist/${entry}: ${e.message}`)
  }
}

const out = join(dist, `MoreCode-Setup-${version}.exe`)
if (existsSync(out)) {
  const mb = (statSync(out).size / 1024 / 1024).toFixed(2)
  console.log(`\nSUCCESS: ${out} (${mb} MB)\n`)
} else {
  console.error('Warning: compile finished but installer was not found.')
  process.exit(1)
}
