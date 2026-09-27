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
    // 개발 서버는 캐시를 끈다. 안 끄면 코드를 고쳐도 브라우저가 예전 화면을
    // 계속 보여줘서, 고칠 때마다 Ctrl+Shift+R을 눌러야 한다.
    res.writeHead(200, {
      'Content-Type': CONTENT_TYPES[extname(path)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
}).listen(PORT, () => console.log(`http://localhost:${PORT}`));
