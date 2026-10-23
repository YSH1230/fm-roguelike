// 풋살 시연판 화면: 시뮬(futsalSim)이 정한 상태를 그리고 포인터를 futsalInput에 연결한다. 상태는 읽기만 한다.
import { TUNE, clockText } from './futsalRules.mjs';
import { createInput } from './futsalInput.mjs';
import { zzfx } from './zzfx.mjs';
import { createMatch, update, demoTeam, startSecondHalf, flyingGkAvailable, canAct, FORMATIONS } from './futsalSim.mjs';

const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');
const overlay = document.getElementById('overlay');
const box = overlay.querySelector('.box');
const CW = 1280; const CH = 720;
const COURT_W = TUNE.court.w; const COURT_H = TUNE.court.h;
const MARGIN = 1.6; // 코트 밖 여백(m)
const pxm = CW / (COURT_W + MARGIN * 2); // 1m의 캔버스 px
const X = (m) => (m + MARGIN) * pxm;
const Y = (m) => CH / 2 + (m - COURT_H / 2) * pxm;
const PLAYER_SCALE = 1.2; // 실제 비율(키 1.8m)의 1.2배
const input = createInput();
let M = null;
let paused = true;
let last = 0;
let seed = 1;
let stance = 'balanced';
let fxs = []; // 화면 피드백(링)
const tail = []; // 공 꼬리
let ballRot = 0;
let banner = null; // { text, t } 골 연출 등(글자는 쓰지 않고 색 번쩍임으로만)
let flash = 0;

// ---------- 소리와 진동: 입력 시점이 아니라 발사/임팩트 시점의 이벤트로 재생한다(ZzFX, MIT) ----------
// zzfx(볼륨, 랜덤, 주파수, 어택, 서스테인, 릴리스, 파형, 곡선, 슬라이드, ...). 굴러가는 공은 조용하다.
const canVibrate = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'; // 아이폰 사파리 등은 지원하지 않아 소리와 화면 효과로 대신한다
let vibOn = canVibrate;
const buzz = (ms) => { if (vibOn && canVibrate) { try { navigator.vibrate(ms); } catch { /* 무시 */ } } };
const sfx = {
  pass: (d = 8) => { zzfx(0.6, 0.05, 200 + d * 14, 0, 0.01, 0.03 + d * 0.004, 1, 1.2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.7, 0.01); }, // 짧은 "톡": 먼 패스일수록 길고 높게
  receive: () => { zzfx(0.12, 0.05, 330, 0, 0.005, 0.02, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.6, 0.01); }, // 아주 작은 소리
  shot: () => { zzfx(0.9, 0.05, 150, 0.003, 0.03, 0.14, 4, 1.6, -4, 0, 0, 0, 0, 0.3, 0, 0.1, 0, 0.7, 0.03); buzz(22); },
  tackleOk: () => { zzfx(0.7, 0.05, 90, 0.003, 0.02, 0.1, 4, 1.4, 0, 0, 0, 0, 0, 0.5, 0, 0, 0, 0.8, 0.02); buzz(10); },
  tackleFail: () => { zzfx(0.25, 0.05, 260, 0.003, 0.01, 0.06, 1, 1, 0, 0, 0, 0, 0, 0.2, 0, 0, 0, 0.6, 0.01); },
  goal: () => { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => zzfx(1, 0.02, f, 0.005, 0.1, 0.22, 1, 1.3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.8, 0.05), i * 90)); buzz([60, 40, 90]); },
  save: () => { zzfx(0.6, 0.05, 320, 0.003, 0.04, 0.12, 2, 1.2, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0.7, 0.02); },
  lose: () => { zzfx(0.4, 0.05, 200, 0.003, 0.02, 0.08, 4, 1, 0, 0, 0, 0, 0, 0.3, 0, 0, 0, 0.7, 0.01); },
};
let evSeen = 0;
function playEventSounds() {
  for (; evSeen < M.events.length; evSeen += 1) {
    const e = M.events[evSeen];
    if (e.kind === 'kick') { if (e.type === 'shot') sfx.shot(); else sfx.pass(e.dist ?? 8); }
    else if (e.kind === 'receive') sfx.receive();
    else if (e.kind === 'goal') sfx.goal();
    else if (e.kind === 'save' || e.kind === 'post') sfx.save();
    else if (e.kind === 'tackle') sfx.tackleOk();
    else if (e.kind === 'tackleFail') sfx.tackleFail();
    else if (e.kind === 'intercept') sfx.lose();
  }
}

// ---------- 입력: CSS px를 그대로 futsalInput에 넣고, 행동은 월드 좌표를 붙여 시뮬에 넘긴다 ----------
const rect = () => cv.getBoundingClientRect();
const local = (e) => { const r = rect(); return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width }; };
const toWorld = (px, py) => { const r = rect(); const sx = px / r.width * CW; const sy = py / r.height * CH; return { x: sx / pxm - MARGIN, y: (sy - CH / 2) / pxm + COURT_H / 2 }; };
cv.addEventListener('pointerdown', (e) => { if (paused) return; if (e.cancelable) e.preventDefault(); try { cv.setPointerCapture(e.pointerId); } catch { /* 무시 */ } const p = local(e); input.down(e.pointerId, p.x, p.y, performance.now(), p.w); });
cv.addEventListener('pointermove', (e) => { if (paused) return; const p = local(e); input.move(e.pointerId, p.x, p.y, performance.now()); });
cv.addEventListener('pointerup', (e) => { if (paused) return; const p = local(e); input.up(e.pointerId, p.x, p.y, performance.now()); });
cv.addEventListener('pointercancel', (e) => input.cancel(e.pointerId));
cv.addEventListener('contextmenu', (e) => e.preventDefault());

// ---------- 그리기 ----------
function drawCourt() {
  ctx.fillStyle = '#0b1424'; ctx.fillRect(0, 0, CW, CH);
  ctx.fillStyle = '#2f6fa3'; ctx.fillRect(X(0), Y(0), COURT_W * pxm, COURT_H * pxm);
  for (let i = 0; i < 10; i += 1) if (i % 2) { ctx.fillStyle = 'rgba(255,255,255,0.045)'; ctx.fillRect(X(i * 4), Y(0), 4 * pxm, COURT_H * pxm); }
  ctx.strokeStyle = '#f8fafc'; ctx.lineWidth = Math.max(2, pxm * 0.09);
  ctx.strokeRect(X(0), Y(0), COURT_W * pxm, COURT_H * pxm);
  ctx.beginPath(); ctx.moveTo(X(20), Y(0)); ctx.lineTo(X(20), Y(COURT_H)); ctx.stroke();
  ctx.beginPath(); ctx.arc(X(20), Y(10), 3 * pxm, 0, 7); ctx.stroke();
  const [g0, g1] = TUNE.shot.goalY; const R = TUNE.court.penaltyR * pxm;
  ctx.beginPath(); ctx.arc(X(0), Y(g0), R, -Math.PI / 2, 0); ctx.lineTo(X(6), Y(g1)); ctx.arc(X(0), Y(g1), R, 0, Math.PI / 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(X(COURT_W), Y(g1), R, Math.PI / 2, Math.PI); ctx.lineTo(X(COURT_W - 6), Y(g0)); ctx.arc(X(COURT_W), Y(g0), R, Math.PI, Math.PI * 1.5); ctx.stroke();
  ctx.fillStyle = '#e2e8f0'; ctx.fillRect(X(-0.7), Y(g0), 0.7 * pxm, (g1 - g0) * pxm); ctx.fillRect(X(COURT_W), Y(g0), 0.7 * pxm, (g1 - g0) * pxm);
}
// 선수: 달리기 다리 스윙과 몸 기울기, 패스/슛 킥, 슬라이딩 태클, 개인기 회전, 골키퍼 다이빙
function drawPlayer(p, mine) {
  const h = 1.8 * pxm * PLAYER_SCALE; const px = X(p.x); const py = Y(p.y);
  const kit = p.team === 0 ? (p.gk ? '#22c55e' : '#38bdf8') : (p.gk ? '#f59e0b' : '#ef4444');
  const sp = Math.hypot(p.vx, p.vy); const run = Math.min(1, sp / 5);
  const face = p.face ?? 1;
  const ph = M.real * 11 + p.num * 1.7;
  const swing = Math.sin(ph) * 0.75 * run;
  const bob = Math.abs(Math.sin(ph)) * h * 0.035 * run;
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(px, py, h * 0.28, h * 0.09, 0, 0, 7); ctx.fill();
  ctx.save(); ctx.translate(px, py);
  let rot = face * run * 0.12; let lift = 0; let sx = 1;
  const slide = p.slideT > 0 ? Math.sin((1 - p.slideT / 0.35) * Math.PI) : 0;
  const dive = p.diveT > 0 ? Math.sin((1 - p.diveT / 0.55) * Math.PI) : 0;
  if (slide > 0) { rot = face * 1.35 * slide; lift = h * 0.1 * slide; }
  if (dive > 0) { rot = (p.diveDir ?? 1) * 1.25 * dive; lift = h * 0.18 * dive; }
  if (p.twistT > 0) sx = Math.max(0.25, Math.abs(Math.cos((1 - p.twistT / 0.45) * Math.PI * 2)));
  ctx.rotate(rot); ctx.scale(sx, 1);
  const y0 = -bob - lift;
  // 킥: 준비 중에는 다리를 뒤로 당기고(백스윙), 임팩트 뒤에는 앞으로 뻗는다(팔로스루). 동작별 길이는 TUNE.kick.
  let kickAng = null;
  if (p.kick) { const t = M.real - p.kick.t0; const K = TUNE.kick; if (t < p.kick.prep) kickAng = face * K.backswingRad * (t / p.kick.prep); else if (t < p.kick.prep + p.kick.follow) { const u = (t - p.kick.prep) / p.kick.follow; kickAng = face * (K.backswingRad - (K.backswingRad + K.followRad) * (1 - (1 - u) * (1 - u))) * (1 - Math.max(0, (u - 0.7) / 0.3)); } }
  const leg = (dx, ang, isKick) => {
    ctx.save(); ctx.translate(dx, y0 - h * 0.4); ctx.rotate(isKick && kickAng != null ? kickAng : ang);
    ctx.fillStyle = '#111827'; ctx.fillRect(-h * 0.07, 0, h * 0.14, h * 0.28); ctx.fillStyle = '#0b0b0b'; ctx.fillRect(-h * 0.08, h * 0.26, h * 0.17, h * 0.07); ctx.restore();
  };
  leg(-h * 0.1, swing, false); leg(h * 0.1, -swing, kickAng != null);
  ctx.fillStyle = '#0f172a'; ctx.fillRect(-h * 0.2, y0 - h * 0.4, h * 0.4, h * 0.2);
  // 팔: 달릴 때 반대로 흔들고, 다이빙 때 위로 뻗는다
  const arm = (dx, a) => { ctx.save(); ctx.translate(dx, y0 - h * 0.68); ctx.rotate(dive > 0 ? -2.7 * (dx < 0 ? -1 : 1) * dive : a); ctx.fillStyle = '#d9a371'; ctx.fillRect(-h * 0.045, 0, h * 0.09, h * 0.24); ctx.restore(); };
  arm(-h * 0.27, -swing * 0.9); arm(h * 0.27, swing * 0.9);
  ctx.fillStyle = kit; ctx.fillRect(-h * 0.22, y0 - h * 0.72, h * 0.44, h * 0.34);
  ctx.fillStyle = '#d9a371'; ctx.fillRect(-h * 0.15, y0 - h * 0.97, h * 0.3, h * 0.25);
  ctx.fillStyle = '#1f2937'; ctx.fillRect(-h * 0.16, y0 - h * 1.0, h * 0.32, h * 0.1);
  ctx.fillStyle = '#0f172a'; ctx.font = `800 ${Math.max(9, h * 0.24)}px system-ui,sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(p.num), 0, y0 - h * 0.55);
  ctx.restore();
  if (slide > 0.3) { ctx.fillStyle = 'rgba(226,232,240,0.35)'; for (let i = 0; i < 3; i += 1) { ctx.beginPath(); ctx.arc(px - face * (h * 0.3 + i * h * 0.18), py - i * 2, h * (0.12 - i * 0.025), 0, 7); ctx.fill(); } }
  if (mine) { ctx.fillStyle = '#fde047'; ctx.beginPath(); ctx.moveTo(px, py - h * 1.08); ctx.lineTo(px - h * 0.12, py - h * 1.26); ctx.lineTo(px + h * 0.12, py - h * 1.26); ctx.closePath(); ctx.fill(); }
}
function draw() {
  drawCourt();
  const me = M.players[M.control];
  const b = M.ball;
  for (const p of [...M.players].sort((a, c) => a.y - c.y)) drawPlayer(p, p === me && M.phase !== 'end');
  // 공: 굴러가는 회전과 꼬리(세게 찬 슛일수록 굵고 길다)
  const h = 1.8 * pxm * PLAYER_SCALE;
  const bx = X(b.x); const by = Y(b.y);
  const bsp = Math.hypot(b.vx ?? 0, b.vy ?? 0);
  if (bsp > 6 && b.st !== 'held') { tail.push({ x: bx, y: by, w: b.st === 'shot' ? 0.6 + (b.power ?? 0.5) * 1.1 : 0.55 }); if (tail.length > 9) tail.shift(); } else if (tail.length) tail.shift();
  tail.forEach((q, k) => { ctx.globalAlpha = (k / tail.length) * 0.35; ctx.fillStyle = b.st === 'shot' ? '#fb923c' : '#fff'; ctx.beginPath(); ctx.arc(q.x, q.y - pxm * 0.2, Math.max(2, pxm * 0.2 * q.w), 0, 7); ctx.fill(); });
  ctx.globalAlpha = 1;
  ballRot += bsp * 0.02 * (b.vx >= 0 ? 1 : -1);
  const br = Math.max(4, pxm * 0.22); const bcy = by - Math.max(3, pxm * 0.2);
  ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.ellipse(bx, by + h * 0.02, Math.max(3, pxm * 0.2), Math.max(1.5, pxm * 0.08), 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(bx, bcy, br, 0, 7); ctx.fill();
  ctx.fillStyle = '#0f172a'; for (let k = 0; k < 3; k += 1) { const a = ballRot + k * 2.094; ctx.beginPath(); ctx.arc(bx + Math.cos(a) * br * 0.5, bcy + Math.sin(a) * br * 0.5, br * 0.22, 0, 7); ctx.fill(); }
  ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(bx, bcy, br, 0, 7); ctx.stroke();
  // 피드백(글자 없음): 눌린 곳의 링, 공간 패스 목표, 스와이프 궤적
  const now = performance.now();
  fxs = fxs.filter((f) => now - f.t0 < f.dur);
  for (const f of fxs) { const k = (now - f.t0) / f.dur; ctx.globalAlpha = (1 - k) * f.a; ctx.strokeStyle = f.color; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(X(f.x), Y(f.y) - pxm * 0.2, pxm * (0.6 + k * 1.2), 0, 7); ctx.stroke(); }
  ctx.globalAlpha = 1;
  if (M.ball.st === 'pass' && M.ball.spot && M.ball.dest) { const pul = 0.75 + 0.25 * Math.sin(now / 90); ctx.strokeStyle = `rgba(59,130,246,${pul})`; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(X(M.ball.dest.x), Y(M.ball.dest.y), pxm * 0.9, 0, 7); ctx.stroke(); ctx.fillStyle = 'rgba(59,130,246,0.25)'; ctx.fill(); }
  const tr = input.swipeTrail(now);
  if (tr && tr.pts.length > 1) {
    const r = rect(); const kx = CW / r.width; const ky = CH / r.height;
    ctx.globalAlpha = tr.live ? 0.95 : Math.max(0, 1 - tr.age / 280); ctx.strokeStyle = '#fb923c'; ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); tr.pts.forEach((q, k) => { if (k === 0) ctx.moveTo(q.x * kx, q.y * ky); else ctx.lineTo(q.x * kx, q.y * ky); }); ctx.stroke(); ctx.globalAlpha = 1; ctx.lineCap = 'butt';
  }
  // 데드볼 4초 지시(글자 없이 공 주변 링이 줄어든다)
  if (M.phase === 'deadball' && M.restart && M.restart.kind !== 'kickoff') {
    const k = Math.max(0, M.restart.timer / TUNE.deadBallSeconds);
    ctx.strokeStyle = M.restart.team === 0 ? '#fde047' : 'rgba(255,255,255,0.35)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(bx, by - h * 0.3, h * 0.5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); ctx.stroke();
  }
  if (flash > 0) { ctx.fillStyle = `rgba(253,224,71,${flash * 0.35})`; ctx.fillRect(0, 0, CW, CH); }
}

// ---------- HUD(DOM) ----------
const $ = (id) => document.getElementById(id);
function hud() {
  $('s-h').textContent = M.score[0]; $('s-a').textContent = M.score[1];
  const regular = Math.min(M.halfClock, TUNE.halfClockSeconds) + (M.half - 1) * TUNE.halfClockSeconds;
  const extraMin = M.extra[M.half] != null ? M.extra[M.half] / 60 : 0;
  $('s-time').textContent = M.inExtra ? `${clockText(regular)} +${extraMin}'` : clockText(regular);
  $('timebox').classList.toggle('extra', M.inExtra);
  $('s-half').textContent = M.half === 1 ? '1H' : '2H';
  const gk = $('btn-gk'); const on = flyingGkAvailable(M); gk.classList.toggle('on', on); gk.disabled = !on;
}

// ---------- 흐름: 시작, 하프타임, 종료, 일시정지 ----------
const STANCES = [['attack', 'ATTACK 1-1-2'], ['balanced', 'BALANCED 1-2-1'], ['defense', 'DEFENSE 2-1-1']];
function stanceRow(sel) { return `<div class="row">${STANCES.map(([k, t]) => `<button class="btn ${sel === k ? 'btn--primary' : ''}" data-s="${k}">${t}</button>`).join('')}</div>`; }
function newMatch() { evSeen = 0; seed += 1; M = createMatch({ seed, home: demoTeam('H', seed), away: demoTeam('A', seed + 50), stance }); window.fmFutsal.M = M; flash = 0; }
function showStart() {
  paused = true;
  box.innerHTML = `<h2>FUTSAL</h2><p>5 vs 5 · 40m × 20m · about 5 min</p>${stanceRow(stance)}
    <button class="btn btn--primary" id="go">KICK OFF</button><button class="btn" id="simall">SIM WHOLE MATCH</button>${canVibrate ? `<button class="btn" id="vib">VIBRATION ${vibOn ? 'ON' : 'OFF'}</button>` : ''}<p style="font-size:10px;color:#64748b">BUILD P1</p>`;
  overlay.classList.add('on');
  box.querySelectorAll('[data-s]').forEach((b) => { b.onclick = () => { stance = b.dataset.s; showStart(); }; });
  $('go').onclick = () => { newMatch(); overlay.classList.remove('on'); paused = false; };
  $('simall').onclick = () => { newMatch(); simRest(); };
  if (canVibrate) $('vib').onclick = () => { vibOn = !vibOn; if (vibOn) buzz(30); showStart(); };
}
function showHalftime() {
  paused = true;
  const render = () => {
    box.innerHTML = `<h2>HALFTIME</h2><p>${M.score[0]} : ${M.score[1]}</p>${stanceRow(M.stance[0])}<button class="btn btn--primary" id="second">SECOND HALF</button>`;
    box.querySelectorAll('[data-s]').forEach((b) => { b.onclick = () => { M.stance[0] = b.dataset.s; render(); }; });
    $('second').onclick = () => { startSecondHalf(M, M.stance[0]); overlay.classList.remove('on'); paused = false; };
  };
  render(); overlay.classList.add('on');
}
function showEnd() {
  paused = true;
  const r = M.score[0] > M.score[1] ? 'WIN' : (M.score[0] < M.score[1] ? 'LOSS' : 'DRAW');
  const scorers = M.stats.goals.map((g) => `${g.team === 0 ? 'H' : 'A'} ${g.id} ${Math.floor(g.clock / 60) + 1}'`).join(' · ') || '-';
  box.innerHTML = `<h2>${r}</h2><p>${M.score[0]} : ${M.score[1]}</p><p style="font-size:11px">${scorers}</p><button class="btn btn--primary" id="again">PLAY AGAIN</button>`;
  overlay.classList.add('on');
  $('again').onclick = showStart;
}
function simRest() { // 남은 시간을 AI가 대신 뛴다(통째 시뮬)
  M.autoHuman = true; let n = 0;
  while (M.phase !== 'end' && n < 60 * 900) { if (M.phase === 'halftime') startSecondHalf(M, M.stance[0]); update(M, 1 / 30, {}); n += 1; }
  showEnd();
}
$('btn-pause').onclick = () => { if (!M || M.phase === 'end') return; paused = !paused; if (paused) { box.innerHTML = '<h2>PAUSED</h2><button class="btn btn--primary" id="resume">RESUME</button><button class="btn" id="quit">QUIT</button>'; overlay.classList.add('on'); $('resume').onclick = () => { overlay.classList.remove('on'); paused = false; }; $('quit').onclick = showStart; } else overlay.classList.remove('on'); };
// SIM은 0.6초 길게 눌러야 작동
const simBtn = $('btn-auto'); let simTimer = null;
simBtn.addEventListener('pointerdown', () => { simBtn.classList.add('hold'); clearTimeout(simTimer); simTimer = setTimeout(() => { simBtn.classList.remove('hold'); if (M && !paused) simRest(); }, 600); });
for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) simBtn.addEventListener(ev, () => { clearTimeout(simTimer); simBtn.classList.remove('hold'); });
// 플라잉 골키퍼(P2에서 완성): 후반 추가시간에만 켜진다. P1에서는 켜지는 시점만 확인한다.
$('btn-gk').onclick = () => { if (M && flyingGkAvailable(M)) M.opts.gkAdvance[0] = true; };

function frame(now) {
  const raw = Math.min(0.05, Math.max(0.001, (now - last) / 1000)); last = now;
  if (M && !paused) {
    const polled = input.poll(performance.now(), canAct(M));
    const actions = polled.actions.map((a) => (a.type === 'tap' || a.type === 'hold') ? { ...a, ...(() => { const w = toWorld(a.x, a.y); return { wx: w.x, wy: w.y }; })() } : a);
    // 누른 것이 무엇인지 보이게: 선수 탭 = 초록 링, 빈 공간 탭 = 옅은 파란 링, 더블탭/스와이프는 위 그리기에서 계속 표시
    for (const a of actions) {
      const now = performance.now(); const me = M.players[M.control];
      if (a.type === 'tap' && M.ball.owner === me && M.ball.st === 'held') { // 공을 가졌을 때의 콕: 선수 근처는 초록 링, 빈 곳은 파란 링(색은 7장에서 정리)
        let near = null; let nd = 1e9; for (const q of M.players) { if (q.team !== 0 || q === me || q.gk) continue; const d = Math.hypot(q.x - a.wx, q.y - a.wy); if (d < nd) { nd = d; near = q; } }
        if (near && nd <= TUNE.input.spotRadius) { fxs.push({ x: near.x, y: near.y, color: '#22c55e', t0: now, dur: 420, a: 1 }); }
        else { fxs.push({ x: a.wx, y: a.wy, color: '#3b82f6', t0: now, dur: 450, a: 1 }); }
      }
    }
    const before = M.score[0] + M.score[1];
    update(M, raw, { move: polled.move, actions });
    if (M.score[0] + M.score[1] !== before) flash = 1;
    playEventSounds();
    if (M.phase === 'halftime') showHalftime(); else if (M.phase === 'end') showEnd();
  }
  flash = Math.max(0, flash - raw * 1.6);
  if (M) { ctx.setTransform(1, 0, 0, 1, 0, 0); draw(); hud(); }
  requestAnimationFrame(frame);
}
window.fmFutsal = { M: null, input, get paused() { return paused; } };
newMatch(); showStart();
requestAnimationFrame((n) => { last = n; frame(n); });
void FORMATIONS;
