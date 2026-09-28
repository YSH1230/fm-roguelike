import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const ROOT = process.cwd();
const PORT = process.env.PORT ?? 8080;
const CONTENT_TYPES = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };

createServer(async (req, res) => {
  // "/"에서 파일만 /ui/index.html로 몰래 바꿔치기하면 브라우저 URL은 여전히
  // "/"라, index.html의 상대경로(style.css 등)가 엉뚱한 곳을 가리킨다.
  // GitHub Pages는 실제로 /ui/ 아래에서 서빙되므로 로컬도 URL 자체를 옮겨야
  // 상대경로가 두 환경에서 똑같이 동작한다.
  if (req.url === '/') {
    res.writeHead(302, { Location: '/ui/' });
    res.end();
    return;
  }
  const path = req.url === '/ui/' ? '/ui/index.html' : req.url.split('?')[0];
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
