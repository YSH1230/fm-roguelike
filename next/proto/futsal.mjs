// 풋살 시연판 화면: 시뮬(futsalSim)이 정한 상태를 그리고 포인터를 futsalInput에 연결한다. 상태는 읽기만 한다.
import { TUNE, clockText } from './futsalRules.mjs';
import { createInput } from './futsalInput.mjs';
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
let banner = null; // { text, t } 골 연출 등(글자는 쓰지 않고 색 번쩍임으로만)
let flash = 0;

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
function drawPlayer(p, mine) {
  const h = 1.8 * pxm * PLAYER_SCALE; const px = X(p.x); const py = Y(p.y);
  const kit = p.team === 0 ? (p.gk ? '#22c55e' : '#38bdf8') : (p.gk ? '#f59e0b' : '#ef4444');
  const bob = Math.sin(M.real * 12 + p.num) * Math.min(1, Math.hypot(p.vx, p.vy) / 4) * h * 0.02;
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(px, py, h * 0.28, h * 0.09, 0, 0, 7); ctx.fill();
  const y0 = py - bob;
  ctx.fillStyle = '#111827'; ctx.fillRect(px - h * 0.17, y0 - h * 0.2, h * 0.14, h * 0.2); ctx.fillRect(px + h * 0.03, y0 - h * 0.2, h * 0.14, h * 0.2);
  ctx.fillStyle = '#0f172a'; ctx.fillRect(px - h * 0.2, y0 - h * 0.4, h * 0.4, h * 0.2);
  ctx.fillStyle = kit; ctx.fillRect(px - h * 0.22, y0 - h * 0.72, h * 0.44, h * 0.34);
  ctx.fillStyle = '#d9a371'; ctx.fillRect(px - h * 0.15, y0 - h * 0.97, h * 0.3, h * 0.25);
  ctx.fillStyle = '#1f2937'; ctx.fillRect(px - h * 0.16, y0 - h * 1.0, h * 0.32, h * 0.1);
  ctx.fillStyle = '#0f172a'; ctx.font = `800 ${Math.max(9, h * 0.24)}px system-ui,sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(p.num), px, y0 - h * 0.55);
  if (mine) { ctx.fillStyle = '#fde047'; ctx.beginPath(); ctx.moveTo(px, y0 - h * 1.08); ctx.lineTo(px - h * 0.12, y0 - h * 1.26); ctx.lineTo(px + h * 0.12, y0 - h * 1.26); ctx.closePath(); ctx.fill(); }
}
function draw() {
  drawCourt();
  const me = M.players[M.control];
  const b = M.ball;
  for (const p of [...M.players].sort((a, c) => a.y - c.y)) drawPlayer(p, p === me && M.phase !== 'end');
  // 공
  const h = 1.8 * pxm * PLAYER_SCALE;
  const bx = X(b.x); const by = Y(b.y);
  ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.ellipse(bx, by + h * 0.02, Math.max(3, pxm * 0.2), Math.max(1.5, pxm * 0.08), 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(bx, by - Math.max(3, pxm * 0.2), Math.max(4, pxm * 0.22), 0, 7); ctx.fill();
  ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 1.5; ctx.stroke();
  // 공간 패스 목표: 끌고 있는 동안 놓을 자리에 작은 링(글자 없음)
  const dr = input.activeDrag();
  if (dr && !paused) { const w = toWorld(dr.x, dr.y); ctx.strokeStyle = 'rgba(253,224,71,0.9)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(X(w.x), Y(w.y), pxm * 0.7, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.arc(X(w.x), Y(w.y), 3, 0, 7); ctx.stroke(); }
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
function newMatch() { seed += 1; M = createMatch({ seed, home: demoTeam('H', seed), away: demoTeam('A', seed + 50), stance }); window.fmFutsal.M = M; flash = 0; }
function showStart() {
  paused = true;
  box.innerHTML = `<h2>FUTSAL</h2><p>5 vs 5 · 40m × 20m · about 5 min</p>${stanceRow(stance)}
    <button class="btn btn--primary" id="go">KICK OFF</button><button class="btn" id="simall">SIM WHOLE MATCH</button><p style="font-size:10px;color:#64748b">BUILD P1</p>`;
  overlay.classList.add('on');
  box.querySelectorAll('[data-s]').forEach((b) => { b.onclick = () => { stance = b.dataset.s; showStart(); }; });
  $('go').onclick = () => { newMatch(); overlay.classList.remove('on'); paused = false; };
  $('simall').onclick = () => { newMatch(); simRest(); };
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
    const actions = polled.actions.map((a) => (a.type === 'tap' || a.type === 'drag') ? { ...a, ...(() => { const w = toWorld(a.x, a.y); return { wx: w.x, wy: w.y }; })() } : a);
    const before = M.score[0] + M.score[1];
    update(M, raw, { move: polled.move, actions });
    if (M.score[0] + M.score[1] !== before) flash = 1;
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
