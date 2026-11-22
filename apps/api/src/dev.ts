import { createServer } from 'node:http'
import app from './app.ts'

// Local only: Node's http server in front of the Hono app (Vercel runs it itself).
const port = Number(process.env.PORT ?? 8787)
createServer(async (req, res) => {
  const body = ['GET', 'HEAD'].includes(req.method ?? '')
    ? undefined
    : await new Response(req as unknown as ReadableStream).arrayBuffer()
  const response = await app.fetch(
    new Request(`http://localhost:${port}${req.url}`, {
      method: req.method,
      headers: req.headers as Record<string, string>,
      body,
    }),
  )
  res.writeHead(response.status, Object.fromEntries(response.headers))
  res.end(Buffer.from(await response.arrayBuffer()))
}).listen(port, () => console.log(`misri-api on http://localhost:${port}`))
