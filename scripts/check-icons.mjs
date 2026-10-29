// Lists any Hugeicons name used in src/renderer/src/components/icons.tsx that the installed
// package does not have, with the closest real names to pick from.
import { readFileSync } from 'node:fs'

const file = 'src/renderer/src/components/icons.tsx'
const used = [...new Set([...readFileSync(file, 'utf8').matchAll(/\bH\.(\w+)/g)].map((m) => m[1]))]
const H = await import('@hugeicons/core-free-icons')
const have = Object.keys(H)
const missing = used.filter((n) => !(n in H))

if (!missing.length) {
  console.log(`All ${used.length} icon names exist.`)
  process.exit(0)
}
console.log(`${missing.length} of ${used.length} names are not in the package:\n`)
for (const name of missing) {
  const stem = name.replace(/\d*Icon$/, '')
  let near = have.filter((n) => n.startsWith(stem)).slice(0, 8)
  if (!near.length) {
    // fall back to the first word of the name, e.g. "Archive" for "ArchiveRestore"
    const first = (stem.match(/^[A-Z][a-z]+/) ?? [stem])[0]
    near = have.filter((n) => n.startsWith(first)).slice(0, 8)
  }
  console.log(`${name}  ->  ${near.join(', ') || '(nothing close)'}`)
}
process.exitCode = 1
