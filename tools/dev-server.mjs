import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const ROOT = process.cwd();
const PORT = process.env.PORT ?? 8080;
const CONTENT_TYPES = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };

createServer(async (req, res) => {
  const path = req.url === '/' ? '/ui/index.html' : req.url.split('?')[0];
  try {
    const body = await readFile(join(ROOT, path));
    res.writeHead(200, { 'Content-Type': CONTENT_TYPES[extname(path)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
}).listen(PORT, () => console.log(`http://localhost:${PORT}`));
