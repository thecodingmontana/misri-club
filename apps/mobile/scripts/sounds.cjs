// Records the website's interface sounds (cuelume, synthesized in the browser)
// into assets/sounds/*.wav for the app, which has no Web Audio: the same
// recipes, rendered once in headless Chromium. Run after a cuelume update:
// node scripts/sounds.cjs assets/sounds   (needs Playwright's Chromium)
const { chromium } = require('playwright')
const http = require('http'),
  fs = require('fs'),
  path = require('path')
const root = path.join(
  path.dirname(
    require.resolve('cuelume/package.json', {
      paths: [path.join(__dirname, '../../web')],
    }),
  ),
  'dist',
)
const out = process.argv[2]
const server = http
  .createServer((req, res) => {
    const p = path.join(root, req.url.split('?')[0])
    if (req.url === '/') {
      res.writeHead(200, { 'content-type': 'text/html' })
      return res.end('<html></html>')
    }
    if (!fs.existsSync(p)) {
      res.writeHead(404)
      return res.end()
    }
    res.writeHead(200, { 'content-type': 'text/javascript' })
    fs.createReadStream(p).pipe(res)
  })
  .listen(3471, async () => {
    const b = await chromium.launch()
    for (const name of [
      'tap',
      'select',
      'navigate',
      'success',
      'error',
      'warning',
    ]) {
      const pg = await b.newPage()
      pg.on('console', (m) => console.log('page:', m.text()))
      await pg.goto('http://localhost:3471/')
      const b64 = await pg.evaluate(async (name) => {
        const RATE = 44100
        let ctx
        window.AudioContext = class extends OfflineAudioContext {
          constructor() {
            super(2, RATE * 2, RATE)
            ctx = this
          }
          get state() {
            return 'running'
          }
          resume() {
            return Promise.resolve()
          }
        }
        const mod = await import(`/index.js?${name}`)
        mod.setEnabled(true)
        mod.play(name)
        await new Promise((r) => setTimeout(r, 50))
        const buf = await ctx.startRendering()
        const L = buf.getChannelData(0),
          R = buf.getChannelData(1)
        // trim the tail of silence
        let end = L.length
        while (
          end > 0 &&
          Math.abs(L[end - 1]) < 1e-4 &&
          Math.abs(R[end - 1]) < 1e-4
        )
          end--
        end = Math.min(L.length, end + Math.round(RATE * 0.02))
        const data = new DataView(new ArrayBuffer(44 + end * 4))
        const s = (o, t) => {
          for (let i = 0; i < t.length; i++)
            data.setUint8(o + i, t.charCodeAt(i))
        }
        s(0, 'RIFF')
        data.setUint32(4, 36 + end * 4, true)
        s(8, 'WAVE')
        s(12, 'fmt ')
        data.setUint32(16, 16, true)
        data.setUint16(20, 1, true)
        data.setUint16(22, 2, true)
        data.setUint32(24, RATE, true)
        data.setUint32(28, RATE * 4, true)
        data.setUint16(32, 4, true)
        data.setUint16(34, 16, true)
        s(36, 'data')
        data.setUint32(40, end * 4, true)
        for (let i = 0; i < end; i++) {
          data.setInt16(
            44 + i * 4,
            Math.max(-1, Math.min(1, L[i])) * 32767,
            true,
          )
          data.setInt16(
            46 + i * 4,
            Math.max(-1, Math.min(1, R[i])) * 32767,
            true,
          )
        }
        let bin = ''
        const bytes = new Uint8Array(data.buffer)
        for (let i = 0; i < bytes.length; i++)
          bin += String.fromCharCode(bytes[i])
        return { b64: btoa(bin), seconds: end / RATE }
      }, name)
      fs.writeFileSync(
        path.join(out, `${name}.wav`),
        Buffer.from(b64.b64, 'base64'),
      )
      console.log(name, b64.seconds.toFixed(3) + 's')
      await pg.close()
    }
    await b.close()
    server.close()
  })
