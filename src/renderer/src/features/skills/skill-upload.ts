import { slugify, type Skill, type SkillCategory } from './skills-data'

const TEXT_EXT = /\.(md|mdx|json|ya?ml|txt|ts|tsx|js|jsx|mjs|py|sh|sql|css|html|toml)$/i

function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw.trim())
  if (!m) return { meta: {}, body: raw }
  const meta: Record<string, string> = {}
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([a-zA-Z0-9_-]+)\s*:\s*(.+)$/.exec(line.trim())
    if (kv) meta[kv[1].toLowerCase()] = kv[2].replace(/^['"]|['"]$/g, '').trim()
  }
  return { meta, body: m[2].trim() }
}

async function inflateRaw(compressed: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate-raw')
  const writer = ds.writable.getWriter()
  void writer.write(compressed as unknown as BufferSource)
  void writer.close()
  const reader = ds.readable.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) {
      chunks.push(value)
      total += value.byteLength
    }
  }
  const out = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.byteLength
  }
  return out
}

/** Extracts text files from a standard .zip archive using Chromium's built-in DecompressionStream. */
export async function extractZipFiles(file: File): Promise<Record<string, string>> {
  const buf = await file.arrayBuffer()
  const view = new DataView(buf)
  const bytes = new Uint8Array(buf)
  const decoder = new TextDecoder('utf-8')
  const out: Record<string, string> = {}

  // Find End of Central Directory (EOCD) signature 0x06054b50
  let eocd = -1
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error('Invalid ZIP archive')

  const totalEntries = view.getUint16(eocd + 10, true)
  let cdOffset = view.getUint32(eocd + 16, true)

  const rawPaths: { path: string; content: string }[] = []

  for (let i = 0; i < totalEntries && cdOffset + 46 <= bytes.length; i++) {
    if (view.getUint32(cdOffset, true) !== 0x02014b50) break
    const method = view.getUint16(cdOffset + 10, true)
    const compSize = view.getUint32(cdOffset + 20, true)
    const uncompSize = view.getUint32(cdOffset + 24, true)
    const nameLen = view.getUint16(cdOffset + 28, true)
    const extraLen = view.getUint16(cdOffset + 30, true)
    const commentLen = view.getUint16(cdOffset + 32, true)
    const localHeaderOffset = view.getUint32(cdOffset + 42, true)

    const rawName = decoder.decode(bytes.subarray(cdOffset + 46, cdOffset + 46 + nameLen))
    cdOffset += 46 + nameLen + extraLen + commentLen

    if (
      rawName.endsWith('/') ||
      rawName.includes('__MACOSX') ||
      rawName.split('/').some((p) => p === '.DS_Store' || p === 'node_modules' || p === '.git') ||
      !TEXT_EXT.test(rawName) ||
      uncompSize > 512_000
    ) {
      continue
    }

    if (view.getUint32(localHeaderOffset, true) !== 0x04034b50) continue
    const localNameLen = view.getUint16(localHeaderOffset + 26, true)
    const localExtraLen = view.getUint16(localHeaderOffset + 28, true)
    const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen
    const slice = bytes.subarray(dataStart, dataStart + compSize)

    let data: Uint8Array
    if (method === 0) {
      data = slice
    } else if (method === 8) {
      data = await inflateRaw(slice)
    } else {
      continue
    }

    rawPaths.push({ path: rawName.replace(/^\/+/, ''), content: decoder.decode(data) })
  }

  // Strip shared top-level wrapper folder if every file sits inside one root directory
  const firstSegs = new Set(
    rawPaths.map((entry) => (entry.path.includes('/') ? entry.path.split('/')[0] : ''))
  )
  const stripPrefix =
    firstSegs.size === 1 && ![...firstSegs][0].startsWith('.') && [...firstSegs][0] !== 'skills'
      ? `${[...firstSegs][0]}/`
      : ''

  for (const entry of rawPaths) {
    const clean = stripPrefix && entry.path.startsWith(stripPrefix)
      ? entry.path.slice(stripPrefix.length)
      : entry.path
    if (clean) out[clean] = entry.content
  }
  return out
}

/** Build a Skill object from a map of relative file paths to file contents (from a .zip, folder, or single file). */
export function buildSkillFromBundle(
  bundle: Record<string, string>,
  fallbackName: string,
  takenIds: string[]
): Skill {
  const paths = Object.keys(bundle).sort()
  if (paths.length === 0) {
    throw new Error('No readable skill files (.md, .json, .yaml, .txt) found.')
  }

  let name = fallbackName.replace(/\.(zip|md|json|skill)$/i, '').replace(/[-_]+/g, ' ').trim()
  let description = ''
  let version = '1.0.0'
  let author = 'You'
  let icon = 'package'
  const category: SkillCategory = 'Quality'

  // 1. Check plugin.json / skill.json / manifest.json if present
  const manifestPath = paths.find((p) => /(?:^|\/)(plugin|skill|manifest|package)\.json$/i.test(p))
  if (manifestPath) {
    try {
      const parsed = JSON.parse(bundle[manifestPath]) as Record<string, unknown>
      if (typeof parsed.name === 'string' && parsed.name.trim()) name = parsed.name.trim()
      if (typeof parsed.description === 'string' && parsed.description.trim()) {
        description = parsed.description.trim()
      }
      if (typeof parsed.version === 'string' && parsed.version.trim()) version = parsed.version.trim()
      if (typeof parsed.author === 'string' && parsed.author.trim()) author = parsed.author.trim()
      else if (parsed.author && typeof (parsed.author as { name?: string }).name === 'string') {
        author = (parsed.author as { name: string }).name
      }
    } catch {
      /* ignore invalid JSON */
    }
  }

  // 2. Check SKILL.md or README.md frontmatter and body
  const skillMdPath =
    paths.find((p) => /(?:^|\/)SKILL\.md$/i.test(p)) ??
    paths.find((p) => /(?:^|\/)README\.md$/i.test(p)) ??
    paths.find((p) => /\.md$/i.test(p))

  let instructions = ''
  if (skillMdPath) {
    const { meta, body } = parseFrontmatter(bundle[skillMdPath])
    if (meta.name) name = meta.name
    if (meta.description && !description) description = meta.description
    if (meta.version) version = meta.version
    if (meta.author) author = meta.author
    if (meta.icon) icon = meta.icon
    instructions = body || bundle[skillMdPath]
    if (!description) {
      const firstPara = body
        .split(/\r?\n/)
        .map((l) => l.trim())
        .find((l) => l && !l.startsWith('#') && !l.startsWith('```'))
      if (firstPara) description = firstPara.slice(0, 140)
    }
  } else {
    instructions = paths.map((p) => `# ${p}\n${bundle[p]}`).join('\n\n')
  }

  // Collect all sub-skill instructions if this is a multi-skill bundle
  const subSkillPaths = paths.filter((p) => /skills\/[^/]+\/SKILL\.md$/i.test(p))
  if (subSkillPaths.length > 1) {
    instructions = subSkillPaths
      .map((p) => {
        const subName = p.split('/')[1]
        const { body } = parseFrontmatter(bundle[p])
        return `## ${subName}\n${body.trim()}`
      })
      .join('\n\n')
  }

  // Ensure a plugin.json exists in the bundle so the file tree always has a manifest
  const baseSlug = slugify(name || 'custom-skill') || 'custom-skill'
  let id = baseSlug
  let counter = 2
  while (takenIds.includes(id)) {
    id = `${baseSlug}-${counter++}`
  }

  const normalizedBundle: Record<string, string> = { ...bundle }
  if (!manifestPath) {
    normalizedBundle['.claude-plugin/plugin.json'] = JSON.stringify(
      {
        name: id,
        title: name || id,
        version,
        author,
        description: description || 'Uploaded skill package.'
      },
      null,
      2
    )
  }

  const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

  return {
    id,
    name: name || id,
    description: description || 'Uploaded skill package.',
    instructions: instructions.trim() || 'Follow the instructions in this skill package.',
    example: `Apply the ${name || id} skill to this project`,
    category,
    icon,
    triggers: [id],
    files: paths,
    source: 'custom',
    author,
    version,
    updatedAt: today,
    bundle: normalizedBundle
  }
}

/** Parse one or more uploaded File objects (.zip, .md, .json, or folder files) into a Skill. */
export async function parseUploadedSkillFiles(
  fileList: FileList | File[],
  takenIds: string[]
): Promise<Skill> {
  const files = Array.from(fileList)
  if (files.length === 0) throw new Error('No file selected.')

  // Single .zip archive
  if (files.length === 1 && /\.zip$/i.test(files[0].name)) {
    const bundle = await extractZipFiles(files[0])
    return buildSkillFromBundle(bundle, files[0].name, takenIds)
  }

  // Single .md or .json file
  if (files.length === 1) {
    const f = files[0]
    const text = await f.text()
    const baseName = f.name.replace(/\.(md|json|txt)$/i, '')
    const slug = slugify(baseName === 'SKILL' || baseName === 'README' ? 'custom-skill' : baseName) || 'custom-skill'
    const bundle: Record<string, string> = /\.json$/i.test(f.name)
      ? { '.claude-plugin/plugin.json': text }
      : {
          'README.md': text,
          [`skills/${slug}/SKILL.md`]: text
        }
    return buildSkillFromBundle(bundle, slug, takenIds)
  }

  // Multiple files or a directory upload (webkitRelativePath)
  const bundle: Record<string, string> = {}
  let rootFolder = 'uploaded-skill'
  for (const f of files) {
    if (!TEXT_EXT.test(f.name) || f.size > 512_000) continue
    const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name
    const parts = rel.split('/').filter(Boolean)
    if (parts.length > 1) rootFolder = parts[0]
    const cleanPath = parts.length > 1 ? parts.slice(1).join('/') : f.name
    if (
      cleanPath.includes('__MACOSX') ||
      cleanPath.split('/').some((p) => p === '.DS_Store' || p === 'node_modules' || p === '.git')
    ) {
      continue
    }
    bundle[cleanPath] = await f.text()
  }
  return buildSkillFromBundle(bundle, rootFolder, takenIds)
}

