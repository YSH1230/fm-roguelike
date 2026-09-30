import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { networkInterfaces } from 'node:os';

// 같은 와이파이에 있는 폰으로 확인할 때 쓸 주소. localhost는 이 PC에서만
// 열리니, 실제 랜(사설 IP) 주소를 찾아서 같이 보여준다.
function lanAddress() {
  for (const iface of Object.values(networkInterfaces())) {
    for (const addr of iface ?? []) {
      if (addr.family === 'IPv4' && !addr.internal) return addr.address;
    }
  }
  return null;
}

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
}).listen(PORT, () => {
  console.log(`http://localhost:${PORT}`);
  const lan = lanAddress();
  if (lan) console.log(`폰에서(같은 와이파이): http://${lan}:${PORT}`);
});
