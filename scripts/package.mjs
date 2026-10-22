import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { zipSync } from 'fflate'

const root = resolve(import.meta.dirname, '..')
const dist = join(root, 'dist')
const manifest = JSON.parse(readFileSync(join(dist, 'plugin.json'), 'utf8'))

// A fixed timestamp keeps the archive, and so its checksum, identical across rebuilds.
const mtime = new Date('2020-01-01T00:00:00Z')
const files = {}
for (const name of readdirSync(dist).sort()) {
  files[name] = [readFileSync(join(dist, name)), { mtime }]
}

const archive = zipSync(files, { level: 9 })
const target = join(root, `alethe-jev-${manifest.version}.zip`)
writeFileSync(target, archive)

const sha256 = createHash('sha256').update(archive).digest('hex')
console.log(`${target}\nsha256 ${sha256}`)
