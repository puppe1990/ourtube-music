import { cpSync, mkdirSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, resolve } from 'node:path'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const DIST = join(ROOT, '.tauri-dist')

rmSync(DIST, { recursive: true, force: true })
mkdirSync(join(DIST, 'src'), { recursive: true })
cpSync(join(ROOT, 'web'), DIST, { recursive: true })
cpSync(join(ROOT, 'src'), join(DIST, 'src'), { recursive: true })
console.log(`tauri dist ready: ${DIST}`)
