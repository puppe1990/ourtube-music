// Rasterizes web/icon.svg (the single source of the brand mark) into the whole
// Tauri icon set. Run with `npm run icons` on macOS; the generated files are
// committed, so CI never needs Chrome.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const SOURCE_SVG = join(ROOT, 'web', 'icon.svg')
const SOURCE_PNG = join(ROOT, 'src-tauri', 'icon-source.png')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const scratch = mkdtempSync(join(tmpdir(), 'ourtube-icons-'))
const wrapper = join(scratch, 'wrapper.html')
writeFileSync(
  wrapper,
  `<!doctype html><html><body style="margin:0;background:transparent">
     <img src="file://${SOURCE_SVG}" width="1024" height="1024" style="display:block" />
   </body></html>`,
)

execFileSync(
  CHROME,
  [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--default-background-color=00000000',
    `--screenshot=${SOURCE_PNG}`,
    '--window-size=1024,1024',
    `file://${wrapper}`,
  ],
  { stdio: 'inherit' },
)

execFileSync('npx', ['--yes', '@tauri-apps/cli@2', 'icon', SOURCE_PNG], {
  cwd: ROOT,
  stdio: 'inherit',
})

console.log(`icons regenerated from ${SOURCE_SVG}`)
