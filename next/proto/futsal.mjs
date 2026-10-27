// 풋살 시연판 화면: 시뮬(futsalSim)이 정한 상태를 그리고 포인터를 futsalInput에 연결한다. 상태는 읽기만 한다.
import { TUNE, clockText } from './futsalRules.mjs';
import { createInput } from './futsalInput.mjs';
import { zzfx } from './zzfx.mjs';
import { initDev } from './futsalDev.mjs';
import { createRecorder } from './futsalLog.mjs';
import { createMatch, update, demoTeam, startSecondHalf, flyingGkAvailable, canAct, signalActive, FORMATIONS } from './futsalSim.mjs';

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
let ballFx = null; // 태클로 공이 상대 발에서 내 발로 튕겨 이동하는 연출 { t0, from }
const dusts = []; // 발밑 먼지
const lossFlash = new Map(); // 공을 뺏긴 내 선수의 붉은 외곽선 깜빡임(선수 id -> 시작 시각)
let lastCtl = -1; let ctlT = 0; // 조종 선수가 바뀐 시각(링이 커졌다 줄어든다)

// ---------- 소리와 진동: 입력 시점이 아니라 발사/임팩트 시점의 이벤트로 재생한다(ZzFX, MIT) ----------
// zzfx(볼륨, 랜덤, 주파수, 어택, 서스테인, 릴리스, 파형, 곡선, 슬라이드, ...). 굴러가는 공은 조용하다.
const canVibrate = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'; // 아이폰 사파리 등은 지원하지 않아 소리와 화면 효과로 대신한다
const SET_KEY = 'fmFutsalSettings';
const loadSet = () => { try { return JSON.parse(localStorage.getItem(SET_KEY)) ?? {}; } catch { return {}; } };
const saveSet = (o) => { try { localStorage.setItem(SET_KEY, JSON.stringify(o)); } catch { /* 저장소 없음 */ } };
const saved = loadSet();
let vibOn = canVibrate && saved.vib !== false;
input.setSensitivity(saved.sens ?? 1);
let recOn = saved.rec !== false; // 기록은 기본으로 켜져 있고 설정에서 끈다
let rec = null; let matchId = null; let home = null; let away = null;
const LOGS_KEY = 'fmFutsalLogs'; // 기기에는 최근 5경기만 둔다(서버 전송 없음)
function saveLog() {
  if (!rec) return;
  try {
    const log = rec.finish(); const body = JSON.stringify(log);
    let idx = []; try { idx = JSON.parse(localStorage.getItem(LOGS_KEY) ?? '[]').filter((e) => e.id !== matchId); } catch { idx = []; }
    idx.push({ id: matchId, seed, at: Date.now() });
    while (idx.length > 5) localStorage.removeItem(`fmFutsalLog:${idx.shift().id}`);
    for (let tries = 0; tries < 6; tries += 1) { try { localStorage.setItem(`fmFutsalLog:${matchId}`, body); break; } catch { if (idx.length <= 1) break; localStorage.removeItem(`fmFutsalLog:${idx.shift().id}`); } } // 용량이 모자라면 오래된 경기부터 지운다
    localStorage.setItem(LOGS_KEY, JSON.stringify(idx));
  } catch { /* 저장소를 못 쓰면 내려받기만 가능 */ }
}
function downloadLog() {
  if (!rec) return; const log = rec.finish(); const d = new Date(); const z = (n) => String(n).padStart(2, '0');
  const name = `futsal-log-${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}.json`;
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(log)], { type: 'application/json' })); a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
const buzz = (ms) => { if (vibOn && canVibrate) { try { navigator.vibrate(ms); } catch { /* 무시 */ } } };
const snd = (...a) => { if (TUNE.audio.on) zzfx(...a); }; // 소리는 TUNE.audio.on으로 막는다(코드는 유지)
const sfx = {
  pass: (d = 8) => { snd(0.6, 0.05, 200 + d * 14, 0, 0.01, 0.03 + d * 0.004, 1, 1.2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.7, 0.01); }, // 짧은 "톡": 먼 패스일수록 길고 높게
  receive: () => { snd(0.12, 0.05, 330, 0, 0.005, 0.02, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.6, 0.01); }, // 아주 작은 소리
  shot: () => { snd(0.9, 0.05, 150, 0.003, 0.03, 0.14, 4, 1.6, -4, 0, 0, 0, 0, 0.3, 0, 0.1, 0, 0.7, 0.03); buzz(22); },
  tackleOk: (mine) => { snd(0.7, 0.05, 90, 0.003, 0.02, 0.1, 4, 1.4, 0, 0, 0, 0, 0, 0.5, 0, 0, 0, 0.8, 0.02); if (mine) buzz(TUNE.feel.buzzMs); }, // 진동은 내 팀 태클 성공에만
  tackleFail: () => { snd(0.25, 0.05, 260, 0.003, 0.01, 0.06, 1, 1, 0, 0, 0, 0, 0, 0.2, 0, 0, 0, 0.6, 0.01); },
  goal: () => { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => snd(1, 0.02, f, 0.005, 0.1, 0.22, 1, 1.3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.8, 0.05), i * 90)); buzz([60, 40, 90]); },
  save: () => { snd(0.6, 0.05, 320, 0.003, 0.04, 0.12, 2, 1.2, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0.7, 0.02); },
  lose: () => { snd(0.4, 0.05, 200, 0.003, 0.02, 0.08, 4, 1, 0, 0, 0, 0, 0, 0.3, 0, 0, 0, 0.7, 0.01); },
};
function tackleView(e) { // 태클 성공 연출(글자, 번쩍임, 흔들림 없음): 공 튕김, 먼지, 내 링 펄스, 뺏긴 내 선수의 붉은 외곽선
  const now = performance.now(); ballFx = { t0: now, from: { x: e.vx, y: e.vy } };
  dusts.push({ x: e.vx, y: e.vy, t0: now, n: e.slide ? TUNE.feel.dustSlide : TUNE.feel.dustStand, big: !!e.slide });
  if (e.team === 0) ctlT = now; else if (e.vteam === 0) lossFlash.set(e.victim, now);
}
let evSeen = 0;
function playEventSounds() {
  for (; evSeen < M.events.length; evSeen += 1) {
    const e = M.events[evSeen];
    if (e.kind === 'kick') { if (e.type === 'shot') sfx.shot(); else sfx.pass(e.dist ?? 8); }
    else if (e.kind === 'receive') sfx.receive();
    else if (e.kind === 'goal') sfx.goal();
    else if (e.kind === 'save' || e.kind === 'post') sfx.save();
    else if (e.kind === 'tackle') { sfx.tackleOk(e.team === 0); tackleView(e); }
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
// 유니폼: 두 팀 색의 밝기 차이가 TUNE.ring.kitLumDiff 이하이면 상대 팀을 원정색으로 바꾼다
const lum = (hex) => { const n = parseInt(hex.slice(1), 16); return (0.2126 * (n >> 16 & 255) + 0.7152 * (n >> 8 & 255) + 0.0722 * (n & 255)) / 255; };
const KIT = { home: { f: '#38bdf8', g: '#22c55e' }, away: { f: '#ef4444', g: '#f59e0b' }, alt: { f: '#f1f5f9', g: '#a78bfa' } };
const awayKit = () => (Math.abs(lum(KIT.home.f) - lum(KIT.away.f)) <= TUNE.ring.kitLumDiff ? KIT.alt : KIT.away);
function drawPlayer(p, mine) {
  const h = 1.8 * pxm * PLAYER_SCALE; const px = X(p.x); const py = Y(p.y);
  const k = p.team === 0 ? KIT.home : awayKit(); const kit = p.gk ? k.g : k.f;
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
  const lf = lossFlash.get(p.id); // 공을 뺏긴 내 선수: 붉은 외곽선이 한 번 깜빡인다
  if (lf != null) { const k = (performance.now() - lf) / TUNE.feel.lossFlashMs; if (k >= 1) lossFlash.delete(p.id); else { ctx.globalAlpha = Math.sin(k * Math.PI); ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 3; ctx.strokeRect(px - h * 0.3, py - h * 1.05, h * 0.6, h * 1.1); ctx.globalAlpha = 1; } }
  if (slide > 0.3) { ctx.fillStyle = 'rgba(226,232,240,0.35)'; for (let i = 0; i < 3; i += 1) { ctx.beginPath(); ctx.arc(px - face * (h * 0.3 + i * h * 0.18), py - i * 2, h * (0.12 - i * 0.025), 0, 7); ctx.fill(); } }
}
function draw() {
  drawCourt();
  const me = M.players[M.control];
  const b = M.ball;
  for (const p of [...M.players].sort((a, c) => a.y - c.y)) drawPlayer(p, p === me && M.phase !== 'end');
  // 공: 굴러가는 회전과 꼬리(세게 찬 슛일수록 굵고 길다)
  const h = 1.8 * pxm * PLAYER_SCALE;
  let bxm = b.x; let bym = b.y; let lift = 0; // 태클 직후 공이 상대 발에서 새 주인에게 튕겨 간다
  if (ballFx) { const kk = (performance.now() - ballFx.t0) / TUNE.feel.ballFlyMs; if (kk >= 1) ballFx = null; else { bxm = ballFx.from.x + (b.x - ballFx.from.x) * kk; bym = ballFx.from.y + (b.y - ballFx.from.y) * kk; lift = Math.sin(kk * Math.PI) * pxm * 0.7; } }
  const bx = X(bxm); const by = Y(bym);
  const bsp = Math.hypot(b.vx ?? 0, b.vy ?? 0);
  if (bsp > 6 && b.st !== 'held') { tail.push({ x: bx, y: by, w: b.st === 'shot' ? 0.6 + (b.power ?? 0.5) * 1.1 : 0.55 }); if (tail.length > 9) tail.shift(); } else if (tail.length) tail.shift();
  tail.forEach((q, k) => { ctx.globalAlpha = (k / tail.length) * 0.35; ctx.fillStyle = b.st === 'shot' ? '#fb923c' : '#fff'; ctx.beginPath(); ctx.arc(q.x, q.y - pxm * 0.2, Math.max(2, pxm * 0.2 * q.w), 0, 7); ctx.fill(); });
  ctx.globalAlpha = 1;
  ballRot += bsp * 0.02 * (b.vx >= 0 ? 1 : -1);
  const br = Math.max(4, pxm * 0.22); const bcy = by - Math.max(3, pxm * 0.2) - lift;
  ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.ellipse(bx, by + h * 0.02, Math.max(3, pxm * 0.2), Math.max(1.5, pxm * 0.08), 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(bx, bcy, br, 0, 7); ctx.fill();
  ctx.fillStyle = '#0f172a'; for (let k = 0; k < 3; k += 1) { const a = ballRot + k * 2.094; ctx.beginPath(); ctx.arc(bx + Math.cos(a) * br * 0.5, bcy + Math.sin(a) * br * 0.5, br * 0.22, 0, 7); ctx.fill(); }
  ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(bx, bcy, br, 0, 7); ctx.stroke();
  // 링(7장): 코트 바닥에 붙은 납작한 타원, 어두운 외곽선, 동시에 최대 TUNE.ring.max개
  const now = performance.now();
  const R = TUNE.ring; const rings = [];
  if (me && M.phase !== 'end') {
    if (lastCtl !== M.control) { lastCtl = M.control; ctlT = now; }
    const g = Math.max(0, 1 - (now - ctlT) / R.growMs); const grow = 1 + (R.growScale - 1) * Math.sin(g * Math.PI);
    const col = me.ratio > R.staminaOrange ? '#22c55e' : (me.ratio > R.staminaRed ? '#f59e0b' : '#ef4444');
    rings.push({ x: me.x, y: me.y, r: 0.95 * grow, color: col, frac: Math.max(0.04, me.ratio), w: 4 });
    const hp = input.holdProgress(performance.now());
    if (hp != null && !(M.ball.owner === me && M.ball.st === 'held')) rings.push({ x: me.x, y: me.y, r: 1.15 * grow, color: '#22d3ee', frac: hp, w: 4 });
  }
  fxs = fxs.filter((f) => now - f.t0 < f.dur);
  for (const f of fxs) { const k = (now - f.t0) / f.dur; rings.push({ x: f.who ? f.who.x : f.x, y: f.who ? f.who.y : f.y, r: 0.8 + 0.5 * k, color: f.color, frac: 1, a: 1 - k, w: 4 }); }
  for (const q of M.players) if (q.team === 1 && M.ball.owner === q && M.ball.st === 'held' && signalActive(M, q)) rings.push({ x: q.x, y: q.y, r: 0.9, color: '#22d3ee', frac: 1, w: 4 });
  if (M.phase === 'deadball' && M.restart) {
    const rs = M.restart;
    if (rs.kind === 'kickoff') { if (rs.wait && !M.autoHuman) rings.push({ x: b.x, y: b.y, r: 1.3 + 0.12 * Math.sin(now / 420), color: '#ffffff', frac: 1, a: 0.85, w: 3 }); } // 킥오프 대기: 줄어들지 않고 천천히 펄스
    else rings.push({ x: b.x, y: b.y, r: 1.6 * Math.max(0.1, rs.timer / TUNE.deadBallSeconds), color: '#ffffff', frac: 1, a: rs.team === 0 ? 1 : 0.4, w: 3 });
    if (rs.sel && rs.team === 0) rings.push({ x: rs.sel.x, y: rs.sel.y, r: 0.6, color: '#facc15', frac: 1, w: 3 }); // 고른 동료
  }
  for (const rg of rings.slice(0, R.max)) {
    const cx = X(rg.x); const cy = Y(rg.y); const rx = rg.r * pxm * 0.9; const ry = rx * 0.38; const a0 = -Math.PI / 2; const a1 = a0 + Math.PI * 2 * rg.frac;
    ctx.globalAlpha = rg.a ?? 1; ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(8,12,24,0.85)'; ctx.lineWidth = rg.w + 3; ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, a0, a1); ctx.stroke();
    ctx.strokeStyle = rg.color; ctx.lineWidth = rg.w; ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, a0, a1); ctx.stroke();
    ctx.lineCap = 'butt'; ctx.globalAlpha = 1;
  }
  for (let i = dusts.length - 1; i >= 0; i -= 1) { // 먼지: 발밑에서 작은 알갱이가 퍼지며 사라진다
    const d = dusts[i]; const k = (now - d.t0) / TUNE.feel.dustMs; if (k >= 1) { dusts.splice(i, 1); continue; }
    ctx.globalAlpha = (1 - k) * 0.7; ctx.fillStyle = '#e2e8f0';
    for (let j = 0; j < d.n; j += 1) { const a = (j / d.n) * Math.PI * 2 + 0.7; const rr = (d.big ? 1.3 : 0.7) * pxm * (0.2 + k * 0.9); ctx.beginPath(); ctx.arc(X(d.x) + Math.cos(a) * rr, Y(d.y) + Math.sin(a) * rr * 0.45 - pxm * 0.1, Math.max(1.5, pxm * (d.big ? 0.16 : 0.1) * (1 - k * 0.4)), 0, 7); ctx.fill(); }
    ctx.globalAlpha = 1;
  }
  const tr = input.swipeTrail(now);
  if (tr && tr.pts.length > 1) { // 쓸기 궤적: 흰색 얇은 선, 떼고 0.3초
    const r = rect(); const kx = CW / r.width; const ky = CH / r.height;
    ctx.globalAlpha = tr.live ? 0.9 : Math.max(0, 1 - tr.age / 300); ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); tr.pts.forEach((q, k) => { if (k === 0) ctx.moveTo(q.x * kx, q.y * ky); else ctx.lineTo(q.x * kx, q.y * ky); }); ctx.stroke(); ctx.globalAlpha = 1; ctx.lineCap = 'butt';
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
function newMatch(sd) {
  evSeen = 0; seed = sd ?? seed + 1; home = demoTeam('H', seed); away = demoTeam('A', seed + 50); M = createMatch({ seed, home, away, stance }); matchId = String(Date.now());
  const r = rect(); rec = recOn ? createRecorder({ M, seed, home, away, stance, device: { w: Math.round(r.width), h: Math.round(r.height), sens: input.sensitivity } }) : null;
  window.fmFutsal.M = M; flash = 0; // 기록 중이면 update 대신 rec.step을 쓴다(입력을 같은 방식으로 양자화해 재생이 같게 한다)
}
const stepSim = (dt, inp) => { if (rec) rec.step(dt, inp); else update(M, dt, inp); };
function showStart() {
  paused = true;
  box.innerHTML = `<h2>FUTSAL</h2><p>5 vs 5 · 40m × 20m · about 5 min</p>${stanceRow(stance)}
    <button class="btn btn--primary" id="go">KICK OFF</button><button class="btn" id="simall">SIM WHOLE MATCH</button><label style="font:700 11px var(--pix);color:#cbd5e1">INPUT SENSITIVITY ${Math.round(input.sensitivity * 100)}%<input id="sens" type="range" min="70" max="130" step="5" value="${Math.round(input.sensitivity * 100)}" style="width:100%"></label><button class="btn" id="rec">RECORD ${recOn ? 'ON' : 'OFF'}</button>${canVibrate ? `<button class="btn" id="vib">VIBRATION ${vibOn ? 'ON' : 'OFF'}</button>` : ''}<p style="font-size:10px;color:#64748b">BUILD P1</p>`;
  overlay.classList.add('on');
  box.querySelectorAll('[data-s]').forEach((b) => { b.onclick = () => { stance = b.dataset.s; showStart(); }; });
  $('rec').onclick = () => { recOn = !recOn; saveSet({ sens: input.sensitivity, vib: vibOn, rec: recOn }); showStart(); };
  $('go').onclick = () => { newMatch(); overlay.classList.remove('on'); paused = false; };
  $('simall').onclick = () => { newMatch(); simRest(); };
  $('sens').onchange = (e) => { input.setSensitivity(Number(e.target.value) / 100); saveSet({ sens: input.sensitivity, vib: vibOn, rec: recOn }); showStart(); };
  if (canVibrate) $('vib').onclick = () => { vibOn = !vibOn; if (vibOn) buzz(30); saveSet({ sens: input.sensitivity, vib: vibOn, rec: recOn }); showStart(); };
}
function showHalftime() {
  paused = true;
  const render = () => {
    box.innerHTML = `<h2>HALFTIME</h2><p>${M.score[0]} : ${M.score[1]}</p>${stanceRow(M.stance[0])}<button class="btn btn--primary" id="second">SECOND HALF</button>`;
    box.querySelectorAll('[data-s]').forEach((b) => { b.onclick = () => { M.stance[0] = b.dataset.s; render(); }; });
    $('second').onclick = () => { rec?.marker({ k: 'half', stance: M.stance[0] }); startSecondHalf(M, M.stance[0]); overlay.classList.remove('on'); paused = false; };
  };
  render(); overlay.classList.add('on');
}
function showEnd() {
  paused = true;
  const r = M.score[0] > M.score[1] ? 'WIN' : (M.score[0] < M.score[1] ? 'LOSS' : 'DRAW');
  const scorers = M.stats.goals.map((g) => `${g.team === 0 ? 'H' : 'A'} ${g.id} ${Math.floor(g.clock / 60) + 1}'`).join(' · ') || '-';
  box.innerHTML = `<h2>${r}</h2><p>${M.score[0]} : ${M.score[1]}</p><p style="font-size:11px">${scorers}</p><button class="btn btn--primary" id="again">PLAY AGAIN</button>${rec ? '<button class="btn" id="savelog">기록 저장 SAVE LOG</button>' : ''}`;
  overlay.classList.add('on');
  $('again').onclick = showStart; if (rec) $('savelog').onclick = downloadLog;
}
function simRest() { // 남은 시간을 AI가 대신 뛴다(통째 시뮬)
  M.autoHuman = true; rec?.marker({ k: 'auto', on: true }); let n = 0;
  while (M.phase !== 'end' && n < 60 * 900) { if (M.phase === 'halftime') { rec?.marker({ k: 'half', stance: M.stance[0] }); startSecondHalf(M, M.stance[0]); } stepSim(1 / 30, {}); n += 1; }
  saveLog(); showEnd();
}
$('btn-pause').onclick = () => { if (!M || M.phase === 'end') return; paused = !paused; if (paused) { box.innerHTML = '<h2>PAUSED</h2><button class="btn btn--primary" id="resume">RESUME</button><button class="btn" id="quit">QUIT</button>' + (rec ? '<button class="btn" id="savelog">기록 저장 SAVE LOG</button>' : ''); overlay.classList.add('on'); if (rec) $('savelog').onclick = downloadLog; $('resume').onclick = () => { overlay.classList.remove('on'); paused = false; }; $('quit').onclick = showStart; } else overlay.classList.remove('on'); };
// SIM은 0.6초 길게 눌러야 작동
const simBtn = $('btn-auto'); let simTimer = null;
simBtn.addEventListener('pointerdown', () => { simBtn.classList.add('hold'); clearTimeout(simTimer); simTimer = setTimeout(() => { simBtn.classList.remove('hold'); if (M && !paused) simRest(); }, 600); });
for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) simBtn.addEventListener(ev, () => { clearTimeout(simTimer); simBtn.classList.remove('hold'); });
// 플라잉 골키퍼(P2에서 완성): 후반 추가시간에만 켜진다. P1에서는 켜지는 시점만 확인한다.
$('btn-gk').onclick = () => { if (M && flyingGkAvailable(M)) { rec?.marker({ k: 'gk' }); M.opts.gkAdvance[0] = true; } };

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
        if (near && nd <= TUNE.input.spotRadius) fxs.push({ who: near, color: '#facc15', t0: now, dur: TUNE.ring.passMs });
        else fxs.push({ x: a.wx, y: a.wy, color: '#facc15', t0: now, dur: TUNE.ring.passMs });
      }
    }
    const before = M.score[0] + M.score[1];
    stepSim(raw, { move: polled.move, actions });
    if (M.score[0] + M.score[1] !== before) flash = 1;
    playEventSounds();
    if (M.phase === 'halftime') { saveLog(); showHalftime(); } else if (M.phase === 'end') { saveLog(); showEnd(); }
  }
  flash = Math.max(0, flash - raw * 1.6);
  if (M) { ctx.setTransform(1, 0, 0, 1, 0, 0); draw(); hud(); }
  requestAnimationFrame(frame);
}
window.fmFutsal = { M: null, input, get paused() { return paused; } };
newMatch(); showStart();
window.addEventListener('pagehide', saveLog);
initDev({ getM: () => M, getSeed: () => seed, getRec: () => rec, saveLog, restart: (sd) => { newMatch(sd); overlay.classList.remove('on'); paused = false; } });
requestAnimationFrame((n) => { last = n; frame(n); });
void FORMATIONS;
