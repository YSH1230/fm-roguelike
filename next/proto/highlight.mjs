// 하이라이트 프로토타입(가로 화면): 사이드 공격 한 장면 + 사이드 수비 한 장면.
// 규칙 수치는 rules.mjs의 TUNE 한 곳에서 읽는다. 공격은 오른쪽, 우리 골문은 왼쪽이다.
// 화면은 FM-Lite 디자인 규칙(어두운 면, 얇은 선, 점선, 클럽 색, 각진 토큰)을 따른다.
import {
  TUNE, aimOf, blockResult, chaserSpeed, chooseTime, clamp, diveWindow, finishBlockWindow, frontDefenderCount, gaugeAt,
  powerWindow, resolveShot, runnerSpeed, shootTime, shotFlightTime, shoulderInterval, shoulderTolerance, skillWindow, slingRange,
  widenGap,
} from './rules.mjs';

const W = 640;
const H = 360;
const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');
const overlay = document.getElementById('overlay');
const box = overlay.querySelector('.box');
const TEAM = '#ff4a1c';
const OPP = '#8d8d8d';
const WHITE = '#ffffff';
const PITCH = { x0: 14, x1: 626, y0: 32, y1: 346 };
const GY = (PITCH.y0 + PITCH.y1) / 2; // 골문 중심 높이
const px = (p) => 70 + p * 500; // 진행(0~1) → 가로 위치
const LY = (i) => 66 + i * 58; // 레인(5개) → 세로 위치
// 설계서(fm_lite_in_game_highlight_design.md) 색
const C = { grass: '#339933', stripe: '#2d882d', turf: '#246b24', crowdBg: '#080c14', aboard: '#5b111a', led: '#fde047', home: '#38bdf8', away: '#ef4444', gkHome: '#f59e0b', gkAway: '#22c55e', skin: ['#c68a68', '#d49b78'], hair: '#1a1512', ink: '#0f172a', yellow: '#fde047' };
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (list) => list[Math.floor(Math.random() * list.length)];

// 능력 슬라이더(시연용). 장면은 이 값만 읽는다.
export const stats = {
  speed: 12, dribble: 12, shooting: 12, finishing: 12, pass: 12, vision: 12, stamina: 12, tackle: 12, reaction: 12, position: 12,
  oppDef: 10, oppAtk: 10,
};
const tunebox = document.getElementById('tunebox');
for (const k of Object.keys(stats)) {
  const label = document.createElement('label');
  label.innerHTML = `<span>${k}</span><b>${stats[k]}</b><input type="range" min="0" max="20" value="${stats[k]}">`;
  label.querySelector('input').addEventListener('input', (e) => { stats[k] = Number(e.target.value); label.querySelector('b').textContent = stats[k]; });
  tunebox.appendChild(label);
}

// ---------- 손맛: 소리, 히트스톱, 흔들림, 파티클, 잔상, 팝업 ----------
let audio = null;
let soundOn = true;
function unlockAudio() {
  try { audio ??= new (window.AudioContext || window.webkitAudioContext)(); if (audio.state === 'suspended') audio.resume(); } catch { /* 소리 없이 진행 */ }
}
function tone(freq, dur = 0.08, type = 'square', vol = 0.04, to = null, delay = 0) {
  if (!soundOn || !audio) return;
  const t0 = audio.currentTime + delay;
  const o = audio.createOscillator(); const g = audio.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t0);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(audio.destination); o.start(t0); o.stop(t0 + dur + 0.02);
}
const sfx = {
  tap: () => tone(520, 0.04, 'square', 0.03),
  ok: () => { tone(660, 0.07); tone(990, 0.09, 'square', 0.04, null, 0.06); },
  perfect: () => { tone(880, 0.07); tone(1320, 0.07, 'square', 0.04, null, 0.06); tone(1760, 0.12, 'square', 0.04, null, 0.12); },
  bad: () => tone(200, 0.2, 'sawtooth', 0.05, 90),
  sprint: () => tone(300, 0.25, 'sawtooth', 0.025, 900),
  goal: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, 'square', 0.05, null, i * 0.08)); },
  save: () => { tone(330, 0.12, 'triangle', 0.06); tone(247, 0.18, 'triangle', 0.05, null, 0.08); },
};
const fx = { shake: 0, freeze: 0, flash: 0, particles: [], pops: [], trail: [] };
function burst(x, y, color, n = 18, speed = 140) {
  for (let i = 0; i < n; i++) { const a = Math.random() * 7; const v = speed * (0.4 + Math.random() * 0.8); fx.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.5 + Math.random() * 0.4, t: 0, c: color }); }
}
function pop() { /* 설계서: 플레이 화면의 글자는 스코어보드만. 팝업 글자는 쓰지 않는다 */ }
function stepFx(raw) {
  fx.shake = Math.max(0, fx.shake - raw * 30); fx.freeze = Math.max(0, fx.freeze - raw); fx.flash = Math.max(0, fx.flash - raw * 3);
  for (const p of fx.particles) { p.t += raw; p.x += p.vx * raw; p.y += p.vy * raw; p.vy += 200 * raw; }
  fx.particles = fx.particles.filter((p) => p.t < p.life);
  for (const q of fx.pops) q.t += raw;
  fx.pops = fx.pops.filter((q) => q.t < 0.9);
}
function drawFx() {
  for (const p of fx.particles) { ctx.globalAlpha = Math.max(0, 1 - p.t / p.life); ctx.fillStyle = p.c; ctx.fillRect(p.x - 2, p.y - 2, 4, 4); }
  for (const q of fx.pops) { ctx.globalAlpha = Math.max(0, 1 - q.t / 0.9); T(q.text, q.x, q.y - q.t * 30, q.size, q.color); }
  ctx.globalAlpha = 1;
}
document.addEventListener('pointerdown', unlockAudio, { passive: true });

// ---------- 카메라: 항상 전체를 보여 주지 않고, 상황에 맞는 곳으로 확대한다 ----------
const cam = { x: 320, y: GY, z: 1 };
const camT = { x: 320, y: GY, z: 1 };
const camTo = (x, y, z) => { camT.x = x; camT.y = y; camT.z = z; };
// 점들을 모두 담는 확대 배율(최대 zoom까지)
function camFit(points, { margin = 70, max = 1.8, uiBottom = 70 } = {}) {
  const xs = points.map((q) => q.x); const ys = points.map((q) => q.y);
  const x0 = Math.min(...xs) - margin; const x1 = Math.max(...xs) + margin; const y0 = Math.min(...ys) - margin; const y1 = Math.max(...ys) + margin;
  const z = clamp(Math.min(W / (x1 - x0), (H - 38 - uiBottom) / (y1 - y0)), 1, max);
  camTo((x0 + x1) / 2, (y0 + y1) / 2 - 8, z);
}
function stepCam(rdt) {
  const k = 1 - Math.exp(-rdt * 5);
  cam.x += (camT.x - cam.x) * k; cam.y += (camT.y - cam.y) * k; cam.z += (camT.z - cam.z) * k;
}
function world(fn) {
  ctx.save();
  ctx.translate(W / 2 + (Math.random() - 0.5) * fx.shake, H / 2 + (Math.random() - 0.5) * fx.shake);
  ctx.scale(cam.z, cam.z); ctx.translate(-cam.x, -cam.y);
  fn(); drawFx(); ctx.restore();
}
const toScreen = (x, y) => ({ x: (x - cam.x) * cam.z + W / 2, y: (y - cam.y) * cam.z + H / 2 });
// 처음 3장면은 제한 시간과 박자 여유를 1.5배로 주고 손가락 안내를 보여 준다(문서의 튜토리얼 규칙)
const plays = { total: 0 };
const easyNow = () => (plays.total <= 3 ? 1.5 : 1);
// 손가락 안내: 점이 방향대로 반복해서 미끄러진다
function finger(sx, sy, dx, dy, label) {
  const k = (performance.now() / 900) % 1;
  const x = sx + dx * k; const y = sy + dy * k;
  ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 2; ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + dx, sy + dy); ctx.stroke(); ctx.setLineDash([]);
  ctx.globalAlpha = 1 - Math.abs(k - 0.5) * 0.8; ctx.fillStyle = WHITE; ctx.beginPath(); ctx.arc(x, y, 9, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
}
function pulse(sx, sy, r, label) {
  const k = (performance.now() / 700) % 1;
  ctx.strokeStyle = `rgba(255,210,74,${1 - k})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(sx, sy, r + k * 18, 0, 7); ctx.stroke();
}
function arcRing(x, y, r, frac, color) { if (frac <= 0) return; ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, frac)); ctx.stroke(); }
const toWorld = (p) => ({ x: (p.x - W / 2) / cam.z + cam.x, y: (p.y - H / 2) / cam.z + cam.y });

let scene = null;
let last = 0;
let timeScale = 1;
let paused = false;
const hud = { me: 0, opp: 0, no: 1, banner: '', clock: '45:00' };
let intro = null; // 장면 시작 전 안내: { t, kind, clock }
let ghost = null; // 결과가 나온 뒤에도 마지막 장면 모습을 남겨 둔다

// ---------- 입력: 탭, 더블탭, 스와이프, 당기기 ----------
const toLocal = (e) => {
  const r = cv.getBoundingClientRect();
  return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
};
let down = null;
let pendingTap = null;
cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); if (intro) { if (intro.t > 0.7) intro = null; return; } down = toLocal(e); scene?.onDown?.(down); });
cv.addEventListener('pointermove', (e) => { if (down && !intro) scene?.onMove?.(toLocal(e), down); });
cv.addEventListener('pointerup', (e) => {
  if (!down) return;
  const p = toLocal(e);
  const dx = p.x - down.x;
  const dy = p.y - down.y;
  const d0 = down;
  down = null;
  scene?.onUp?.(p, d0);
  if (Math.abs(dx) > 22 || Math.abs(dy) > 22) {
    const g = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'swipeRight' : 'swipeLeft') : (dy > 0 ? 'swipeDown' : 'swipeUp');
    clearTimeout(pendingTap?.timer); pendingTap = null;
    scene?.onGesture?.({ type: g, x: p.x, y: p.y, dx, dy });
    return;
  }
  // 탭과 더블탭: 첫 탭 뒤 짧게 기다려 두 번째 탭이 오면 더블탭으로 본다
  if (scene?.wantsDoubleTap && pendingTap) {
    clearTimeout(pendingTap.timer); pendingTap = null;
    scene.onGesture({ type: 'dtap', x: p.x, y: p.y });
  } else if (scene?.wantsDoubleTap) {
    pendingTap = { timer: setTimeout(() => { pendingTap = null; scene?.onGesture?.({ type: 'tap', x: p.x, y: p.y }); }, 230) };
  } else {
    scene?.onGesture?.({ type: 'tap', x: p.x, y: p.y });
  }
});

// ---------- 그리기 도우미(FM-Lite 평면 스타일) ----------
const FONT = '"Barlow Condensed", "Pretendard Variable", sans-serif';
const T = (t, x, y, size = 14, color = WHITE, align = 'center') => {
  ctx.fillStyle = color; ctx.font = `800 ${size}px ${FONT}`; ctx.textAlign = align; ctx.fillText(t, x, y);
};
function line(x0, y0, x1, y1, color, w = 1, dash = null) {
  ctx.strokeStyle = color; ctx.lineWidth = w; ctx.setLineDash(dash ?? []); ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); ctx.setLineDash([]);
}
// 슬링샷 패스 궤적: 공에서 낙구 지점까지 노란 점선 곡선, 낙구 지점에 펄스 링 (설계서 6.2)
function route(x0, y0, x1, y1, color = C.yellow) {
  const mx = (x0 + x1) / 2; const my = Math.min(y0, y1) - Math.abs(x1 - x0) * 0.18 - 10;
  ctx.strokeStyle = color; ctx.lineWidth = 1.6; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(mx, my, x1, y1); ctx.stroke(); ctx.setLineDash([]);
  const k = (performance.now() / 800) % 1;
  ctx.strokeStyle = color; ctx.globalAlpha = 1 - k; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x1, y1, 5 + k * 9, 0, 7); ctx.stroke(); ctx.globalAlpha = 1;
  ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x1, y1, 2, 0, 7); ctx.fill();
}

// 선수 스프라이트(설계서 5.1): 16x26 도트, 2등신, 얼굴·팔 없음, 등번호, 흰 웨이스트 밴드, 발밑 그림자
// 장면에서 많이 보이도록 작게 그리고(SPR), 달리기·서 있기·태클로 넘어짐·킥 포즈를 그린다.
const SPR = 1.0;
const NUM = { MF: 8, WG: 7, WB: 2, ST: 9, GK: 1, ATK: 11 };
function sprite(x, y, kit, { num = '', ring = null, dim = false, skin = 0, anim = null, lay = 0, kick = false } = {}) {
  const u = SPR; const t = performance.now() / 1000;
  let bob = 0; let legA = 0;
  if (anim === 'run') { const w = t * 12 + x * 0.07; bob = -Math.abs(Math.sin(w)) * 1.5; legA = Math.sin(w); }
  else if (anim === 'idle') { const w = t * 3 + x * 0.05; bob = -Math.abs(Math.sin(w)) * 0.5; legA = Math.sin(w) * 0.3; }
  const foot = y + 13 * u; const top = y + bob - 13 * u; const L = x - 8 * u;
  ctx.globalAlpha = dim ? 0.35 : 1;
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(x, foot, 10 * u, 3 * u, 0, 0, 7); ctx.fill(); // 발밑 그림자
  if (lay) { ctx.save(); ctx.translate(x, foot); ctx.rotate(lay); ctx.translate(-x, -foot); }
  const R2 = (rx, ry, rw, rh, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(rx), Math.round(ry), Math.max(1, Math.round(rw)), Math.max(1, Math.round(rh))); };
  const lUp = legA > 0 ? legA * 2.2 * u : 0; const rUp = legA < 0 ? -legA * 2.2 * u : 0;
  R2(x - 5 * u, top + 23.5 * u - lUp, 4 * u, 1.3 * u, '#f8fafc'); R2(x - 5 * u, top + 24.8 * u - lUp, 4 * u, 1.2 * u, '#0b0b0b'); // 왼쪽 삭스·축구화
  if (kick) { // 오른다리를 앞으로 휘두르는 킥 포즈
    ctx.save(); ctx.translate(x + 2 * u, top + 23 * u); ctx.rotate(-1.05);
    ctx.fillStyle = '#f8fafc'; ctx.fillRect(0, 0, 4 * u, 3 * u); ctx.fillStyle = '#0b0b0b'; ctx.fillRect(0, 3 * u, 4 * u, 1.4 * u); ctx.restore();
  } else { R2(x + 1 * u, top + 23.5 * u - rUp, 4 * u, 1.3 * u, '#f8fafc'); R2(x + 1 * u, top + 24.8 * u - rUp, 4 * u, 1.2 * u, '#0b0b0b'); }
  R2(x - 7 * u, top + 19.5 * u, 14 * u, 4 * u, C.ink); // 쇼츠
  R2(L, top + 18 * u, 16 * u, 1.5 * u, '#ffffff'); // 웨이스트 밴드
  R2(L, top + 9 * u, 16 * u, 9 * u, kit); // 상의
  R2(x - 7 * u, top + 4 * u, 14 * u, 5 * u, C.skin[skin]); // 얼굴(이목구비 없음)
  R2(x - 7 * u, top, 14 * u, 4 * u, C.hair); // 헤어
  if (num !== '') { ctx.fillStyle = C.ink; ctx.font = `800 ${Math.round(8 * u)}px "Silkscreen","Barlow Condensed",monospace`; ctx.textAlign = 'center'; ctx.fillText(String(num), x, top + 16.4 * u); }
  if (lay) ctx.restore();
  if (ring) { const k = (t / 0.7) % 1; ctx.strokeStyle = C.yellow; ctx.lineWidth = 1.4; ctx.globalAlpha = 0.5 + 0.5 * (1 - k); ctx.beginPath(); ctx.ellipse(x, foot, 13 * u + k * 5, 5 * u + k * 2, 0, 0, 7); ctx.stroke(); }
  ctx.globalAlpha = 1;
}
// 공을 잡은 선수 머리 위의 노란 역삼각형(설계서 6.1)
function marker(x, y) {
  const bob = Math.sin(performance.now() / 160) * 2;
  const ty = y - 13 * SPR - 9 + bob;
  ctx.fillStyle = C.yellow; ctx.beginPath(); ctx.moveTo(x - 4, ty - 5); ctx.lineTo(x + 4, ty - 5); ctx.lineTo(x, ty + 1); ctx.closePath(); ctx.fill();
}
// 기존 토큰 호출을 스프라이트로 이어 준다: 우리 선수는 홈(스카이블루), 상대는 원정(레드)
function token(x, y, color, label = '', { ring = null, dim = false, anim = null, lay = 0, kick = false } = {}) {
  const mine = color === TEAM;
  const gk = label === 'GK';
  const kit = gk ? (mine ? C.gkHome : C.gkAway) : (mine ? C.home : C.away);
  const num = label ? (NUM[label] ?? '') : [4, 5, 6, 3, 10][(Math.round(x / 13) * 7 + Math.round(y / 13)) % 5];
  sprite(x, y, kit, { num, ring, dim, anim, lay, kick, skin: (Math.round(x / 9) + Math.round(y / 9)) % 2 });
}
// 축구공: 지름 8의 도트 공. z는 공중에 뜬 높이(그림자는 땅에 남는다)
function ball(x, y, z = 0) {
  const by = y - z;
  fx.trail.push({ x, y: by }); if (fx.trail.length > 10) fx.trail.shift();
  fx.trail.forEach((q, i) => { ctx.globalAlpha = (i / fx.trail.length) * 0.3; ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(q.x, q.y, 2.2, 0, 7); ctx.fill(); });
  ctx.globalAlpha = 1;
  ctx.fillStyle = `rgba(0,0,0,${0.3 - Math.min(0.2, z * 0.004)})`; ctx.beginPath(); ctx.ellipse(x + 1, y + 4, Math.max(2, 4 - z * 0.04), 1.6, 0, 0, 7); ctx.fill();
  const r = 3.6 + Math.min(1.2, z * 0.03);
  ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(x, by, r, 0, 7); ctx.fill();
  ctx.fillStyle = '#0f172a'; ctx.fillRect(x - 1, by - 1, 2, 2); ctx.fillRect(x - 3, by - 2, 1, 1); ctx.fillRect(x + 2, by - 2, 1, 1); ctx.fillRect(x - 2, by + 2, 1, 1); ctx.fillRect(x + 1, by + 2, 1, 1);
}

// 경기장(설계서 4.4): 세로 스트라이프 18개, 라인 2px 흰색 85%, 센터서클, 페널티·골 에어리어, D박스, 코너 호, 3D 골대
function drawField({ goalRight = true } = {}) {
  const { x0, x1, y0, y1 } = PITCH;
  ctx.fillStyle = C.turf; ctx.fillRect(0, 20, W, H - 20);
  const n = 18; const sw = (x1 - x0) / n;
  for (let i = 0; i < n; i++) { ctx.fillStyle = i % 2 ? C.stripe : C.grass; ctx.fillRect(x0 + i * sw, y0, sw + 0.5, y1 - y0); }
  const LC = 'rgba(255,255,255,0.85)'; ctx.strokeStyle = LC; ctx.lineWidth = 1.3;
  ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
  line(320, y0, 320, y1, LC, 1.3);
  ctx.beginPath(); ctx.arc(320, GY, 30, 0, 7); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(320, GY, 1.6, 0, 7); ctx.fill();
  for (const right of [false, true]) {
    const gx = right ? x1 : x0; const dir = right ? -1 : 1;
    ctx.strokeRect(right ? gx - 70 : gx, GY - 55, 70, 110); // 페널티 에어리어
    ctx.strokeRect(right ? gx - 25 : gx, GY - 27, 25, 54); // 골 에어리어
    ctx.beginPath(); ctx.arc(gx + dir * 48, GY, 18, right ? Math.PI * 0.62 : -Math.PI * 0.38, right ? Math.PI * 1.38 : Math.PI * 0.38); ctx.stroke(); // D박스
    // 3D 골대: 골라인 뒤로 뻗은 네트와 흰 포스트
    const nx = right ? gx : gx - 9; ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(nx, GY - 20, 9, 40);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 0.8; for (let i = 0; i <= 4; i++) { line(nx, GY - 20 + i * 10, nx + 9, GY - 20 + i * 10, 'rgba(255,255,255,0.35)', 0.8); } for (let i = 0; i <= 3; i++) line(nx + i * 3, GY - 20, nx + i * 3, GY + 20, 'rgba(255,255,255,0.35)', 0.8);
    ctx.fillStyle = '#fff'; ctx.fillRect(gx - 1.5, GY - 20, 3, 3); ctx.fillRect(gx - 1.5, GY + 17, 3, 3); ctx.fillRect(nx + (right ? 8 : 0), GY - 20, 1.5, 40);
    ctx.strokeStyle = LC; ctx.lineWidth = 1.3;
  }
  for (const [cx, cy, a] of [[x0, y0, 0], [x1, y0, Math.PI / 2], [x1, y1, Math.PI], [x0, y1, Math.PI * 1.5]]) { ctx.beginPath(); ctx.arc(cx, cy, 5, a, a + Math.PI / 2); ctx.stroke(); }
  drawStands();
  void goalRight;
}

// 관중석(도트 그리드)과 LED A보드(롤링 띠)
const crowd = Array.from({ length: 520 }, (_, i) => ({ x: (i * 53) % 640, y: ((i * 7) % 9) * 1, c: ['#38bdf8', '#ef4444', '#f8fafc', '#f59e0b', '#1e293b'][(i * 3 + (i >> 3)) % 5] }));
function drawStands() {
  ctx.fillStyle = C.crowdBg; ctx.fillRect(0, 0, W, 22);
  for (const d of crowd) { ctx.globalAlpha = 0.85; ctx.fillStyle = d.c; ctx.fillRect(d.x, 1 + (d.y % 9) + (d.x % 2), 1.6, 1.6); }
  ctx.globalAlpha = 1;
  ctx.fillStyle = C.aboard; ctx.fillRect(0, 22, W, 9); ctx.fillStyle = '#881337'; ctx.fillRect(0, 22, W, 0.8); ctx.fillRect(0, 30.2, W, 0.8);
  const msg = 'FM-LITE STADIUM   •   LEAGUE 2026/27   •   MATCH DAY   •   TICKETS & HOSPITALITY   •   ';
  ctx.save(); ctx.beginPath(); ctx.rect(0, 22, W, 9); ctx.clip();
  ctx.font = '700 6px "Silkscreen","Barlow Condensed",monospace'; ctx.fillStyle = C.led; ctx.textAlign = 'left';
  const off = (performance.now() / 40) % 380; for (let k = -1; k < 4; k++) ctx.fillText(msg, k * 380 - off, 28.6);
  ctx.restore();
  // 아래쪽 관중석
  ctx.fillStyle = C.crowdBg; ctx.fillRect(0, PITCH.y1 + 6, W, H - PITCH.y1 - 6);
  for (const d of crowd) { ctx.globalAlpha = 0.85; ctx.fillStyle = d.c; if (d.y % 9 < 4) ctx.fillRect(d.x, PITCH.y1 + 8 + (d.y % 9), 1.6, 1.6); }
  ctx.globalAlpha = 1;
}

// HUD는 DOM(스코어보드, SIM, 일시정지)이다. 캔버스에는 튜토리얼 자막만 그린다(처음 3장면).
function clockText(t) { return `${String(Math.floor(Math.max(0, t) / 60)).padStart(2, '0')}:${String(Math.floor(Math.max(0, t) % 60)).padStart(2, '0')}`; }
function updateHud() {
  const set = (id, v) => { const el = document.getElementById(id); if (el && el.textContent !== String(v)) el.textContent = String(v); };
  set('s-me', hud.me); set('s-opp', hud.opp); set('s-time', hud.clock);
}
// 장면 시작 안내: 시간이 딱 뜨고, 공격인지 수비인지 보여 준 다음 플레이가 시작된다
function drawIntro() {
  const k = Math.min(1, intro.t / 0.35); const out = clamp((TUNE.introTime - intro.t) / 0.3, 0, 1); const a = Math.min(k, out);
  ctx.fillStyle = `rgba(8,12,20,${0.62 * a})`; ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = a;
  const atk = intro.kind === 'attack';
  // 시간: 스코어보드와 같은 흰 박스
  ctx.fillStyle = '#ffffff'; ctx.fillRect(320 - 62, 112, 124, 46);
  ctx.fillStyle = C.ink; ctx.font = '800 30px "Silkscreen","Barlow Condensed",monospace'; ctx.textAlign = 'center'; ctx.fillText(intro.clock, 320, 147);
  // 상황: 공격(에메랄드) / 수비(레드)
  const col = atk ? '#10b981' : '#ef4444';
  ctx.fillStyle = col; ctx.fillRect(320 - 92, 172, 184, 34);
  ctx.fillStyle = '#ffffff'; ctx.font = '800 22px "Silkscreen","Barlow Condensed",monospace'; ctx.fillText(atk ? 'ATTACK' : 'DEFENSE', 320, 197);
  ctx.fillStyle = '#cbd5e1'; ctx.font = '700 10px "Barlow Condensed",sans-serif'; ctx.fillText(atk ? 'OUR BALL' : 'THEY ATTACK', 320, 224);
  if (intro.t > 0.7) { ctx.globalAlpha = a * (0.5 + 0.5 * Math.sin(performance.now() / 260)); ctx.fillStyle = '#94a3b8'; ctx.fillText('TAP TO START', 320, 250); }
  ctx.globalAlpha = 1;
}
function drawCaption() {
  if (intro) return;
  if (!hud.banner) return;
  const big = ['GOAL', 'GOAL AGAINST', 'SAVED', 'SAVE', 'PERFECT BLOCK', 'OFF THE POST', 'MISS', 'TURNOVER', 'MISSED PASS'].includes(hud.banner);
  if (big) { ctx.font = '800 30px "Silkscreen","Barlow Condensed",sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillText(hud.banner, 322, 132); ctx.fillStyle = WHITE; ctx.fillText(hud.banner, 320, 130); return; }
  if (plays.total > 3) return; // 튜토리얼이 끝나면 글자는 스코어보드뿐
  ctx.fillStyle = 'rgba(15,23,42,0.85)'; const w = Math.max(160, hud.banner.length * 6.6 + 24); ctx.fillRect(320 - w / 2, H - 34, w, 20);
  ctx.font = '700 9px "Barlow Condensed",sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = C.yellow; ctx.fillText(hud.banner, 320, H - 20);
}
const drawHud = () => { drawCaption(); };
function bar(x, y, w, h, v, color) { ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fillRect(x, y, w, h); ctx.fillStyle = color; ctx.fillRect(x, y, w * clamp(v, 0, 1), h); }
const flash = (t) => { hud.banner = t; };

// ---------- 미니 경기: 공격/수비 장면을 이어서 한 경기를 해본다 ----------
const match = { on: false, n: 0, total: 10 };
const pAttack = () => { const x = 10 / Math.max(1, stats.oppDef); const y = stats.oppAtk / 10; return x / (x + y); };
function nextMatchScene() {
  if (!match.on) return;
  if (match.n >= match.total) { endMatch(); return; }
  match.n += 1; hud.no = match.n;
  start(Math.random() < pAttack() ? 'attack' : 'defense', { keepScore: true });
}
function endMatch() {
  match.on = false; scene = null; ghost = null; hud.banner = '';
  const r = hud.me > hud.opp ? 'WIN' : (hud.me < hud.opp ? 'LOSS' : 'DRAW');
  box.innerHTML = `<h2>${r}</h2><p>ME ${hud.me} : ${hud.opp} OPP · ${match.total} SCENES</p><button class="btn btn--primary" id="again">PLAY AGAIN</button>`;
  overlay.classList.add('on');
  document.getElementById('again').onclick = startMatch;
}
function startMatch() {
  paused = false; match.on = true; match.n = 0; hud.me = 0; hud.opp = 0; hud.no = 0; fx.trail = [];
  overlay.classList.remove('on');
  nextMatchScene();
}
function finish(title, sub, ok) {
  const kind = lastKind; ghost = scene; scene = null; timeScale = 1; hud.banner = '';
  if (title === 'GOAL') hud.me += 1;
  if (title === 'GOAL AGAINST') hud.opp += 1;
  // 손맛: 결과마다 소리, 정지, 흔들림, 파티클
  if (title === 'GOAL') { sfx.goal(); fx.flash = 0.9; fx.shake = 10; fx.freeze = 0.12; burst(PITCH.x1 - 30, GY, TEAM, 34, 200); burst(PITCH.x1 - 30, GY, WHITE, 14, 160); }
  else if (title === 'GOAL AGAINST') { sfx.bad(); fx.shake = 9; fx.freeze = 0.1; burst(PITCH.x0 + 30, GY, '#c94b4b', 20, 150); }
  else if (['SAVED', 'SAVE', 'PERFECT BLOCK', 'OFF THE POST'].includes(title)) { sfx.save(); fx.shake = 4; fx.freeze = 0.06; burst(kind === 'attack' ? PITCH.x1 - 30 : PITCH.x0 + 30, GY, WHITE, 12, 110); }
  else { sfx.bad(); fx.shake = 3; }
  if (match.on) { // 경기 중에는 결과를 잠깐 보여 주고 다음 장면으로
    hud.banner = title;
    setTimeout(() => { hud.banner = ''; nextMatchScene(); }, TUNE.resultTime * 1000);
    return;
  }
  setTimeout(() => {
    box.innerHTML = `<h2 style="color:${ok ? '#fff' : '#9a9a9a'}">${title}</h2><p>${sub}</p><button class="btn btn--primary" id="again">AGAIN</button>`;
    overlay.classList.add('on');
    document.getElementById('again').onclick = () => start(lastKind);
  }, 1300);
}

// ---------- 공통 애니메이션 도우미 ----------
const dist2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2);
const nowT = () => performance.now() / 1000;
// 공이 날아가는 위치: 지면 좌표와 높이(z)를 돌려준다. arc는 포물선의 높이.
function flightAt(a, b, u, arc = 18, endZ = 0) {
  const k = clamp(u, 0, 1);
  return { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), z: Math.sin(Math.PI * k) * arc + endZ * k };
}
// 이 선수가 지금 달리고 있는지에 따라 포즈를 정한다
const POSE_RUN = { anim: 'run' };

// ---------- 슛 장면(공통): 두 게이지를 차례로 탭하고, 차는 동작과 공이 날아가는 모션이 나온다 ----------
class ShootScene {
  constructor({ curl = false, striker = false, farSide = 1, rebound = false, shooter, onDone }) {
    Object.assign(this, { curl, striker, farSide, rebound, onDone });
    this.shooter = shooter ?? { x: PITCH.x1 - 120, y: GY };
    this.t = 0; this.real = 0; this.phase = rebound ? 'aim' : 'power'; this.power = 0.65; this.aim = 0.5; this.result = null; this.hold = 0; this.cur = 0;
    this.kick = null; // { t, r, ... } 슛을 찬 뒤의 모션
    this.limit = shootTime(stats.finishing, striker) * easyNow();
    timeScale = 0.55; // 마무리 순간은 슬로우 모션
    this.keeperY = GY;
    this.defs = [{ x: this.shooter.x + 40, y: this.shooter.y - 30 }, { x: this.shooter.x + 54, y: this.shooter.y + 28 }];
    flash(rebound ? 'REBOUND · TAP TO AIM' : (curl ? 'TAP: CURL, THEN TAP: AIM' : 'TAP: POWER, THEN TAP: AIM'));
  }

  update(dt) {
    this.t += dt; this.real += dt / timeScale; // 제한 시간은 실제 시간(슬로우 모션과 무관)
    if (this.kick) { this.stepKick(dt); return; }
    if (this.result) { this.hold += dt / timeScale; if (this.hold > 1.0) { timeScale = 1; this.onDone(this.result); } return; }
    if (this.real > this.limit) { this.settle('miss'); return; }
    this.cur = gaugeAt(this.t, this.phase === 'power' ? TUNE.gaugeCycle : TUNE.gaugeCycle * 0.9);
    this.keeperY = GY + Math.sin(this.t * 1.5) * 10; // 키퍼가 좌우로 조금씩 움직인다
  }

  onGesture(g) {
    if (this.result || this.kick || g.type !== 'tap') return;
    if (this.phase === 'power') {
      this.power = gaugeAt(this.t, TUNE.gaugeCycle); this.phase = 'aim'; sfx.tap();
      const [lo, hi] = powerWindow(stats.shooting, { curl: this.curl });
      if (this.power >= lo && this.power <= hi) { if (Math.abs(this.power - (lo + hi) / 2) < (hi - lo) * 0.2) sfx.perfect(); else sfx.ok(); }
      return;
    }
    this.aim = gaugeAt(this.t, TUNE.gaugeCycle * 0.9);
    this.settle(resolveShot({ power: this.rebound ? 0.65 : this.power, aim: aimOf(this.aim), shooting: stats.shooting, curl: this.curl, farSide: this.farSide }));
  }

  // 결과를 정하고 슛 모션을 시작한다(찰 준비 → 공 비행 → 키퍼 다이빙 → 결과)
  settle(r) {
    const gx = PITCH.x1; const a = aimOf(this.aim); const sgn = Math.sign(a) || 1;
    const [lo, hi] = powerWindow(stats.shooting, { curl: this.curl });
    const from = { x: this.shooter.x + 9, y: this.shooter.y + 11 };
    let to; let endZ = 0; let arc = this.curl ? 26 : 12;
    if (r === 'goal') to = { x: gx + 5, y: GY + clamp(a, -1, 1) * 18 };
    else if (r === 'post') to = { x: gx, y: GY + sgn * 20 };
    else if (r === 'save') to = { x: gx - 14, y: clamp(GY + clamp(a, -1, 1) * 14, GY - 24, GY + 24) };
    else if (this.power > hi) { to = { x: gx + 40, y: GY + clamp(a, -1.2, 1.2) * 18 }; endZ = 46; arc = 40; } // 너무 세서 크로스바 위로
    else to = { x: gx + 22, y: GY + sgn * 38 }; // 빗나감(골대 옆)
    const flightDur = clamp(dist2(from, to) / 260, 0.55, 1.1);
    this.kick = { t: 0, r, from, to, endZ, arc, flightDur, windup: 0.4, keeperTo: this.keeperTarget(r, to, sgn) };
    hud.banner = '';
    sfx.tap();
  }

  keeperTarget(r, to, sgn) {
    if (r === 'save') return { x: PITCH.x1 - 24, y: to.y, reach: 1 };
    if (r === 'goal') return { x: PITCH.x1 - 24, y: GY - sgn * 14 + (Math.random() - 0.5) * 6, reach: 0.55 }; // 반대로 몸을 던지거나 늦는다
    if (r === 'post') return { x: PITCH.x1 - 24, y: to.y, reach: 0.9 };
    return { x: PITCH.x1 - 24, y: GY + (Math.random() - 0.5) * 20, reach: 0.4 };
  }

  stepKick(dt) {
    const k = this.kick; k.t += dt / timeScale;
    const u = (k.t - k.windup) / k.flightDur;
    if (!k.struck && k.t >= k.windup) { k.struck = true; sfx.tap(); fx.shake = 2; }
    if (u >= 1 && !k.landed) {
      k.landed = true;
      // 공이 도착했을 때의 반응: 골대 맞춤 소리, 네트 출렁임
      if (k.r === 'post') { fx.shake = 5; sfx.save(); }
    }
    if (u >= 1.35) { this.result = k.r; this.kick = null; this.hold = 0; hud.banner = { goal: 'GOAL', save: 'SAVED', post: 'OFF THE POST', miss: 'MISS' }[this.result]; }
  }

  camera() { camTo((this.shooter.x + PITCH.x1) / 2, GY, 1.25); }

  // 월드(필드) 안의 선수·공
  drawWorld() {
    const k = this.kick; const gx = PITCH.x1;
    const t = nowT();
    for (const d of this.defs) token(d.x, d.y, OPP, '', { dim: true, anim: 'idle' });
    // 슈터: 찰 준비 때 한 걸음 앞으로, 공을 차는 순간 다리를 휘두른다
    const wind = k ? clamp(k.t / k.windup, 0, 1) : 0;
    const sh = { x: this.shooter.x + wind * 6, y: this.shooter.y };
    const kicking = k && k.t > k.windup * 0.55 && k.t < k.windup + 0.35;
    token(sh.x, sh.y, TEAM, this.striker ? 'ST' : 'WG', { anim: k ? (wind < 1 ? 'run' : null) : 'idle', kick: kicking });
    // 키퍼
    let ky = this.keeperY; let kx = gx - 24; let lay = 0;
    if (k) {
      const u = clamp((k.t - k.windup) / k.flightDur, 0, 1);
      const dive = ease(clamp(u * 1.15, 0, 1)) * k.keeperTo.reach;
      ky = lerp(this.keeperY, k.keeperTo.y, dive); kx = lerp(gx - 24, k.keeperTo.x, dive);
      lay = clamp((k.keeperTo.y - GY) / 24, -1, 1) * 1.25 * dive; // 몸을 던진 방향으로 기울어진다
    }
    token(kx, ky, OPP, 'GK', { lay, anim: lay ? null : 'idle' });
    // 공
    if (!k) { ball(sh.x + 9, sh.y + 11); return; }
    if (k.t < k.windup) { ball(this.shooter.x + 9, this.shooter.y + 11); return; }
    const u = (k.t - k.windup) / k.flightDur;
    if (u < 1) { const p = flightAt(k.from, k.to, u, k.arc, k.endZ); ball(p.x, p.y, p.z); return; }
    // 도착 뒤: 결과별 모션
    const v = clamp((u - 1) / 0.35, 0, 1);
    if (k.r === 'goal') ball(k.to.x + v * 3, k.to.y + v * 4, 0); // 그물에 걸려 멈춘다
    else if (k.r === 'save') { const q = flightAt({ x: k.to.x, y: k.to.y }, { x: k.to.x - 30, y: k.to.y + (k.to.y < GY ? -26 : 26) }, v, 12); ball(q.x, q.y, q.z); } // 키퍼가 쳐낸다
    else if (k.r === 'post') { const q = flightAt(k.to, { x: gx - 46, y: k.to.y + (k.to.y < GY ? -34 : 34) }, v, 14); ball(q.x, q.y, q.z); } // 골대를 맞고 튕겨 나온다
    else ball(k.to.x + v * 24, k.to.y + (k.to.y < GY ? -v * 8 : v * 8), k.endZ * (1 - v * 0.3)); // 빗나가 뒤로 굴러간다
  }

  draw() {
    this.camera();
    world(() => { drawField(); this.drawWorld(); });
    drawHud();
    const gx = 150; const gw = 340; const gy = 312;
    const [lo, hi] = powerWindow(stats.shooting, { curl: this.curl });
    if (this.kick || this.result) return; // 찬 뒤에는 게이지를 숨기고 모션만 보여 준다
    ctx.fillStyle = 'rgba(15,23,42,0.85)'; ctx.fillRect(gx - 6, gy - 8, gw + 12, 34);
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(gx, gy, gw, 18);
    if (this.phase === 'power') {
      ctx.fillStyle = 'rgba(16,185,129,0.8)'; ctx.fillRect(gx + gw * lo, gy, gw * (hi - lo), 18);
      ctx.fillStyle = C.yellow; ctx.fillRect(gx + gw * this.cur - 2, gy - 5, 4, 28);
    } else {
      const g = (a) => (a + 1.2) / 2.4;
      const zone = (a, b, c) => { ctx.fillStyle = c; ctx.fillRect(gx + gw * a, gy, gw * (b - a), 18); };
      zone(g(-1.05), g(-0.95), 'rgba(245,158,11,0.95)'); zone(g(0.95), g(1.05), 'rgba(245,158,11,0.95)');
      if (this.curl) zone(this.farSide > 0 ? g(0.45) : g(-0.95), this.farSide > 0 ? g(0.95) : g(-0.45), 'rgba(16,185,129,0.8)');
      else { zone(g(-0.95), g(-0.45), 'rgba(16,185,129,0.8)'); zone(g(0.45), g(0.95), 'rgba(16,185,129,0.8)'); }
      ctx.fillStyle = C.yellow; ctx.fillRect(gx + gw * this.cur - 2, gy - 5, 4, 28);
    }
    bar(250, 350, 140, 3, 1 - this.real / this.limit, C.yellow);
  }
}

// ---------- 공격 장면 ----------
class AttackScene {
  constructor() {
    this.wantsDoubleTap = false;
    this.phase = 'choose'; this.t = 0;
    this.startLane = pick([0, 2, 4]); // 위쪽 / 중앙 / 아래쪽 해시
    this.depth = rnd(0.05, 0.4); // 깊이 0~1(상대 진영)
    this.easy = easyNow();
    this.time = chooseTime(stats.vision) * this.easy;
    this.side = this.startLane >= 2 ? -1 : 1;
    const mx = px(this.depth); const my = LY(this.startLane);
    this.mf = { x: mx, y: my };
    // 모두 천천히 움직인다: 동료는 앞으로 조깅, 수비수는 미드필더에게 다가온다
    this.mates = {
      WG: { x: px(this.depth + 0.2), y: my + this.side * 52, vx: 11, vy: -this.side * 2 },
      WB: { x: px(Math.max(0, this.depth - 0.1)), y: my + this.side * 52, vx: 9, vy: this.side * 1 },
      ST: { x: px(0.7), y: LY(2) - this.side * 18, vx: 8, vy: this.side * 3 },
    };
    this.opps = [
      { x: mx - 120, y: my + this.side * 46, tx: 'mf', v: 30 }, // 압박수: 미드필더에게 접근
      { x: px(this.depth + 0.34), y: LY(1), tx: 'WG', v: 14 },
      { x: px(this.depth + 0.44), y: LY(3), tx: 'WG', v: 12 },
      { x: px(0.86), y: LY(2) - 30, tx: 'ST', v: 10 },
      { x: px(0.82), y: LY(2) + 36, tx: 'ST', v: 10 },
    ];
    this.fl = null; // 공 비행
    flash(['OWN HALF', 'MIDFIELD', 'FINAL THIRD'][this.depth < 0.25 ? 0 : (this.depth < 0.45 ? 1 : 2)] + ' · PICK A TARGET');
  }

  actorPos(id) { return id === 'mf' ? this.mf : this.mates[id]; }

  update(dt) {
    this.t += dt;
    if (this.phase === 'choose') {
      for (const m of Object.values(this.mates)) { m.x += m.vx * dt; m.y += m.vy * dt; }
      for (const o of this.opps) {
        const tg = this.actorPos(o.tx); const d = dist2(o, tg); const stop = o.tx === 'mf' ? 18 : 26;
        if (d > stop) { o.x += ((tg.x - o.x) / d) * o.v * dt * (o.tx === 'mf' ? 1 + this.t * 0.35 : 1); o.y += ((tg.y - o.y) / d) * o.v * dt * (o.tx === 'mf' ? 1 + this.t * 0.35 : 1); }
      }
      if (dist2(this.opps[0], this.mf) < 20 || this.t >= this.time) this.end(false, 'TURNOVER', '압박수에게 공을 뺏겼어요');
    } else if (this.phase === 'pass') this.updatePass(dt);
    else if (this.phase === 'run') this.updateRun(dt);
    else if (this.phase === 'tackle') this.updateTackle(dt);
    else if (this.phase === 'longpass') this.updateLong(dt);
    else if (this.phase === 'through') this.updateThrough(dt);
    else if (this.phase === 'sling') this.updateSling(dt);
    else if (this.phase === 'shoot') this.sub?.update(dt);
  }

  get ph() { return this.phase === 'result' ? this.resultPhase : this.phase; }
  end(ok, title, sub) { this.resultPhase = this.phase; this.phase = 'result'; finish(title, sub, ok); }

  // ----- 미드필더의 첫 패스: 공이 동료에게 날아간다 -----
  startPass(kind) {
    this.phase = 'pass'; this.pt = 0; this.kind = kind; this.wantsDoubleTap = false;
    this.pfrom = { x: this.mf.x + 9, y: this.mf.y + 11 }; this.pdur = 0.7; sfx.tap();
    flash('');
  }

  updatePass(dt) {
    this.pt += dt; // 날아가는 동안에도 모두 계속 움직인다
    for (const m of Object.values(this.mates)) { m.x += m.vx * dt; m.y += m.vy * dt; }
    for (const o of this.opps) { const tg = this.actorPos(o.tx); const d = dist2(o, tg) || 1; if (d > 26) { o.x += ((tg.x - o.x) / d) * o.v * dt; o.y += ((tg.y - o.y) / d) * o.v * dt; } }
    if (this.pt >= this.pdur) this.startRun(this.kind, this.mates[this.kind]);
  }

  // ----- 윙/윙백 달리기 -----
  startRun(kind, pos) {
    this.phase = 'run'; this.kind = kind; this.t = 0;
    this.p = clamp((pos.x - 70) / 500, 0, 0.8);
    this.lane = clamp(Math.round((pos.y - 66) / 58), 0, TUNE.lanes - 1); this.laneTo = this.lane; this.laneT = 1; this.laneNow = clamp((pos.y - 66) / 58, 0, TUNE.lanes - 1); this.lane = Math.round(this.laneNow);
    this.speedBase = runnerSpeed(stats.speed) * 0.15;
    this.sprint = { used: false, t: 0 }; this.skill = { cd: 0, active: 0 }; this.laneCd = 0; this.vig = 0;
    const n = frontDefenderCount(this.p, stats.oppDef);
    const span = 0.8 - (this.p + 0.22);
    this.defs = Array.from({ length: n }, (_, i) => ({ p: this.p + 0.22 + (span * (i + 0.5)) / n, lane: Math.floor(rnd(0, TUNE.lanes)), passed: false, react: Math.random() < 0.55, delay: rnd(0.1, 0.35), fell: -1 }));
    this.zoneStart = Math.max(...this.defs.map((d) => d.p)) + 0.05;
    this.chaser = Math.max(0, this.p - 0.34);
    this.chaserV = chaserSpeed(stats.oppDef, this.p) * 0.15;
    this.stRun = { x: px(0.72), y: LY(2) - this.side * 22 }; // 스트라이커도 같이 달린다
    this.wantsDoubleTap = true;
    flash('RUN · SWIPE UP/DOWN TO DODGE');
  }

  updateRun(dt) {
    const sprinting = this.sprint.t > 0;
    if (sprinting) this.sprint.t -= dt;
    this.laneCd = Math.max(0, this.laneCd - dt);
    this.skill.cd = Math.max(0, this.skill.cd - dt); this.skill.active = Math.max(0, this.skill.active - dt);
    this.p += this.speedBase * (sprinting ? TUNE.sprintMul : 1) * dt;
    this.chaser += this.chaserV * dt;
    this.stRun.x = Math.min(px(0.93), this.stRun.x + 9 * dt);
    if (this.laneT < 1) { this.laneT = Math.min(1, this.laneT + dt * 5); if (this.laneT >= 1) this.lane = this.laneTo; }
    this.laneNow = this.laneT < 1 ? (this.lane + (this.laneTo - this.lane) * this.laneT) : this.lane;
    for (const d of this.defs) {
      if (d.fell >= 0) d.fell += dt;
      if (d.react && !d.passed && d.p - this.p < 0.3 && d.p - this.p > 0.03) {
        d.delay -= dt;
        if (d.delay <= 0) { const dir = Math.sign(this.laneNow - d.lane); d.lane += dir * Math.min(Math.abs(this.laneNow - d.lane), (0.8 + stats.oppDef / 20) * dt * 0.8); }
      }
      if (d.passed || this.p < d.p - 0.012) continue;
      if (Math.abs(this.p - d.p) <= 0.025 && Math.abs(this.laneNow - d.lane) < 0.7) {
        if (this.skill.active > 0) { d.passed = true; d.beaten = true; d.fell = 0; sfx.perfect(); burst(px(d.p), LY(d.lane), WHITE, 10, 90); fx.shake = 3; }
        else return this.startTackle({ x: px(d.p), y: LY(d.lane) }, '앞 수비수에게 막혔어요');
      } else if (this.p > d.p + 0.025) d.passed = true;
    }
    this.vig = clamp(1 - (this.p - this.chaser) / 0.14, 0, 1);
    if (this.chaser >= this.p) return this.startTackle({ x: px(this.chaser), y: LY(this.laneNow) }, '뒤에서 따라온 압박에 공을 뺏겼어요');
    this.inZone = this.p >= this.zoneStart;
    if (this.inZone) flash(this.kind === 'WG' ? 'SHOOT ZONE · SWIPE → SHOT · SWIPE ← PASS TO ST' : 'SHOOT ZONE · SWIPE ← PASS TO ST');
    if (this.p >= 0.97) this.end(false, 'TURNOVER', '슛 구간 끝까지 입력이 없었어요');
  }

  // 막히거나 따라잡혔을 때: 수비수가 달려들어 태클하고 선수가 넘어지며 공이 튕겨 나간다
  startTackle(by, sub) {
    this.phase = 'tackle'; this.tk = { t: 0, by: { ...by }, sub, at: { x: px(this.p), y: LY(this.laneNow) }, ball: { x: px(this.p) + 12, y: LY(this.laneNow) + 12 } };
    this.wantsDoubleTap = false; sfx.bad(); fx.shake = 4; flash('');
  }

  updateTackle(dt) {
    const k = this.tk; k.t += dt;
    k.ball.x += 26 * dt * Math.max(0, 1 - k.t / 1.2); k.ball.y += (k.by.y < k.at.y ? 14 : -14) * dt * Math.max(0, 1 - k.t / 1.2);
    if (k.t > 1.4) this.end(false, 'TURNOVER', k.sub);
  }

  // ----- 스트라이커 직결: 침투하는 스트라이커를 보며 새총으로 겨냥 -----
  startLong() {
    this.phase = 'longpass'; this.t = 0; this.wantsDoubleTap = false; this.drag = false; this.pull = null; this.released = false;
    this.range = slingRange(stats.pass, stats.stamina, 5);
    this.runT = (this.time * 1.2 + 2.5) * 1.1; // 스트라이커가 점선을 다 달리는 데 걸리는 시간
    this.pressT = this.runT * 0.95;
    const up = Math.random() < 0.5 ? -1 : 1; // 어느 쪽에서 침투하는지
    this.path = [{ x: px(0.58), y: LY(2) + up * 70 }, { x: px(0.9), y: LY(2) - up * 6 }]; // 스트라이커의 침투 점선(수비 사이를 파고든다)
    // 점선 앞을 막는 수비수 둘: 침투를 따라 좁혀 오지만 그 사이로 빠져나간다
    const mid = { x: lerp(this.path[0].x, this.path[1].x, 0.6), y: lerp(this.path[0].y, this.path[1].y, 0.6) };
    this.squeeze = [
      { a: { x: mid.x - 70, y: mid.y - 62 }, b: { x: mid.x + 6, y: mid.y - 22 } },
      { a: { x: mid.x - 50, y: mid.y + 66 }, b: { x: mid.x + 10, y: mid.y + 24 } },
    ];
    flash('DRAG BACK ← AND RELEASE TO PASS');
  }

  stPos(u) { const k = clamp(u, 0, 1); return { x: lerp(this.path[0].x, this.path[1].x, k), y: lerp(this.path[0].y, this.path[1].y, k) }; }
  stU() { return clamp(this.t / this.runT, 0, 1); }

  updateLong(dt) {
    this.t += dt;
    for (const o of this.opps) { if (o.tx === 'mf') { const d = dist2(o, this.mf) || 1; if (d > 22) { o.x += ((this.mf.x - o.x) / d) * 12 * dt; o.y += ((this.mf.y - o.y) / d) * 12 * dt; } } }
    if (this.t > this.pressT && !this.released) this.end(false, 'TURNOVER', '조준하는 동안 압박수가 닿았어요');
  }

  onDown() { if (this.phase === 'longpass') this.drag = true; }
  onMove(p, d) { if (this.phase === 'longpass' && this.drag) this.pull = { x: d.x - p.x, y: d.y - p.y }; }
  onUp(p, d) {
    if (this.phase !== 'longpass' || !this.drag) return;
    this.drag = false;
    const vx = d.x - p.x; const vy = d.y - p.y; // 왼쪽 뒤로 당긴 만큼 반대(오른쪽 앞)로 날아간다
    const len = Math.hypot(vx, vy);
    if (len < 20 || vx < 0) { this.pull = null; return; }
    const dist = Math.min(len / 100, 1) * this.range * 500;
    const land = { x: this.mf.x + (vx / len) * dist, y: this.mf.y + (vy / len) * dist };
    this.released = true; this.pull = null;
    this.th = { t: 0, from: { x: this.mf.x + 9, y: this.mf.y + 11 }, land, dur: 0.95, u0: this.stU() };
    // 공이 도착하는 순간 스트라이커가 있을 곳(앞으로 달려가며 받는다)
    const arrive = this.stPos(this.th.u0 + this.th.dur / this.runT);
    this.th.arrive = arrive; this.th.ok = dist2(land, arrive) <= 26 + stats.speed * 1.4;
    this.phase = 'through'; sfx.tap(); flash('');
  }

  updateThrough(dt) {
    const th = this.th; th.t += dt; this.t += dt;
    if (th.t >= th.dur + 0.45) {
      if (th.ok) { this.phase = 'shoot'; this.sub = new ShootScene({ striker: true, shooter: { x: th.arrive.x, y: th.arrive.y }, onDone: (r) => this.shotEnd(r, true) }); }
      else this.end(false, 'MISSED PASS', '패스가 스트라이커의 침투 경로에서 벗어났어요');
    }
  }

  // 슛 구간에서 스트라이커에게 새총 패스(윙/윙백에서)
  startSling() {
    this.phase = 'sling'; this.wantsDoubleTap = false;
    const from = { x: px(this.p) + 9, y: LY(this.laneNow) + 11 }; const to = { x: this.stRun.x, y: this.stRun.y };
    this.sl = { t: 0, from, to, dur: 0.75 }; sfx.tap(); flash('');
  }

  updateSling(dt) {
    this.sl.t += dt;
    this.stRun.x += 9 * dt;
    if (this.sl.t >= this.sl.dur + 0.3) { this.phase = 'shoot'; this.sub = new ShootScene({ striker: true, shooter: { x: this.stRun.x, y: this.stRun.y }, onDone: (r) => this.shotEnd(r, true) }); }
  }

  // ----- 입력 -----
  onGesture(g) {
    if (this.phase === 'shoot') { this.sub.onGesture(g); return; }
    if (this.phase === 'choose' && g.type === 'tap') {
      const wp = toWorld(g);
      const hit = ['WG', 'WB', 'ST'].find((id) => dist2(this.mates[id], wp) < 30);
      if (!hit) return;
      if (hit === 'ST') this.startLong(); else this.startPass(hit);
      return;
    }
    if (this.phase === 'run') {
      if (g.type === 'swipeUp' || g.type === 'swipeDown') {
        if (this.laneCd > 0 || this.laneT < 1) return;
        const to = clamp(this.lane + (g.type === 'swipeUp' ? -1 : 1), 0, TUNE.lanes - 1);
        if (to !== this.lane) { this.laneTo = to; this.laneT = 0; this.laneCd = TUNE.laneCutCooldown; sfx.tap(); }
      } else if (g.type === 'tap') {
        if (!this.sprint.used) { this.sprint.used = true; this.sprint.t = TUNE.sprintTime; sfx.sprint(); fx.shake = 2; }
      } else if (g.type === 'dtap') {
        if (this.skill.cd <= 0 && this.sprint.t <= 0) { this.skill.cd = TUNE.skillCooldown; this.skill.active = skillWindow(stats.dribble); sfx.tap(); }
      } else if (g.type === 'swipeRight') {
        if (this.kind !== 'WG' || !this.inZone) return; // 윙만 직접 슛
        this.phase = 'shoot'; this.wantsDoubleTap = false;
        this.sub = new ShootScene({ curl: true, farSide: this.laneNow >= 2 ? -1 : 1, shooter: { x: px(this.p), y: LY(this.laneNow) }, onDone: (r) => this.shotEnd(r, false) });
      } else if (g.type === 'swipeLeft') {
        if (!this.inZone) return; // 뒤로 당기기 = 스트라이커에게 새총 패스
        this.startSling();
      }
    }
  }

  shotEnd(r, striker) {
    if (r === 'post' && !this.reb) {
      this.reb = true;
      const sh = this.sub.shooter;
      this.sub = new ShootScene({ striker, rebound: true, shooter: { x: PITCH.x1 - 48, y: GY + (this.sub.aim >= 0.5 ? 30 : -30) }, onDone: (r2) => this.shotEnd(r2, striker) }); void sh; return;
    }
    this.end(r === 'goal', r === 'goal' ? 'GOAL' : ({ save: 'SAVED', post: 'OFF THE POST', miss: 'MISS' }[r]), r === 'goal' ? '공격이 골로 이어졌어요' : '마무리가 막혔어요');
  }

  aimCamera() {
    if (this.ph === 'choose' || this.ph === 'pass') camFit([this.mf, ...Object.values(this.mates), this.opps[0]], { max: 1.15, margin: 90 });
    else if (this.ph === 'run') camTo(px(this.p) + 90, LY(this.laneNow), 1.15);
    else if (this.ph === 'tackle') camTo(this.tk.at.x + 40, this.tk.at.y, 1.5);
    else if (this.ph === 'longpass' || this.ph === 'through') { const s = this.stPos(this.stU()); camFit([this.mf, ...this.path, s], { max: 1.15, margin: 90 }); }
    else if (this.ph === 'sling') camTo((px(this.p) + this.stRun.x) / 2 + 40, GY, 1.15);
  }

  draw() {
    if (this.ph === 'shoot') { this.sub.draw(); return; }
    this.aimCamera();
    const t = nowT();
    world(() => {
      drawField();
      if (this.ph === 'choose' || this.ph === 'pass') {
        if (this.ph === 'choose') for (const id of ['WG', 'WB', 'ST']) { const m = this.mates[id]; route(this.mf.x + 6, this.mf.y, m.x - 8, m.y - 6); }
        for (const o of this.opps) token(o.x, o.y, OPP, '', { anim: 'run' });
        for (const id of ['WG', 'WB', 'ST']) token(this.mates[id].x, this.mates[id].y, TEAM, id, { ring: this.ph === 'choose' ? true : null, anim: 'run' });
        token(this.mf.x, this.mf.y, TEAM, 'MF', { anim: this.ph === 'pass' ? null : 'idle' });
        if (this.ph === 'choose') { ball(this.mf.x + 9, this.mf.y + 11); marker(this.mf.x, this.mf.y); }
        else { const tgt = this.mates[this.kind]; const p = flightAt(this.pfrom, { x: tgt.x + 4, y: tgt.y + 11 }, this.pt / this.pdur, 14); ball(p.x, p.y, p.z); }
      } else if (this.ph === 'run' || this.ph === 'tackle') {
        const zx = px(this.zoneStart);
        ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.fillRect(zx, PITCH.y0 + 1, PITCH.x1 - zx, PITCH.y1 - PITCH.y0 - 2);
        line(zx, PITCH.y0, zx, PITCH.y1, 'rgba(255,255,255,0.45)', 1, [3, 4]);
        for (const d of this.defs) token(px(d.p), LY(d.lane), OPP, '', { dim: Boolean(d.beaten) && d.fell > 0.9, lay: d.fell >= 0 ? Math.min(1.3, d.fell * 3) : 0, anim: d.fell >= 0 ? null : 'idle' });
        token(this.stRun.x, this.stRun.y, TEAM, 'ST', { anim: 'run' });
        if (this.ph === 'run') {
          token(px(this.chaser), LY(this.laneNow), OPP, '', { anim: 'run' });
          const x = px(this.p); const y = LY(this.laneNow);
          token(x, y, TEAM, this.kind, { ring: this.skill.active > 0 ? true : null, anim: 'run' });
          ball(x + 11, y + 12); marker(x, y);
          arcRing(x, y + 13, 14, this.laneCd > 0 ? 1 - this.laneCd / TUNE.laneCutCooldown : 0, '#9a9a9a');
          arcRing(x, y + 13, 17, this.sprint.t / TUNE.sprintTime, '#fde047');
          arcRing(x, y + 13, 20, this.skill.cd > 0 ? 1 - this.skill.cd / TUNE.skillCooldown : (this.skill.active > 0 ? 1 : 0), WHITE);
          if (this.sprint.t > 0) for (let i = 1; i <= 4; i++) line(x - 12 - i * 10, y - 6 + i * 3, x - 22 - i * 10, y - 6 + i * 3, 'rgba(255,255,255,0.4)', 1.5);
        } else {
          const k = this.tk;
          const lunge = clamp(k.t / 0.35, 0, 1);
          token(lerp(k.by.x + 30, k.at.x + 6, lunge), lerp(k.by.y, k.at.y + 2, lunge), OPP, '', { anim: 'run' }); // 태클하러 달려든 수비수
          token(k.at.x, k.at.y, TEAM, this.kind, { lay: clamp((k.t - 0.25) * 4, 0, 1.4) * (k.by.y > k.at.y ? 1 : -1) });
          ball(k.ball.x, k.ball.y);
        }
      } else if (this.ph === 'longpass' || this.ph === 'through') {
        const u = this.stU();
        line(this.path[0].x, this.path[0].y, this.path[1].x, this.path[1].y, C.yellow, 1.4, [3, 5]);
        for (const q of this.path) { ctx.fillStyle = '#fff'; ctx.fillRect(q.x - 2, q.y - 2, 4, 4); }
        // 수비수 둘이 점선 앞에서 좁혀 오지만 스트라이커는 그 사이로 파고든다
        const sq = clamp(u * 1.05, 0, 1);
        for (const s2 of this.squeeze) token(lerp(s2.a.x, s2.b.x, ease(sq)), lerp(s2.a.y, s2.b.y, ease(sq)), OPP, '', { anim: 'run' });
        for (const o of this.opps) if (o.tx === 'mf') token(o.x, o.y, OPP, '', { anim: 'run' });
        for (const o of this.opps) if (o.tx !== 'mf' && o.tx !== 'ST') token(o.x, o.y, OPP, '', { dim: true, anim: 'idle' });
        const st = this.stPos(u);
        token(st.x, st.y, TEAM, 'ST', { ring: this.ph === 'longpass' ? true : null, anim: u < 1 ? 'run' : null });
        token(this.mf.x, this.mf.y, TEAM, 'MF', { anim: null });
        if (this.ph === 'longpass') {
          ball(this.mf.x + 9, this.mf.y + 11); marker(this.mf.x, this.mf.y);
          if (this.pull) {
            const len = Math.hypot(this.pull.x, this.pull.y) || 1;
            const dist = Math.min(len / 100, 1) * this.range * 500;
            route(this.mf.x + 6, this.mf.y, this.mf.x + (this.pull.x / len) * dist, this.mf.y + (this.pull.y / len) * dist);
          }
        } else {
          const th = this.th; const q = flightAt(th.from, th.land, th.t / th.dur, 34); ball(q.x, q.y, q.z);
          if (th.t >= th.dur) { /* 공이 떨어졌다 */ }
        }
      } else if (this.ph === 'sling') {
        const x = px(this.p); const y = LY(this.laneNow);
        for (const d of this.defs) token(px(d.p), LY(d.lane), OPP, '', { dim: true, anim: 'idle' });
        token(x, y, TEAM, this.kind, { anim: null });
        token(this.stRun.x, this.stRun.y, TEAM, 'ST', { ring: true, anim: 'run' });
        const q = flightAt(this.sl.from, { x: this.stRun.x, y: this.stRun.y + 11 }, this.sl.t / this.sl.dur, 24); ball(q.x, q.y, q.z);
      }
    });
    drawHud();
    if (this.vig > 0 && this.ph === 'run') { const g = ctx.createLinearGradient(0, 0, 110, 0); g.addColorStop(0, `rgba(201,75,75,${0.55 * this.vig * (0.7 + 0.3 * Math.sin(performance.now() / 90))})`); g.addColorStop(1, 'rgba(201,75,75,0)'); ctx.fillStyle = g; ctx.fillRect(0, 38, 110, H - 38); }
    if (this.easy > 1) {
      if (this.ph === 'choose') { const t0 = toScreen(this.mates.WG.x, this.mates.WG.y); pulse(t0.x, t0.y, 18); }
      else if (this.ph === 'run' && !this.inZone) { const r0 = toScreen(px(this.p), LY(this.laneNow)); finger(r0.x - 6, r0.y + 34, 0, -48); }
      else if (this.ph === 'run' && this.inZone) { const r0 = toScreen(px(this.p), LY(this.laneNow)); finger(r0.x - 30, r0.y + 34, 80, 0); }
      else if (this.ph === 'longpass') { const m0 = toScreen(this.mf.x, this.mf.y); finger(m0.x + 10, m0.y + 34, -70, 0); }
    }
    if (this.ph === 'choose') bar(260, 350, 120, 3, 1 - this.t / this.time, C.yellow);
    else if (this.ph === 'longpass') bar(260, 350, 120, 3, 1 - this.t / this.pressT, '#ef4444');
  }
}

// ---------- 수비 장면(사이드): 어깨싸움 → 마무리 막기 → 골키퍼 다이빙 (우리 골문은 왼쪽) ----------
class DefenseScene {
  constructor() {
    this.wantsDoubleTap = false;
    this.overlap = Math.random() < 0.5; // 윙 돌파 3번, 오버래핑 4번
    this.total = this.overlap ? TUNE.shoulderTaps.overlap : TUNE.shoulderTaps.wingRun;
    this.phase = 'shoulder'; this.t = 0; this.gap = 0; this.n = 0; this.results = [];
    this.easy = easyNow();
    this.interval = shoulderInterval(stats.oppAtk) * this.easy; this.tol = shoulderTolerance(stats.speed) * this.easy;
    this.ring = { t: 0 };
    this.lane = pick([0, 4]);
    this.atkX = 470; this.atkY = LY(this.lane); this.wbPush = 0;
    this.after = null; // 애니메이션이 끝난 뒤 실행할 일
    flash(this.overlap ? 'OVERLAP · 4 TAPS ON THE RING' : 'WING RUN · 3 TAPS ON THE RING');
  }

  atk() { return { x: this.atkX, y: this.atkY }; }

  update(dt) {
    this.t += dt;
    if (this.after) { this.after.t += dt; if (this.after.t >= this.after.dur) { const f = this.after.fn; this.after = null; f(); } }
    if (this.phase === 'shoulder') {
      // 공을 가진 상대는 쉬지 않고 골문 쪽(왼쪽)으로 드리블한다
      const v = 14 + this.gap * 6;
      this.atkX = Math.max(300, this.atkX - v * dt); this.atkY += ((LY(2) - this.atkY) * 0.02) * dt * 8;
      this.wbPush = Math.max(0, this.wbPush - dt * 2.5);
      this.ring.t += dt;
      if (this.ring.t > this.interval + this.tol) this.tapResult(false);
    } else if (this.phase === 'block') {
      this.blockT += dt;
      if (this.kickT !== null) { this.kickT += dt; }
      this.cur = gaugeAt(this.blockT, 1.0 - clamp(stats.oppAtk, 0, 20) * 0.015);
      if (this.slide) this.slide.t += dt;
      if (!this.blockDone && this.blockT > 3) this.blockEnd('miss');
    } else if (this.phase === 'dive') {
      this.diveT += dt;
      if (this.gk) this.gk.t += dt;
      if (!this.decided && this.diveT > this.flight + this.win) this.diveEnd(false);
    }
  }

  tapResult(ok) {
    this.results.push(ok);
    if (!ok) this.gap = widenGap(this.gap); else this.wbPush = 1; // 성공하면 어깨로 밀어붙인다
    this.n += 1; this.ring = { t: 0 };
    this.interval = shoulderInterval(stats.oppAtk) * this.easy * rnd(0.8, 1.25); // 매번 박자가 조금씩 달라 외워서는 못 맞춘다
    if (this.n >= this.total) this.startBlock();
  }

  startBlock() {
    this.phase = 'block'; this.blockT = 0; this.kickT = 0; this.blockDone = false; timeScale = 0.55;
    this.win = finishBlockWindow(this.gap, stats.tackle);
    this.shotFrom = { x: this.atkX - 10, y: this.atkY + 11 };
    flash('SLOW MOTION · TAP THE BAR IN THE WINDOW');
  }

  blockEnd(r) {
    this.blockR = r; this.blockDone = true; timeScale = 1;
    this.slide = { t: 0, r };
    sfx.tap();
    if (r === 'perfect') { this.after = { t: 0, dur: 1.2, fn: () => finish('PERFECT BLOCK', '공을 빼앗았어요. 위기를 막았어요', true) }; return; }
    this.after = { t: 0, dur: 0.6, fn: () => this.startDive(r) };
  }

  startDive(r) {
    this.phase = 'dive'; this.diveT = 0; this.partial = r === 'partial'; this.decided = false;
    this.win = diveWindow(stats.reaction, 8, stats.stamina) * (this.partial ? 1.35 : 1);
    this.flight = shotFlightTime(stats.position, stats.oppAtk) * (this.partial ? 1.2 : 1);
    this.dir = pick([-1, 1]);
    this.gk = { t: 0, tap: null, ok: false };
    flash('GOALKEEPER · TAP WHEN THE BALL ARRIVES');
  }

  diveEnd(ok) {
    this.decided = true; this.gk.tap = this.gk.t; this.gk.ok = ok; sfx.tap();
    this.after = {
      t: 0, dur: Math.max(0.5, this.flight - this.diveT) + 0.9,
      fn: () => { if (ok) finish('SAVE', this.partial ? '약해진 슛을 골키퍼가 막았어요' : '골키퍼가 위기를 막았어요', true); else finish('GOAL AGAINST', '실점했어요', false); },
    };
  }

  onGesture(g) {
    if (g.type !== 'tap' || this.after) return;
    if (this.phase === 'shoulder') {
      const diff = Math.abs(this.ring.t - this.interval); const ok = diff <= this.tol;
      if (ok && diff < this.tol * 0.35) { sfx.perfect(); burst(this.atkX, this.atkY, '#fde047', 8, 80); } else if (ok) sfx.ok(); else { sfx.bad(); fx.shake = 3; }
      this.tapResult(ok);
    } else if (this.phase === 'block' && !this.blockDone) this.blockEnd(blockResult(this.cur, this.win));
    else if (this.phase === 'dive' && !this.decided) this.diveEnd(Math.abs(this.diveT - this.flight) <= this.win / 2);
  }

  camera() {
    const a = this.atk();
    if (this.phase === 'dive') camTo((a.x + PITCH.x0) / 2, GY, 1.1);
    else if (this.phase === 'block') camTo(a.x - 40, GY, 1.25);
    else camTo(a.x - 20, (a.y + GY) / 2, 1.3);
  }

  draw() {
    this.camera();
    const a = this.atk();
    world(() => {
      drawField({ goalRight: false });
      const gkHome = { x: PITCH.x0 + 24, y: GY };
      if (this.phase === 'shoulder') {
        // 내 윙백이 나란히 달리며 어깨싸움: 성공하면 어깨로 밀어붙인다
        const wby = a.y + (this.lane === 0 ? -16 : 16) * (1 - this.wbPush * 0.7);
        token(a.x, a.y, OPP, 'ATK', { anim: 'run' }); ball(a.x - 10, a.y + 12);
        token(a.x - 34 + this.gap * 8, wby, TEAM, 'WB', { anim: 'run' });
        token(gkHome.x, gkHome.y, TEAM, 'GK', { anim: 'idle' });
        const kk = clamp(this.ring.t / this.interval, 0, 1.3);
        const r = 30 - kk * 20; // 줄어드는 링이 목표 반지름(10)에 닿는 순간이 박자
        ctx.strokeStyle = WHITE; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(a.x, a.y + 4, Math.max(r, 4), 0, 7); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.arc(a.x, a.y + 4, 10, 0, 7); ctx.stroke();
        this.results.forEach((r2, i) => { ctx.fillStyle = r2 ? '#10b981' : '#ef4444'; ctx.fillRect(a.x - 16 + i * 9, a.y - 30, 6, 4); });
      } else if (this.phase === 'block') {
        // 상대가 슛 자세로 공을 찬다. 내가 타이밍을 맞추면 윙백이 몸을 던져 막는다.
        const kickPose = this.kickT !== null && this.kickT > 0.35;
        token(a.x, a.y, OPP, 'ATK', { kick: kickPose, anim: kickPose ? null : 'idle' });
        const s = this.slide;
        const wbx = s ? lerp(a.x - 34 + this.gap * 8, a.x - 12, clamp(s.t / 0.35, 0, 1)) : a.x - 34 + this.gap * 8;
        token(wbx, a.y + (this.lane === 0 ? -14 : 14), TEAM, 'WB', { lay: s ? clamp(s.t / 0.3, 0, 1) * 1.2 * (this.lane === 0 ? 1 : -1) : 0, anim: s ? null : 'idle' });
        // 공: 슛이 나가고, 막기 결과에 따라 튕기거나 약해진다
        const sf = this.shotFrom; const goalPt = { x: PITCH.x0 + 4, y: GY + this.gap * 4 };
        if (s && s.r === 'perfect') { const q = flightAt({ x: a.x - 14, y: a.y + 12 }, { x: a.x + 40, y: a.y + (this.lane === 0 ? -30 : 30) }, clamp(s.t / 0.6, 0, 1), 20); ball(q.x, q.y, q.z); }
        else if (!this.blockDone || !s) ball(a.x - 10, a.y + 12);
        else { const q = flightAt({ x: a.x - 14, y: a.y + 12 }, { x: lerp(a.x - 14, goalPt.x, 0.3), y: lerp(a.y + 12, goalPt.y, 0.3) }, clamp(s.t / 0.6, 0, 1), 8); ball(q.x, q.y, q.z); }
        void sf;
        token(gkHome.x, gkHome.y, TEAM, 'GK', { anim: 'idle' });
      } else if (this.phase === 'dive') {
        // 공이 골문으로 날아오고, 키퍼가 몸을 던진다
        const u = clamp(this.diveT / this.flight, 0, 1);
        const sf = { x: a.x - 14, y: a.y + 12 }; const end = { x: PITCH.x0 + 6, y: GY + this.dir * 18 };
        const g = this.gk; let kx = gkHome.x; let ky = gkHome.y; let lay = 0;
        if (g.tap !== null) {
          const d = ease(clamp((g.t - g.tap) / 0.4, 0, 1));
          const reach = g.ok ? 1 : 0.5;
          ky = lerp(gkHome.y, GY + this.dir * 18 * (g.ok ? 1 : -0.6), d * reach); kx = lerp(gkHome.x, PITCH.x0 + 18, d * reach);
          lay = clamp(((g.ok ? this.dir : -this.dir)) * 1.25 * d * reach, -1.3, 1.3);
        }
        token(a.x, a.y, OPP, 'ATK', { anim: null });
        token(kx, ky, TEAM, 'GK', { lay, anim: lay ? null : 'idle' });
        if (u < 1) { const q = flightAt(sf, end, u, this.partial ? 8 : 16); ball(q.x, q.y, q.z); }
        else if (g.ok) { const v = clamp((this.diveT - this.flight) / 0.5, 0, 1); const q = flightAt(end, { x: end.x + 36, y: end.y + this.dir * 24 }, v, 14); ball(q.x, q.y, q.z); } // 쳐낸다
        else { const v = clamp((this.diveT - this.flight) / 0.4, 0, 1); ball(end.x - v * 6, end.y, 0); } // 그물에 들어간다
      }
    });
    drawHud();
    if (this.easy > 1 && this.phase === 'shoulder') { const s0 = toScreen(a.x, a.y + 4); pulse(s0.x, s0.y, 14); }
    if (this.phase === 'block' && !this.blockDone) {
      const bx = 150; const bw = 340; const by = 312;
      ctx.fillStyle = 'rgba(15,23,42,0.85)'; ctx.fillRect(bx - 6, by - 8, bw + 12, 34);
      ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(bx, by, bw, 18);
      ctx.fillStyle = 'rgba(245,158,11,0.9)'; ctx.fillRect(bx + bw * (0.5 - this.win.total / 2), by, bw * this.win.total, 18);
      if (this.win.center > 0) { ctx.fillStyle = 'rgba(16,185,129,0.95)'; ctx.fillRect(bx + bw * (0.5 - this.win.center / 2), by, bw * this.win.center, 18); }
      ctx.fillStyle = C.yellow; ctx.fillRect(bx + bw * (this.cur ?? 0) - 2, by - 5, 4, 28);
    } else if (this.phase === 'dive' && !this.decided) {
      const bw = 320; const x0 = 160;
      ctx.fillStyle = 'rgba(15,23,42,0.85)'; ctx.fillRect(x0 - 6, 306, bw + 12, 24);
      ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(x0, 312, bw, 12);
      ctx.fillStyle = 'rgba(16,185,129,0.9)'; ctx.fillRect(x0 + ((this.flight - this.win / 2) / (this.flight + this.win)) * bw, 312, (this.win / (this.flight + this.win)) * bw, 12);
      ctx.fillStyle = C.yellow; ctx.fillRect(x0 + (this.diveT / (this.flight + this.win)) * bw - 2, 307, 4, 22);
    }
  }
}

// ---------- 시작과 루프 ----------
let lastKind = 'attack';
function start(kind, { keepScore = false } = {}) {
  paused = false;
  if (!keepScore) match.on = false;
  plays.total += 1;
  lastKind = kind; overlay.classList.remove('on'); timeScale = 1; pendingTap = null; hud.banner = ''; fx.trail = [];
  hud.clock = clockText(match.on ? ((match.n - 1) / match.total) * 5400 + Math.random() * 180 : 2700);
  ghost = null;
  scene = kind === 'attack' ? new AttackScene() : new DefenseScene();
  intro = { t: 0, kind, clock: hud.clock }; // 시간과 공격/수비 상황을 먼저 보여 준 뒤 플레이한다
}
// SIM: 이 장면을 건너뛰고 능력으로 자동 처리한다(경기 중에는 남은 장면 전부)
function sim() {
  if (match.on) {
    scene = null; ghost = null; const left = match.total - match.n;
    for (let i = 0; i < left; i++) { if (Math.random() < pAttack()) { if (Math.random() < 0.13 * 0.9) hud.me += 1; } else if (Math.random() < 0.2 * 1.1) hud.opp += 1; }
    match.n = match.total; hud.no = match.total; endMatch(); return;
  }
  if (!scene) return;
  const goal = Math.random() < (lastKind === 'attack' ? 0.13 : 0.2);
  finish(goal ? (lastKind === 'attack' ? 'GOAL' : 'GOAL AGAINST') : 'AUTO', goal ? '자동 진행 결과예요' : '자동으로 넘겼어요', lastKind === 'attack' ? goal : !goal);
}
document.getElementById('btn-auto').onclick = sim;

// 일시정지 메뉴(시작 화면과 같다): 경기, 연습 장면, 소리, 수치 조정
function showMenu(title, sub, { resume = false } = {}) {
  paused = true;
  box.innerHTML = `<h2>${title}</h2><p>${sub}</p>
    ${resume ? '<button class="btn btn--primary" data-m="resume">RESUME</button>' : ''}
    <button class="btn ${resume ? '' : 'btn--primary'}" data-m="match">MATCH · 10 SCENES</button>
    <div class="row"><button class="btn" data-m="atk">ATTACK</button><button class="btn" data-m="def">DEFENSE</button></div>
    <div class="row"><button class="btn" data-m="snd">${soundOn ? 'SOUND ON' : 'SOUND OFF'}</button><button class="btn" data-m="tune">TUNE</button></div>`;
  overlay.classList.add('on');
  box.querySelectorAll('[data-m]').forEach((b) => b.addEventListener('click', (e) => {
    const m = e.currentTarget.dataset.m;
    unlockAudio();
    if (m === 'snd') { soundOn = !soundOn; e.currentTarget.textContent = soundOn ? 'SOUND ON' : 'SOUND OFF'; sfx.tap(); return; }
    if (m === 'tune') { tunebox.classList.toggle('on'); return; }
    paused = false; overlay.classList.remove('on'); tunebox.classList.remove('on');
    if (m === 'match') startMatch(); else if (m === 'atk') start('attack'); else if (m === 'def') start('defense');
  }));
}
document.getElementById('btn-pause').onclick = () => { if (!overlay.classList.contains('on')) showMenu('PAUSED', '잠깐 멈췄어요', { resume: true }); };

function frame(now) {
  const raw = Math.min(0.05, (now - last) / 1000);
  if (intro && !paused) { intro.t += raw; if (intro.t >= TUNE.introTime) intro = null; }
  const dt = (fx.freeze > 0 || paused || intro) ? 0 : raw * timeScale * TUNE.pace; last = now; // 히트스톱·안내 중에는 멈추고, 평소에도 천천히 흐른다
  if (!paused) stepFx(raw);
  ctx.setTransform(cv.width / W, 0, 0, cv.height / H, 0, 0); // 캔버스는 2배 해상도(1280x720), 좌표는 640x360
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = C.turf; ctx.fillRect(0, 0, W, H);
  updateHud();
  if (scene) { scene.update?.(dt); stepCam(raw); scene?.draw?.(); if (intro) drawIntro(); } else if (ghost) { stepCam(raw); ghost.draw?.(); } else { camTo(320, GY, 1); stepCam(raw); world(() => drawField()); }
  if (fx.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${fx.flash * 0.35})`; ctx.fillRect(0, 0, W, H); }
  requestAnimationFrame(frame);
}
showMenu('HIGHLIGHT', '가로 화면에서 직접 플레이하는 하이라이트예요');
requestAnimationFrame((n) => { last = n; frame(n); });
window.fmHighlight = { stats, start, startMatch, match, fx, sim, get scene() { return scene; } };
