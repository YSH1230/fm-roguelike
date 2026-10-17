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
const PITCH = { x0: 14, x1: 626, y0: 44, y1: 346 };
const px = (p) => 70 + p * 500; // 진행(0~1) → 가로 위치
const LY = (i) => 84 + i * 60; // 레인(5개) → 세로 위치
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
document.getElementById('btn-tune').onclick = () => tunebox.classList.toggle('on');

// ---------- 카메라: 항상 전체를 보여 주지 않고, 상황에 맞는 곳으로 확대한다 ----------
const cam = { x: 320, y: 195, z: 1 };
const camT = { x: 320, y: 195, z: 1 };
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
function world(fn) { ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(cam.z, cam.z); ctx.translate(-cam.x, -cam.y); fn(); ctx.restore(); }
const toWorld = (p) => ({ x: (p.x - W / 2) / cam.z + cam.x, y: (p.y - H / 2) / cam.z + cam.y });

let scene = null;
let last = 0;
let timeScale = 1;
const hud = { me: 0, opp: 0, no: 1, banner: '' };

// ---------- 입력: 탭, 더블탭, 스와이프, 당기기 ----------
const toLocal = (e) => {
  const r = cv.getBoundingClientRect();
  return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
};
let down = null;
let pendingTap = null;
cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); down = toLocal(e); scene?.onDown?.(down); });
cv.addEventListener('pointermove', (e) => { if (down) scene?.onMove?.(toLocal(e), down); });
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
// 패스 경로: 점선 + 끝의 열린 화살표(FM-Lite의 얇은 선 규칙)
function route(x0, y0, x1, y1, color = WHITE) {
  line(x0, y0, x1, y1, color, 1.5, [4, 5]);
  const a = Math.atan2(y1 - y0, x1 - x0);
  ctx.strokeStyle = color; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(x1 - 9 * Math.cos(a - 0.5), y1 - 9 * Math.sin(a - 0.5)); ctx.lineTo(x1, y1); ctx.lineTo(x1 - 9 * Math.cos(a + 0.5), y1 - 9 * Math.sin(a + 0.5)); ctx.stroke();
}
// 선수 토큰: 각진 사각형 + 포지션 약자 (로스터의 얼굴 타일과 같은 말)
function token(x, y, color, label = '', { ring = null, size = 22, dim = false } = {}) {
  ctx.globalAlpha = dim ? 0.35 : 1;
  ctx.fillStyle = color; ctx.fillRect(x - size / 2, y - size / 2, size, size);
  if (ring) { ctx.strokeStyle = ring; ctx.lineWidth = 2; ctx.strokeRect(x - size / 2 - 3, y - size / 2 - 3, size + 6, size + 6); }
  if (label) T(label, x, y + 4, 11, color === WHITE || color === OPP ? '#111' : '#111');
  ctx.globalAlpha = 1;
}
function ball(x, y) { ctx.fillStyle = WHITE; ctx.beginPath(); ctx.arc(x, y, 4, 0, 7); ctx.fill(); }

function drawField({ goalRight = true } = {}) {
  ctx.fillStyle = '#1c2a20'; ctx.fillRect(PITCH.x0, PITCH.y0, PITCH.x1 - PITCH.x0, PITCH.y1 - PITCH.y0);
  // 가로 띠(아주 옅게)
  for (let i = 0; i < 10; i++) { ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.0)'; ctx.fillRect(PITCH.x0 + i * 61.2, PITCH.y0, 61.2, PITCH.y1 - PITCH.y0); }
  ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1.5;
  ctx.strokeRect(PITCH.x0, PITCH.y0, PITCH.x1 - PITCH.x0, PITCH.y1 - PITCH.y0);
  line(320, PITCH.y0, 320, PITCH.y1, 'rgba(255,255,255,0.3)', 1.5);
  ctx.beginPath(); ctx.arc(320, 195, 40, 0, 7); ctx.stroke();
  const gx = goalRight ? PITCH.x1 : PITCH.x0;
  const bx = goalRight ? gx - 104 : gx;
  ctx.strokeRect(bx, 118, 104, 154); ctx.strokeRect(goalRight ? gx - 40 : gx, 158, 40, 74);
  ctx.fillStyle = WHITE; ctx.fillRect(goalRight ? gx - 2 : gx - 2, 158, 4, 74); // 골대
  // 레인 보조선(공격 장면)
  ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1;
  for (let i = 0; i < TUNE.lanes; i++) line(PITCH.x0, LY(i), PITCH.x1, LY(i), 'rgba(255,255,255,0.05)', 1);
}

function drawHud(label) {
  ctx.fillStyle = '#222'; ctx.fillRect(0, 0, W, 38);
  line(0, 38, W, 38, 'rgba(255,255,255,0.18)', 1, [2, 3]);
  T('ME', 14, 24, 12, '#9a9a9a', 'left'); T(String(hud.me), 40, 25, 20, TEAM, 'left');
  T('OPP', 78, 24, 12, '#9a9a9a', 'left'); T(String(hud.opp), 112, 25, 20, WHITE, 'left');
  T(label ?? `SCENE ${hud.no} / 20`, 320, 25, 14, '#9a9a9a');
  if (hud.banner) {
    ctx.fillStyle = 'rgba(34,34,34,0.92)'; const w = Math.max(160, hud.banner.length * 7.4 + 28);
    ctx.fillRect(320 - w / 2, 52, w, 26); ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1; ctx.strokeRect(320 - w / 2, 52, w, 26);
    T(hud.banner, 320, 70, 13);
  }
}
function bar(x, y, w, h, v, color) { ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fillRect(x, y, w, h); ctx.fillStyle = color; ctx.fillRect(x, y, w * clamp(v, 0, 1), h); }
const flash = (t) => { hud.banner = t; };

function finish(title, sub, ok) {
  scene = null; timeScale = 1; hud.banner = '';
  if (title === 'GOAL') hud.me += 1;
  if (title === 'GOAL AGAINST') hud.opp += 1;
  hud.no = Math.min(20, hud.no + 1);
  box.innerHTML = `<h2 style="color:${ok ? '#fff' : '#9a9a9a'}">${title}</h2><p>${sub}</p><button class="btn btn--primary" id="again">AGAIN</button>`;
  overlay.classList.add('on');
  document.getElementById('again').onclick = () => start(lastKind);
}

// ---------- 슛 장면(공통): 두 게이지를 차례로 탭한다 ----------
class ShootScene {
  constructor({ curl = false, striker = false, farSide = 1, rebound = false, onDone }) {
    Object.assign(this, { curl, striker, farSide, rebound, onDone });
    this.t = 0; this.real = 0; this.phase = rebound ? 'aim' : 'power'; this.power = 0.65; this.aim = 0.5; this.result = null; this.hold = 0; this.cur = 0;
    this.limit = shootTime(stats.finishing, striker);
    timeScale = 0.55; // 마무리 순간은 슬로우 모션
    flash(rebound ? 'REBOUND · TAP TO AIM' : (curl ? 'TAP: CURL, THEN TAP: AIM' : 'TAP: POWER, THEN TAP: AIM'));
  }

  update(dt) {
    this.t += dt; this.real += dt / timeScale; // 제한 시간은 실제 시간(슬로우 모션과 무관)
    if (this.result) { this.hold += dt / timeScale; if (this.hold > 1.0) { timeScale = 1; this.onDone(this.result); } return; }
    if (this.real > this.limit) { this.settle('miss'); return; }
    this.cur = gaugeAt(this.t, this.phase === 'power' ? TUNE.gaugeCycle : TUNE.gaugeCycle * 0.9);
  }

  onGesture(g) {
    if (this.result || g.type !== 'tap') return;
    if (this.phase === 'power') { this.power = gaugeAt(this.t, TUNE.gaugeCycle); this.phase = 'aim'; return; }
    this.aim = gaugeAt(this.t, TUNE.gaugeCycle * 0.9);
    this.settle(resolveShot({ power: this.rebound ? 0.65 : this.power, aim: aimOf(this.aim), shooting: stats.shooting, curl: this.curl, farSide: this.farSide }));
  }

  settle(r) { this.result = r; this.hold = 0; hud.banner = ''; }

  draw() {
    camTo(px(0.93), 195, 2.1); // 골문 쪽으로 확대
    world(() => {
      drawField();
      const ky = 195 + (this.result ? clamp(aimOf(this.aim) * 30, -40, 40) * 0.7 : Math.sin(this.t * 1.5) * 12);
      token(PITCH.x1 - 40, ky, OPP, 'GK');
      if (this.result) ball(PITCH.x1 - 6, clamp(195 + aimOf(this.aim) * 36, 150, 240));
    });
    drawHud('SHOT');
    const gx = 150; const gw = 340; const gy = 296;
    const [lo, hi] = powerWindow(stats.shooting, { curl: this.curl });
    T(this.phase === 'power' ? (this.curl ? 'CURL' : 'POWER') : 'AIM', 320, gy - 10, 14);
    ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fillRect(gx, gy, gw, 18);
    if (this.phase === 'power') {
      ctx.fillStyle = 'rgba(255,255,255,0.65)'; ctx.fillRect(gx + gw * lo, gy, gw * (hi - lo), 18);
      ctx.fillStyle = TEAM; ctx.fillRect(gx + gw * this.cur - 2, gy - 5, 4, 28);
    } else {
      const g = (a) => (a + 1.2) / 2.4;
      const zone = (a, b, c) => { ctx.fillStyle = c; ctx.fillRect(gx + gw * a, gy, gw * (b - a), 18); };
      zone(g(-1.05), g(-0.95), 'rgba(185,163,90,0.95)'); zone(g(0.95), g(1.05), 'rgba(185,163,90,0.95)');
      if (this.curl) zone(this.farSide > 0 ? g(0.45) : g(-0.95), this.farSide > 0 ? g(0.95) : g(-0.45), 'rgba(255,255,255,0.65)');
      else { zone(g(-0.95), g(-0.45), 'rgba(255,255,255,0.65)'); zone(g(0.45), g(0.95), 'rgba(255,255,255,0.65)'); }
      ctx.fillStyle = TEAM; ctx.fillRect(gx + gw * (this.result ? this.aim : this.cur) - 2, gy - 5, 4, 28);
      T(`POWER ${this.power >= lo && this.power <= hi ? 'OK' : (this.power < lo ? 'WEAK' : 'STRONG')}`, 320, gy + 38, 12, '#9a9a9a');
    }
    bar(250, 346, 140, 4, 1 - this.real / this.limit, TEAM);
    if (this.result) T({ goal: 'GOAL', save: 'SAVED', post: 'OFF THE POST', miss: 'MISS' }[this.result], 320, 118, 40, this.result === 'goal' ? TEAM : WHITE);
  }
}

// ---------- 공격 장면 ----------
class AttackScene {
  constructor() {
    this.wantsDoubleTap = false;
    this.phase = 'choose'; this.t = 0;
    this.startLane = pick([0, 2, 4]); // 위쪽 / 중앙 / 아래쪽 해시
    this.depth = rnd(0.05, 0.4); // 깊이 0~1(상대 진영)
    this.time = chooseTime(stats.vision);
    this.side = this.startLane >= 2 ? -1 : 1;
    const mx = px(this.depth); const my = LY(this.startLane);
    this.press = { x: mx - 110, y: my + this.side * 50 };
    this.targets = [
      { id: 'WG', x: px(this.depth + 0.2), y: my + this.side * 56, label: 'WG' },
      { id: 'WB', x: px(Math.max(0, this.depth - 0.12)), y: my + this.side * 56, label: 'WB' },
      { id: 'ST', x: px(0.93), y: LY(2), label: 'ST' },
    ];
    flash(['OWN HALF', 'MIDFIELD', 'FINAL THIRD'][this.depth < 0.25 ? 0 : (this.depth < 0.45 ? 1 : 2)] + ' · PICK A TARGET');
  }

  update(dt) {
    this.t += dt;
    if (this.phase === 'choose') {
      const k = Math.min(1, dt * 1.6 / Math.max(this.time, 1));
      this.press.x += (px(this.depth) - this.press.x) * k; this.press.y += (LY(this.startLane) - this.press.y) * k;
      if (this.t >= this.time) this.end(false, 'TURNOVER', '선택 시간이 끝났어요. 상대가 공을 뺏었어요');
    } else if (this.phase === 'run') this.updateRun(dt);
    else if (this.phase === 'longpass') this.updateLong(dt);
    else if (this.phase === 'shoot') this.sub?.update(dt);
  }

  end(ok, title, sub) { this.phase = 'result'; finish(title, sub, ok); }

  // ----- 윙/윙백 달리기 -----
  startRun(kind) {
    this.phase = 'run'; this.kind = kind; this.t = 0;
    this.lane = this.startLane; this.laneTo = this.lane; this.laneT = 1; this.laneNow = this.lane;
    this.p = clamp(this.depth + (kind === 'WG' ? 0.2 : -0.12), 0, 0.9);
    this.speedBase = runnerSpeed(stats.speed) * 0.22;
    this.sprint = { used: false, t: 0 }; this.skill = { cd: 0, active: 0 }; this.laneCd = 0;
    const n = frontDefenderCount(this.p, stats.oppDef);
    const span = 0.68 - (this.p + 0.18);
    this.defs = Array.from({ length: n }, (_, i) => ({ p: this.p + 0.18 + (span * (i + 0.5)) / n, lane: Math.floor(rnd(0, TUNE.lanes)), passed: false }));
    this.zoneStart = Math.max(...this.defs.map((d) => d.p)) + 0.04;
    this.chaser = Math.max(0, this.p - 0.35);
    this.chaserV = chaserSpeed(stats.oppDef, this.p) * 0.22;
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
    if (this.laneT < 1) { this.laneT = Math.min(1, this.laneT + dt * 7); if (this.laneT >= 1) this.lane = this.laneTo; }
    this.laneNow = this.laneT < 1 ? (this.lane + (this.laneTo - this.lane) * this.laneT) : this.lane;
    for (const d of this.defs) {
      if (d.passed || this.p < d.p - 0.012) continue;
      if (Math.abs(this.p - d.p) <= 0.025 && Math.abs(this.laneNow - d.lane) < 0.7) {
        if (this.skill.active > 0) { d.passed = true; d.beaten = true; } else return this.end(false, 'TURNOVER', '앞 수비수에게 막혔어요');
      } else if (this.p > d.p + 0.025) d.passed = true;
    }
    if (this.chaser >= this.p) return this.end(false, 'TURNOVER', '뒤에서 따라온 압박에 공을 뺏겼어요');
    this.inZone = this.p >= this.zoneStart;
    if (this.inZone) flash(this.kind === 'WG' ? 'SHOOT ZONE · SWIPE → SHOT · SWIPE ← PASS TO ST' : 'SHOOT ZONE · SWIPE ← PASS TO ST');
    if (this.p >= 0.97) this.end(false, 'TURNOVER', '슛 구간 끝까지 입력이 없었어요');
  }

  // ----- 스트라이커 직결: 새총 -----
  startLong() {
    this.phase = 'longpass'; this.t = 0; this.wantsDoubleTap = false; this.drag = false; this.pull = null; this.released = false;
    this.range = slingRange(stats.pass, stats.stamina, 5);
    this.pressT = this.time * 1.2 + 2.5; // 당기고 놓을 시간을 충분히 준다(능력은 시야로)
    const lane = pick([1, 3]);
    this.path = [{ x: px(0.6), y: LY(lane) }, { x: px(0.86), y: LY(2) + (lane === 1 ? -14 : 14) }]; // 스트라이커의 침투 점선
    flash('DRAG BACK ← AND RELEASE TO PASS');
  }

  updateLong(dt) {
    this.t += dt;
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
    const sx = px(this.depth); const sy = LY(this.startLane);
    const land = { x: sx + (vx / len) * dist, y: sy + (vy / len) * dist };
    this.released = true; this.pull = null; this.land = land;
    const near = this.path.reduce((m, q) => Math.min(m, Math.hypot(q.x - land.x, q.y - land.y)), Infinity);
    const tol = 24 + stats.speed * 1.5;
    if (near <= tol) { this.phase = 'shoot'; this.sub = new ShootScene({ striker: true, onDone: (r) => this.shotEnd(r, true) }); }
    else this.end(false, 'MISSED PASS', '낙구 지점이 스트라이커의 침투 경로에서 벗어났어요');
  }

  // ----- 입력 -----
  onGesture(g) {
    if (this.phase === 'shoot') { this.sub.onGesture(g); return; }
    if (this.phase === 'choose' && g.type === 'tap') {
      const wp = toWorld(g);
      const t = this.targets.find((q) => Math.hypot(q.x - wp.x, q.y - wp.y) < 34);
      if (!t) return;
      if (t.id === 'ST') this.startLong(); else this.startRun(t.id);
      return;
    }
    if (this.phase === 'run') {
      if (g.type === 'swipeUp' || g.type === 'swipeDown') {
        if (this.laneCd > 0 || this.laneT < 1) return;
        const to = clamp(this.lane + (g.type === 'swipeUp' ? -1 : 1), 0, TUNE.lanes - 1);
        if (to !== this.lane) { this.laneTo = to; this.laneT = 0; this.laneCd = TUNE.laneCutCooldown; }
      } else if (g.type === 'tap') {
        if (!this.sprint.used) { this.sprint.used = true; this.sprint.t = TUNE.sprintTime; }
      } else if (g.type === 'dtap') {
        if (this.skill.cd <= 0 && this.sprint.t <= 0) { this.skill.cd = TUNE.skillCooldown; this.skill.active = skillWindow(stats.dribble); }
      } else if (g.type === 'swipeRight') {
        if (this.kind !== 'WG' || !this.inZone) return; // 윙만 직접 슛
        this.phase = 'shoot'; this.wantsDoubleTap = false;
        this.sub = new ShootScene({ curl: true, farSide: this.laneNow >= 2 ? -1 : 1, onDone: (r) => this.shotEnd(r, false) });
      } else if (g.type === 'swipeLeft') {
        if (!this.inZone) return; // 뒤로 당기기 = 스트라이커에게 새총 패스
        this.phase = 'shoot'; this.wantsDoubleTap = false;
        this.sub = new ShootScene({ striker: true, onDone: (r) => this.shotEnd(r, true) });
      }
    }
  }

  shotEnd(r, striker) {
    if (r === 'post' && !this.reb) { this.reb = true; this.sub = new ShootScene({ striker, rebound: true, onDone: (r2) => this.shotEnd(r2, striker) }); return; }
    this.end(r === 'goal', r === 'goal' ? 'GOAL' : ({ save: 'SAVED', post: 'OFF THE POST', miss: 'MISS' }[r]), r === 'goal' ? '공격이 골로 이어졌어요' : '마무리가 막혔어요');
  }

  aimCamera() {
    const mx = px(this.depth); const my = LY(this.startLane);
    if (this.phase === 'choose') camFit([{ x: mx, y: my }, ...this.targets, this.press], { max: 1.7 });
    else if (this.phase === 'run') camTo(px(this.p) + 70, LY(this.laneNow), 2.0); // 달리는 선수를 따라간다
    else if (this.phase === 'longpass') camFit([{ x: mx, y: my }, ...this.path, this.press], { max: 1.5 });
  }

  draw() {
    if (this.phase === 'shoot') { this.sub.draw(); return; }
    this.aimCamera();
    const mx = px(this.depth); const my = LY(this.startLane);
    world(() => {
      drawField();
      if (this.phase === 'choose') {
        for (const t of this.targets) route(mx + 14, my, t.x - 20, t.y);
        for (const t of this.targets) token(t.x, t.y, TEAM, t.label, { ring: WHITE });
        token(mx, my, TEAM, 'MF'); ball(mx + 18, my + 2);
        token(this.press.x, this.press.y, OPP, '', { size: 18 });
        for (let i = 0; i < 3; i++) token(px(this.depth + 0.4 + i * 0.1), LY(1 + i), OPP, '', { size: 18, dim: true });
      } else if (this.phase === 'run') {
        const zx = px(this.zoneStart);
        ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(zx, PITCH.y0 + 1, PITCH.x1 - zx, PITCH.y1 - PITCH.y0 - 2);
        line(zx, PITCH.y0, zx, PITCH.y1, 'rgba(255,255,255,0.45)', 1, [3, 4]);
        if (this.p < 1) T('SHOOT ZONE', zx + (PITCH.x1 - zx) / 2, PITCH.y0 + 18, 12, '#b9a35a');
        for (const d of this.defs) token(px(d.p), LY(d.lane), OPP, '', { size: 20, dim: Boolean(d.beaten) });
        token(px(this.chaser), LY(this.laneNow), '#c94b4b', '', { size: 18 });
        const x = px(this.p); const y = LY(this.laneNow);
        token(x, y, TEAM, this.kind, { ring: this.skill.active > 0 ? WHITE : (this.sprint.t > 0 ? '#b9a35a' : null) });
        ball(x + 18, y + 2);
      } else if (this.phase === 'longpass') {
        line(this.path[0].x, this.path[0].y, this.path[1].x, this.path[1].y, WHITE, 1.5, [3, 5]);
        ctx.fillStyle = WHITE; for (const q of this.path) ctx.fillRect(q.x - 3, q.y - 3, 6, 6);
        token(this.path[0].x, this.path[0].y, TEAM, 'ST', { ring: WHITE });
        token(mx, my, TEAM, 'MF'); ball(mx + 18, my + 2);
        token(this.press.x, this.press.y, OPP, '', { size: 18 });
        if (this.pull) {
          const len = Math.hypot(this.pull.x, this.pull.y) || 1;
          const dist = Math.min(len / 100, 1) * this.range * 500;
          route(mx + 14, my, mx + (this.pull.x / len) * dist, my + (this.pull.y / len) * dist, TEAM);
        }
      }
    });
    drawHud();
    // 화면 고정 UI(제한 시간 막대, 조작 안내)
    if (this.phase === 'choose') bar(260, 346, 120, 4, 1 - this.t / this.time, TEAM);
    else if (this.phase === 'run') {
      const cd = (a, b, label) => T(label, a, 354, 11, b > 0 ? '#555' : '#9a9a9a');
      cd(200, this.laneCd, 'DODGE ↑↓'); cd(320, this.sprint.used ? 1 : 0, 'SPRINT: TAP'); cd(440, this.skill.cd, 'SKILL: 2× TAP');
    } else if (this.phase === 'longpass') bar(260, 346, 120, 4, 1 - this.t / this.pressT, '#c94b4b');
  }
}

// ---------- 수비 장면(사이드): 어깨싸움 → 마무리 막기 → 골키퍼 다이빙 (우리 골문은 왼쪽) ----------
class DefenseScene {
  constructor() {
    this.wantsDoubleTap = false;
    this.overlap = Math.random() < 0.5; // 윙 돌파 3번, 오버래핑 4번
    this.total = this.overlap ? TUNE.shoulderTaps.overlap : TUNE.shoulderTaps.wingRun;
    this.phase = 'shoulder'; this.t = 0; this.gap = 0; this.n = 0; this.results = [];
    this.interval = shoulderInterval(stats.oppAtk); this.tol = shoulderTolerance(stats.speed);
    this.ring = { t: 0 };
    this.lane = pick([0, 4]);
    flash(this.overlap ? 'OVERLAP · 4 TAPS ON THE RING' : 'WING RUN · 3 TAPS ON THE RING');
  }

  atk() { return { x: 420 - (this.n / this.total) * 110, y: LY(this.lane) + (this.lane === 0 ? 26 : -26) * (this.n / this.total) }; }

  update(dt) {
    this.t += dt;
    if (this.phase === 'shoulder') {
      this.ring.t += dt;
      if (this.ring.t > this.interval + this.tol) this.tapResult(false);
    } else if (this.phase === 'block') {
      this.blockT += dt;
      this.cur = gaugeAt(this.blockT, 1.0 - clamp(stats.oppAtk, 0, 20) * 0.015);
      if (this.blockT > 3) this.blockEnd('miss');
    } else if (this.phase === 'dive') {
      this.diveT += dt;
      if (this.diveT > this.flight + this.win) this.diveEnd(false);
    }
  }

  tapResult(ok) {
    this.results.push(ok);
    if (!ok) this.gap = widenGap(this.gap);
    this.n += 1; this.ring = { t: 0 };
    this.interval = shoulderInterval(stats.oppAtk) * rnd(0.8, 1.25); // 매번 박자가 조금씩 달라 외워서는 못 맞춘다
    if (this.n >= this.total) this.startBlock();
  }

  startBlock() {
    this.phase = 'block'; this.blockT = 0; timeScale = 0.55;
    this.win = finishBlockWindow(this.gap, stats.tackle);
    flash('SLOW MOTION · TAP THE BAR IN THE WINDOW');
  }

  blockEnd(r) {
    this.blockR = r; timeScale = 1;
    if (r === 'perfect') { finish('PERFECT BLOCK', '공을 빼앗았어요. 위기를 막았어요', true); return; }
    this.phase = 'dive'; this.diveT = 0; this.partial = r === 'partial';
    this.win = diveWindow(stats.reaction, 8, stats.stamina) * (this.partial ? 1.35 : 1);
    this.flight = shotFlightTime(stats.position, stats.oppAtk) * (this.partial ? 1.2 : 1);
    this.dir = pick([-1, 1]);
    flash('GOALKEEPER · TAP WHEN THE BALL ARRIVES');
  }

  diveEnd(ok) {
    this.phase = 'done';
    if (ok) finish('SAVE', this.partial ? '약해진 슛을 골키퍼가 막았어요' : '골키퍼가 위기를 막았어요', true);
    else finish('GOAL AGAINST', '실점했어요', false);
  }

  onGesture(g) {
    if (g.type !== 'tap') return;
    if (this.phase === 'shoulder') this.tapResult(Math.abs(this.ring.t - this.interval) <= this.tol);
    else if (this.phase === 'block') this.blockEnd(blockResult(this.cur, this.win));
    else if (this.phase === 'dive') this.diveEnd(Math.abs(this.diveT - this.flight) <= this.win / 2);
  }

  draw() {
    const a = this.atk();
    if (this.phase === 'dive') camTo((a.x + PITCH.x0) / 2, 195, 1.45);
    else camTo(a.x - 20, a.y, 2.3); // 공을 가진 상대와 내 윙백을 크게
    world(() => {
      drawField({ goalRight: false });
      if (this.phase === 'shoulder') {
        token(a.x, a.y, OPP, 'ATK'); ball(a.x - 18, a.y + 2);
        token(a.x - 44, a.y + (this.lane === 0 ? -14 : 14), TEAM, 'WB');
        const k = clamp(this.ring.t / this.interval, 0, 1.3);
        const r = 44 - k * 30; // 줄어드는 링이 목표 반지름(14)에 닿는 순간이 박자
        ctx.strokeStyle = WHITE; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(a.x, a.y, Math.max(r, 6), 0, 7); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(a.x, a.y, 14, 0, 7); ctx.stroke();
        token(40, 195, TEAM, 'GK');
      } else if (this.phase === 'block') {
        token(a.x, a.y, OPP, 'ATK'); ball(a.x - 18, a.y + 2);
        token(a.x - 50 + this.gap * 12, a.y + (this.lane === 0 ? -14 : 14), TEAM, 'WB');
        token(40, 195, TEAM, 'GK');
      } else if (this.phase === 'dive') {
        const k = clamp(this.diveT / this.flight, 0, 1);
        const sx = a.x - 18; const sy = a.y + 2; const ex = PITCH.x0 + 8; const ey = 195 + this.dir * 30;
        ball(sx + (ex - sx) * k, sy + (ey - sy) * k);
        token(a.x, a.y, OPP, 'ATK');
        token(44, 195 + this.dir * 30 * (this.diveT > this.flight - this.win / 2 ? 1 : 0.2), TEAM, 'GK');
      }
    });
    drawHud('DEFENSE');
    if (this.phase === 'shoulder') {
      T(`${this.n + 1} / ${this.total}`, 320, 104, 20);
      this.results.forEach((r2, i) => { ctx.fillStyle = r2 ? '#ffffff' : '#555'; ctx.fillRect(298 + i * 14, 112, 10, 6); });
      T(`GAP ${this.gap}`, 320, 134, 12, '#9a9a9a');
    } else if (this.phase === 'block') {
      const bx = 150; const bw = 340; const by = 296;
      ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fillRect(bx, by, bw, 20);
      ctx.fillStyle = 'rgba(185,163,90,0.9)'; ctx.fillRect(bx + bw * (0.5 - this.win.total / 2), by, bw * this.win.total, 20);
      if (this.win.center > 0) { ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fillRect(bx + bw * (0.5 - this.win.center / 2), by, bw * this.win.center, 20); }
      ctx.fillStyle = TEAM; ctx.fillRect(bx + bw * (this.cur ?? 0) - 2, by - 5, 4, 30);
      T('BLOCK', 320, by - 10, 14);
    } else if (this.phase === 'dive') {
      const bw = 320; const x0 = 160;
      ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fillRect(x0, 296, bw, 12);
      ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillRect(x0 + ((this.flight - this.win / 2) / (this.flight + this.win)) * bw, 296, (this.win / (this.flight + this.win)) * bw, 12);
      ctx.fillStyle = TEAM; ctx.fillRect(x0 + (this.diveT / (this.flight + this.win)) * bw - 2, 291, 4, 22);
      T('DIVE', 320, 286, 14);
    }
  }
}

// ---------- 시작과 루프 ----------
let lastKind = 'attack';
function start(kind) {
  lastKind = kind; overlay.classList.remove('on'); timeScale = 1; pendingTap = null; hud.banner = '';
  scene = kind === 'attack' ? new AttackScene() : new DefenseScene();
}
document.getElementById('btn-atk').onclick = () => start('attack');
document.getElementById('btn-def').onclick = () => start('defense');
// AUTO: 이 장면을 건너뛰고 능력으로 자동 처리한다(시안: 낮은 확률로 골/실점)
document.getElementById('btn-auto').onclick = () => {
  if (!scene) return;
  const goal = Math.random() < (lastKind === 'attack' ? 0.13 : 0.2);
  finish(goal ? (lastKind === 'attack' ? 'GOAL' : 'GOAL AGAINST') : 'AUTO', goal ? '자동 진행 결과예요' : '자동으로 넘겼어요', lastKind === 'attack' ? goal : !goal);
};

function frame(now) {
  const raw = Math.min(0.05, (now - last) / 1000);
  const dt = raw * timeScale; last = now;
  ctx.fillStyle = '#222'; ctx.fillRect(0, 0, W, H);
  if (scene) { scene.update?.(dt); stepCam(raw); scene?.draw?.(); } else { camTo(320, 195, 1); stepCam(raw); world(() => drawField()); drawHud('HIGHLIGHT'); }
  requestAnimationFrame(frame);
}
box.innerHTML = '<h2>HIGHLIGHT</h2><p>가로 화면에서 사이드 공격과 사이드 수비를 해볼 수 있어요. 아래 버튼으로 시작하세요.</p>';
overlay.classList.add('on');
requestAnimationFrame((n) => { last = n; frame(n); });
for (const id of ['btn-atk', 'btn-def']) document.getElementById(id).addEventListener('click', () => overlay.classList.remove('on'));
window.fmHighlight = { stats, start, get scene() { return scene; } };
