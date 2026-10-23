// 풋살 5 대 5 시뮬레이션(순수 상태 머신, DOM 없음). 시간은 update(dt)의 dt만 쓰고 난수는 시드 RNG만 쓴다.
// 좌표는 미터. 팀 0(사람)은 왼쪽 골대를 지키고 +x로 공격, 팀 1은 오른쪽 골대를 지키고 -x로 공격한다.
import { createRng, randInt, gauss } from '../engine/rng.mjs';
import {
  TUNE, contestDefenderWins, drainPerSecond, effSpeed, gkReach, gkReactTime, kickPrep, passSpeedFor, shotNoise, shotRange, stumbleTime, swipePower,
} from './futsalRules.mjs';
import { think } from './futsalAI.mjs';

const W = TUNE.court.w;
const H = TUNE.court.h;
const GY0 = TUNE.shot.goalY[0];
const GY1 = TUNE.shot.goalY[1];
const GYC = (GY0 + GY1) / 2;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const hyp = Math.hypot;

// 성향별 코트 위 4명의 자리(팀 기준 좌표: 자기 골대가 x=0)
export const FORMATIONS = {
  balanced: [['FIXO', 12, 10], ['ALA', 16, 5], ['ALA', 16, 15], ['PIVOT', 27, 10]],
  attack: [['FIXO', 12, 10], ['ALA', 16, 10], ['PIVOT', 27, 6], ['PIVOT', 27, 14]],
  defense: [['FIXO', 9, 6], ['FIXO', 9, 14], ['ALA', 16, 10], ['PIVOT', 26, 10]],
};

// 시연용 팀: 능력이 base 근처인 8명(골키퍼 1명 포함, 이름은 번호)
export function demoTeam(name, seed = 1, base = 12) {
  const r = createRng(seed);
  const j = () => clamp(Math.round(base + gauss(r) * 2), 2, 20);
  const players = [];
  for (let i = 0; i < 8; i += 1) {
    const gk = i === 0;
    players.push({ id: `${name}${i}`, name: `${name}${i}`, gk, cond: 1, ab: gk ? { speed: j(), stamina: j(), strength: j(), reaction: j(), handling: j() } : { speed: j(), stamina: j(), strength: j(), passing: j(), shooting: j(), skill: j() } });
  }
  return { name, players };
}

const mkPlayer = (team, d, role, hx, hy, num) => ({ id: d.id, name: d.name, team, role, num, gk: !!d.gk, ab: d.ab, ratio: d.cond ?? 1, home: { x: hx, y: hy }, x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0, ts: 0, fr: 0.9 + 0.2 * ((num * 7) % 5) / 4, dribbleUntil: 0, delay: 0 });
const wx = (team, lx) => (team === 0 ? lx : W - lx); // 팀 기준 x → 월드 x

export function createMatch({ seed = 1, home, away, stance = 'balanced', awayStance = 'balanced' } = {}) {
  const rng = createRng(seed);
  const M = {
    rng, seed, teams: [home, away], stance: [stance, awayStance], players: [], bench: [[], []],
    ball: { x: W / 2, y: H / 2, vx: 0, vy: 0, st: 'held', owner: null, tgt: null, trav: 0 },
    control: 0, half: 1, halfClock: 0, clock: 0, real: 0, extra: { 1: null, 2: null }, inExtra: false,
    phase: 'deadball', restart: null, score: [0, 0], events: [], lastTouch: 0, contestT: 0, shooterTeam: 0,
    stats: { runs: [0, 0], goals: [], saves: [0, 0], tackles: [0, 0], intercepts: [0, 0], shots: [0, 0], passes: [0, 0] },
    ai: { skill: [12, 12], style: ['balanced', 'balanced'], specials: [[], []] }, // P3에서 채운다
    opts: { gkAdvance: [false, false] },
  };
  buildTeams(M);
  M.queue = []; M.hitstop = 0;
  M.api = { pass: (p, t) => queuePass(M, p, t), shoot: (p, ay, nf, pw) => queueShot(M, p, ay, nf, pw), takeRestartPick: null };
  startKickoff(M, 0);
  return M;
}

function buildTeams(M) {
  M.players = [];
  for (let t = 0; t < 2; t += 1) {
    const d = M.teams[t];
    const gk = d.players.find((p) => p.gk) ?? d.players[0];
    const field = d.players.filter((p) => p !== gk);
    const form = FORMATIONS[M.stance[t]];
    M.players.push(mkPlayer(t, gk, 'GK', 2, GYC, 1));
    form.forEach(([role, hx, hy], i) => M.players.push(mkPlayer(t, field[i], role, hx, hy, [4, 7, 8, 9][i])));
    M.bench[t] = field.slice(form.length);
  }
  for (const p of M.players) placeHome(M, p);
}
function placeHome(M, p) { p.x = wx(p.team, p.home.x); p.y = p.home.y; p.vx = 0; p.vy = 0; p.tx = p.x; p.ty = p.y; }

export const team = (M, t) => M.players.filter((p) => p.team === t);
export const outfield = (M, t) => M.players.filter((p) => p.team === t && !p.gk);
export const keeper = (M, t) => M.players.find((p) => p.team === t && p.gk);
export const goalX = (t) => (t === 0 ? W : 0); // 팀 t가 공격하는 골대의 x

export function setHold(M, p) { if (M.ball.owner && M.ball.owner !== p) cancelKicksOf(M, M.ball.owner); M.holdT = 0; M.ball.st = 'held'; M.ball.owner = p; M.ball.tgt = null; M.lastTouch = p.team; M.ball.x = p.x; M.ball.y = p.y; }

function startKickoff(M, t) {
  clearQueue(M);
  for (const p of M.players) {
    placeHome(M, p);
    // 킥오프: 모두 자기 진영에 선다. 킥하는 팀은 하프라인 직전까지, 상대 팀은 센터서클(3m) 밖.
    const lx = p.team === 0 ? p.x : W - p.x;
    const cap = p.team === t ? 19.4 : 16.4;
    if (lx > cap) { p.x = wx(p.team, cap); p.tx = p.x; }
  }
  const k = outfield(M, t).find((p) => p.role === 'PIVOT') ?? outfield(M, t)[0];
  k.x = W / 2 + (t === 0 ? -0.6 : 0.6); k.y = H / 2; k.tx = k.x; k.ty = k.y;
  setHold(M, k);
  M.phase = 'deadball';
  M.restart = { kind: 'kickoff', team: t, timer: TUNE.autoRestartSeconds, pick: null, x: W / 2, y: H / 2 };
  if (t === 0) M.control = M.players.indexOf(k);
}

export function canAct(M) {
  if (M.phase === 'deadball') return M.restart?.team === 0 && M.restart.kind !== 'kickoff';
  if (M.phase !== 'play') return false;
  const b = M.ball;
  if (b.st === 'pass' && b.owner == null && M.lastTouch === 0) return false; // 내 패스가 날아가는 동안
  if (M.queue.some((e) => e.p.team === 0)) return false; // 내 킥 준비 중: 새 입력은 입력 버퍼(150ms)에 보관한다
  return true;
}

// ---------- 행동 ----------
// 받는 선수가 지금 속도로 달릴 때 공과 만나는 지점(두 번 보정). 공은 이 지점을 향해 곧게 날아가고 방향을 바꾸지 않는다.
function leadPoint(from, tgt) {
  let t = hyp(tgt.x - from.x, tgt.y - from.y) / passSpeedFor(hyp(tgt.x - from.x, tgt.y - from.y));
  let x = tgt.x; let y = tgt.y;
  for (let i = 0; i < 2; i += 1) { x = clamp(tgt.x + tgt.vx * t, 0.5, W - 0.5); y = clamp(tgt.y + tgt.vy * t, 0.5, H - 0.5); const dd = hyp(x - from.x, y - from.y); t = dd / passSpeedFor(dd); }
  return { x, y };
}
export function passTo(M, p, tgt) {
  const b = M.ball; const d = leadPoint(b, tgt);
  b.spot = false;
  b.st = 'pass'; b.owner = null; b.tgt = tgt; b.dest = d; b.speed = passSpeedFor(hyp(d.x - b.x, d.y - b.y)); M.lastTouch = p.team; M.stats.passes[p.team] += 1;
  if (p.team === 0) M.control = M.players.indexOf(tgt); // 패스하면 받는 선수로 조종이 넘어간다
}
// 공간 패스: 놓은 자리로 보낸다. 그 자리에 가장 빨리 닿는 동료가 받으러 달린다.
export function passToSpot(M, p, x, y) {
  const b = M.ball; let best = null; let bt = 1e9;
  for (const q of M.players) { if (q.team !== p.team || q === p || q.gk) continue; const t = hyp(q.x - x, q.y - y) / Math.max(1, effSpeed(q.ab.speed, q.ratio)); if (t < bt) { bt = t; best = q; } }
  if (!best) return;
  b.spot = true;
  b.st = 'pass'; b.owner = null; b.tgt = best; b.dest = { x: clamp(x, 0.5, W - 0.5), y: clamp(y, 0.5, H - 0.5) }; b.speed = passSpeedFor(hyp(b.dest.x - b.x, b.dest.y - b.y)); M.lastTouch = p.team; M.stats.passes[p.team] += 1;
  if (p.team === 0) M.control = M.players.indexOf(best);
}
function nearestMate(M, p, wxp, wyp) {
  let best = null; let bd = 1e9;
  for (const q of M.players) { if (q.team !== p.team || q === p || q.gk) continue; const d = hyp(q.x - wxp, q.y - wyp); if (d < bd) { bd = d; best = q; } }
  return best;
}
export function shoot(M, p, ay, noiseFree = false, power = 0.75) {
  const gk0 = keeper(M, 1 - p.team);
  const b = M.ball; const gx = goalX(p.team); const dist = Math.abs(gx - p.x);
  const sh = p.ab.shooting ?? 8;
  const S = TUNE.shot;
  const noise = noiseFree ? 0 : gauss(M.rng) * shotNoise(sh, dist) * (1 - S.powerNoise * 0.5 + S.powerNoise * power); // 세게 찰수록 조금 더 흔들린다
  const speed = S.speedMin + (S.speedMax - S.speedMin) * power;
  const rangeFactor = dist > shotRange(sh) ? 1 + (dist - shotRange(sh)) * 0.25 : 1; // 사거리 밖은 많이 흔들린다
  const tyv = ay + noise * rangeFactor;
  const dx = gx - p.x; const dy = tyv - p.y; const l = hyp(dx, dy) || 1;
  Object.assign(b, { st: 'shot', owner: null, tgt: null, x: p.x, y: p.y, vx: dx / l * speed, vy: dy / l * speed, trav: 0, shooter: p, aimY: tyv, aimTarget: ay, dist, power, speed, reactAt: M.real + (gk0 ? gkReactTime(gk0.ab.reaction, gk0.ratio) : 0) });
  M.lastTouch = p.team; M.stats.shots[p.team] += 1; M.events.push({ kind: 'shot', team: p.team, id: p.id });
}

// ---------- 킥 준비 큐(2장) ----------
// 입력을 받으면 공을 바로 내보내지 않고 모션 시작과 예약만 만든다. 준비 시간이 지난 임팩트 시점(M.real 기준)에 판정하고 실행한다.
// 판정(선행 지점, 태클 거리, 슛 잡음, RNG)은 모두 임팩트 시점의 위치로 한다.
function schedule(M, p, kind, data = {}) {
  if (M.queue.some((e) => e.p === p)) return; // 이미 준비 중인 킥이 있으면 새 예약은 만들지 않는다(사람 입력은 canAct로 버퍼에 남는다)
  const prep = kickPrep(kind, p.ab); const follow = TUNE.kick[kind].follow;
  p.kick = { kind, t0: M.real, prep, follow };
  if (kind === 'shot') p.prepShot = true;
  M.queue.push({ p, kind, at: M.real + prep, data });
}
export function queuePass(M, p, tgt) { if (p.team === 0) M.control = M.players.indexOf(tgt); /* 조종은 입력 즉시 받는 선수로 넘어간다 */ schedule(M, p, 'pass', { tgt }); }
export function queueSpot(M, p, x, y) {
  const best = spotReceiver(M, p, x, y); if (!best) return;
  if (p.team === 0) M.control = M.players.indexOf(best);
  schedule(M, p, 'pass', { spot: { x, y }, tgt: best });
}
export function queueShot(M, p, ay, noiseFree = false, power = 0.75) { schedule(M, p, 'shot', { ay, noiseFree, power }); }
function queueTackle(M, p, slide) { schedule(M, p, slide ? 'sliding' : 'standing', { slide }); }
function spotReceiver(M, p, x, y) {
  let best = null; let bt = 1e9;
  for (const q of M.players) { if (q.team !== p.team || q === p || q.gk) continue; const t = hyp(q.x - x, q.y - y) / Math.max(1, effSpeed(q.ab.speed, q.ratio)); if (t < bt) { bt = t; best = q; } }
  return best;
}
function endKick(p) { p.prepShot = false; }
// 소유권 상실, 골, 데드볼 전환, 하프타임, 종료가 생기면 예약을 조용히 취소한다
function cancelKicksOf(M, p) { M.queue = M.queue.filter((e) => { if (e.p !== p || e.kind === 'standing' || e.kind === 'sliding') return true; endKick(p); p.kick = null; return false; }); }
export function clearQueue(M) { for (const e of M.queue) { endKick(e.p); e.p.kick = null; } M.queue = []; }
function runQueue(M, dt = 0) {
  if (!M.queue.length) return;
  const due = M.queue.filter((e) => e.at <= M.real + dt); if (!due.length) return; // 임팩트가 이번 프레임 안이면 실행
  M.queue = M.queue.filter((e) => e.at > M.real + dt);
  for (const e of due) {
    const { p } = e; const b = M.ball;
    if (e.kind === 'pass' || e.kind === 'shot') {
      endKick(p);
      if (!(b.st === 'held' && b.owner === p)) { p.kick = null; continue; } // 소유권을 잃었으면 예약 취소
      if (e.kind === 'pass') {
        if (e.data.spot) passToSpot(M, p, e.data.spot.x, e.data.spot.y); else passTo(M, p, e.data.tgt);
        M.events.push({ kind: 'kick', type: e.data.spot ? 'spot' : 'pass', team: p.team, id: p.id, dist: hyp(b.dest.x - p.x, b.dest.y - p.y) });
      } else {
        shoot(M, p, e.data.ay, e.data.noiseFree, e.data.power);
        M.events.push({ kind: 'kick', type: 'shot', team: p.team, id: p.id, power: e.data.power });
        if (e.data.power >= TUNE.kick.hitstopPower) M.hitstop = TUNE.kick.hitstopSec;
      }
    } else tackleNow(M, p, !!e.data.slide);
  }
}

// 쓸기 → 직선 슛: 골대 방향 ±55도 안에서만 슛이고, 쓴 각도가 조준이다. 그 밖의 방향(뒤, 옆, 위, 아래)은 아무 일도 없다(위 쓸기는 3단계 칩슛 자리).
// 조준은 쓸기 각도로 골라인을 지나는 y이고, 골대 밖을 가리키면 가장 가까운 골대 안 점으로 보정한다.
function swipeShot(M, p, a) {
  const gx = goalX(p.team); const dirx = gx > p.x ? 1 : -1;
  const thetaGoal = Math.atan2(GYC - p.y, (gx - p.x) * dirx); // 진행 방향(앞)을 기준으로 잰다
  const thetaSwipe = Math.atan2(a.dy ?? 0, (a.dx ?? 0) * dirx);
  if (Math.abs(thetaSwipe - thetaGoal) > (TUNE.input.shotAngleDeg * Math.PI) / 180 || (a.dx ?? 0) * dirx <= 0) return false;
  const ay = clamp(p.y + Math.tan(thetaSwipe) * Math.abs(gx - p.x), GY0, GY1);
  queueShot(M, p, ay, false, swipePower(a.v ?? 1));
  return true;
}
function applyHumanAction(M, a) {
  const me = M.players[M.control];
  const b = M.ball;
  const holding = b.st === 'held' && b.owner === me;
  if (a.type === 'dribble') { me.dribbleUntil = M.real + TUNE.dribbleSeconds; me.twistT = 0.45; return; }
  if (M.phase === 'deadball') { // 킥인, 코너, 골키퍼 재개: 콕 한 번으로 받을 선수를 고른다
    if (a.type === 'tap') { const r = M.restart; const tg = nearestMate(M, M.players[M.control], a.wx, a.wy); if (tg) r.pick = tg; }
    return;
  }
  if (holding) {
    if (a.type === 'tap') { // 선수 근처 콕이 빈 곳 콕보다 우선한다
      const near = nearestMate(M, me, a.wx ?? 0, a.wy ?? 0);
      if (near && a.wx != null && hyp(near.x - a.wx, near.y - a.wy) <= TUNE.input.spotRadius) queuePass(M, me, near);
      else if (a.wx != null) queueSpot(M, me, a.wx, a.wy);
    } else if (a.type === 'swipe') swipeShot(M, me, a);
    return; // 동료를 꾹: 인식만 하고 효과는 없다(2단계 침투 지시 자리)
  }
  // 공이 없을 때(수비): 모든 콕이 스탠딩 태클, 꾹은 슬라이딩 태클. 쓸기와 동료 꾹은 무시.
  if (a.type === 'tap') queueTackle(M, me, false); else if (a.type === 'hold') queueTackle(M, me, true);
}
function tackleNow(M, me, slide = false) {
  const b = M.ball; me.slideT = 0.35; // 임팩트 시점부터 슬라이드 모션(5장에서 스탠딩과 슬라이딩을 나눈다)

  if (b.st === 'held' && b.owner && b.owner.team !== me.team && hyp(b.owner.x - me.x, b.owner.y - me.y) < 1.5) {
    const pDef = Math.min(0.85, contestDefenderWins(b.owner.ab, me.ab, b.owner.dribbleUntil > M.real) + 0.15);
    if (M.rng() < pDef) { const loser = b.owner; loser.stumbleT = stumbleTime(loser.ab.strength); M.stats.tackles[me.team] += 1; setHold(M, me); M.events.push({ kind: 'tackle', team: me.team, id: me.id }); }
  } else if (b.st === 'loose' && hyp(b.x - me.x, b.y - me.y) < 1.8) setHold(M, me);
}

// ---------- 갱신 ----------
export function update(M, dt, input = {}) {
  if (M.phase === 'halftime' || M.phase === 'end') return;
  if (M.hitstop > 0) { M.hitstop -= dt; return; } // 히트스톱: 센 슛의 발사 순간 33ms
  const acts = input.actions ?? [];
  if (M.phase === 'deadball') { updateDead(M, dt, input, acts); return; }
  for (const a of acts) applyHumanAction(M, a);
  updateControl(M);
  think(M, dt);
  if (!M.autoHuman) controlTargets(M, input.move, dt);
  movePlayers(M, dt);
  runQueue(M, dt);
  stepBall(M, dt);
  contest(M, dt);
  drain(M, dt);
  M.holdT = (M.holdT ?? 0) + dt;
  stepClock(M, dt);
}

function updateControl(M) {
  const b = M.ball;
  if (M.queue.some((e) => e.kind === 'pass' && e.p.team === 0)) return; // 패스 준비 중에는 이미 받는 선수가 조종 선수다
  if (b.st === 'held' && b.owner?.team === 0 && !b.owner.gk) { M.control = M.players.indexOf(b.owner); return; }
  if (b.st === 'pass' && b.tgt?.team === 0) return; // 이미 받는 선수로 넘어갔다
  // 수비/루즈볼: 공에 가장 가까운 선수(0.8m 히스테리시스)
  let best = -1; let bd = 1e9;
  M.players.forEach((p, i) => { if (p.team !== 0 || p.gk) return; const d = hyp(p.x - b.x, p.y - b.y); if (d < bd) { bd = d; best = i; } });
  const cur = M.players[M.control];
  if (!cur || cur.team !== 0 || cur.gk || hyp(cur.x - b.x, cur.y - b.y) - bd > 0.8) M.control = best;
}
function controlTargets(M, move, dt) {
  const me = M.players[M.control];
  if (!me) return;
  if (move) {
    const mag = Math.min(1, hyp(move.x, move.y));
    const boost = me.dribbleUntil > M.real && me.dribbleUntil - M.real > TUNE.dribbleSeconds * 0.5 ? TUNE.dribbleBoost : 1;
    me.tx = me.x + move.x * 3; me.ty = me.y + move.y * 3; me.ts = effSpeed(me.ab.speed, me.ratio) * mag * boost;
  } else if (M.ball.st === 'pass' && M.ball.tgt === me && M.ball.dest) { // 조이스틱을 안 잡았으면 받는 자리로 알아서 간다
    me.tx = M.ball.dest.x; me.ty = M.ball.dest.y; me.ts = effSpeed(me.ab.speed, me.ratio);
  } else { me.tx = me.x; me.ty = me.y; me.ts = 0; }
  void dt;
}
function movePlayers(M, dt) {
  for (const p of M.players) {
    const dx = p.tx - p.x; const dy = p.ty - p.y; const d = hyp(dx, dy);
    let vx = 0; let vy = 0;
    const mm = (p.prepShot ? TUNE.kick.shot.moveMul : 1) * (p.stumbleT > 0 ? TUNE.kick.stumbleMoveMul : 1); // 슛 준비 중 40%, 비틀거리는 동안 정지
    if (p.delay > 0) p.delay -= dt;
    if (d > 0.05 && p.ts > 0 && p.delay <= 0) { const s = Math.min(p.ts * mm, d / 0.15); vx = dx / d * s; vy = dy / d * s; }
    const a = Math.min(1, dt * TUNE.accel);
    p.vx += (vx - p.vx) * a; p.vy += (vy - p.vy) * a;
    p.x = clamp(p.x + p.vx * dt, 0.4, W - 0.4); p.y = clamp(p.y + p.vy * dt, 0.4, H - 0.4);
    if (Math.abs(p.vx) > 0.4) p.face = p.vx > 0 ? 1 : -1;
    p.kickT = Math.max(0, (p.kickT ?? 0) - dt); p.slideT = Math.max(0, (p.slideT ?? 0) - dt); p.twistT = Math.max(0, (p.twistT ?? 0) - dt); p.diveT = Math.max(0, (p.diveT ?? 0) - dt); p.stumbleT = Math.max(0, (p.stumbleT ?? 0) - dt);
  }
}

function stepBall(M, dt) {
  const b = M.ball;
  if (b.st === 'held') {
    const h = b.owner; const dir = h.team === 0 ? 1 : -1;
    b.x = h.x + dir * 0.5; b.y = h.y + 0.1; b.vx = 0; b.vy = 0;
    return;
  }
  if (b.st === 'pass') {
    const dest = b.dest ?? b.tgt; const dx = dest.x - b.x; const dy = dest.y - b.y; const d = hyp(dx, dy) || 1; const s = Math.min(d, b.speed * dt);
    b.x += dx / d * s; b.y += dy / d * s; b.vx = dx / d * b.speed; b.vy = dy / d * b.speed;
    for (const q of M.players) {
      if (q.team !== M.lastTouch && hyp(q.x - b.x, q.y - b.y) < TUNE.interceptR) { M.stats.intercepts[q.team] += 1; setHold(M, q); M.events.push({ kind: 'intercept', team: q.team, id: q.id }); return; }
    }
    // 받는 선수가 공 가까이 오면 받는다(달려 들어온 선수 포함). 도착했는데 아무도 못 받으면 루즈볼.
    if (hyp(b.tgt.x - b.x, b.tgt.y - b.y) < TUNE.pickupR) { const r = b.tgt; setHold(M, r); M.events.push({ kind: 'receive', team: r.team, id: r.id }); return; }
    for (const q of M.players) if (q.team === M.lastTouch && !q.gk && q !== b.tgt && hyp(q.x - b.x, q.y - b.y) < TUNE.pickupR * 0.8 && d < 3) { setHold(M, q); return; } // 가까이 지나가는 다른 동료도 받는다
    if (d < 0.2) { b.st = 'loose'; b.vx = b.vx * 0.25; b.vy = b.vy * 0.25; }
  } else if (b.st === 'shot') {
    const s = b.speed * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.trav += s;
    const att = b.shooter.team; const gx = goalX(att);
    if (b.trav > 1.3) for (const q of M.players) { if (q.team === att || q.gk) continue; if (hyp(q.x - b.x, q.y - b.y) < TUNE.blockR) { b.st = 'loose'; b.vx = -b.vx * 0.2; b.vy = (M.rng() - 0.5) * 3; M.events.push({ kind: 'block', team: q.team }); return; } }
    if ((att === 0 && b.x >= gx) || (att === 1 && b.x <= gx)) resolveShot(M, att);
  } else if (b.st === 'loose') {
    b.x += b.vx * dt; b.y += b.vy * dt; const f = Math.exp(-TUNE.ballFriction * dt); b.vx *= f; b.vy *= f;
    let best = null; let bd = TUNE.pickupR;
    for (const q of M.players) { const d = hyp(q.x - b.x, q.y - b.y); if (d < bd) { bd = d; best = q; } }
    if (best) setHold(M, best);
  }
  checkBounds(M);
}

function resolveShot(M, att) {
  const b = M.ball; const ay = b.y; const gk = keeper(M, 1 - att);
  const inGoal = ay > GY0 + 0.05 && ay < GY1 - 0.05;
  if (!inGoal) {
    const nearPost = Math.min(Math.abs(ay - GY0), Math.abs(ay - GY1)) < 0.2;
    M.events.push({ kind: nearPost ? 'post' : 'miss', team: att });
    b.st = 'loose'; b.vx = (att === 0 ? -1 : 1) * 4; b.vy = (M.rng() - 0.5) * 6; b.x = att === 0 ? W - 0.05 : 0.05;
    return;
  }
  const emptyNet = !gk || M.opts.gkAdvance[1 - att];
  // 골키퍼는 실제로 움직인다: 반응 시간 뒤 공이 지날 자리로 몸을 날리고, 공이 골라인을 지날 때 손이 닿는 범위 안이면 막는다.
  const miss = emptyNet ? 99 : Math.abs(gk.y - ay);
  M.lastShot = { team: att, ay, gkY: gk?.y, miss, reach: gk ? gkReach(gk.ab.handling, b.power ?? 0.5) : 0, dist: b.dist, power: b.power }; (M.shotLog ??= []).push(M.lastShot);
  const saved = emptyNet ? M.rng() >= TUNE.flyingGk.emptyNetGoal : miss <= gkReach(gk.ab.handling, b.power ?? 0.5);
  if (!saved) goalScored(M, att, b.shooter);
  else {
    M.stats.saves[1 - att] += 1; M.events.push({ kind: 'save', team: 1 - att, id: gk?.id });
    const hold = gk && M.rng() < clamp(gk.ab.handling / 25, 0.3, 0.9);
    if (hold) { gk.x = wx(gk.team, 2.2); gk.y = clamp(ay, GY0, GY1); setHold(M, gk); clearQueue(M); M.phase = 'deadball'; M.restart = { kind: 'goalkeeper', team: gk.team, timer: TUNE.deadBallSeconds, pick: null, x: gk.x, y: gk.y }; if (gk.team === 0) M.control = M.players.indexOf(gk); }
    else { b.st = 'loose'; b.vx = (att === 0 ? -1 : 1) * 3; b.vy = (M.rng() - 0.5) * 7; b.x = goalX(att) + (att === 0 ? -0.5 : 0.5); }
  }
}
function goalScored(M, att, shooter) {
  M.score[att] += 1; M.stats.goals.push({ team: att, id: shooter.id, half: M.half, clock: M.clock });
  M.events.push({ kind: 'goal', team: att, id: shooter.id });
  startKickoff(M, 1 - att); // 실점한 팀이 센터 킥오프
}

function checkBounds(M) {
  const b = M.ball;
  if (b.x >= 0 && b.x <= W && b.y >= 0 && b.y <= H) return;
  const last = M.lastTouch;
  let r;
  if (b.y < 0 || b.y > H) r = { kind: 'kickin', team: 1 - last, x: clamp(b.x, 1, W - 1), y: b.y < 0 ? 0.3 : H - 0.3 };
  else {
    const endTeam = b.x < 0 ? 0 : 1; // 이 골라인을 지키는 팀
    if (last === endTeam) r = { kind: 'corner', team: 1 - endTeam, x: b.x < 0 ? 0.4 : W - 0.4, y: b.y < H / 2 ? 0.4 : H - 0.4 };
    else r = { kind: 'goalkeeper', team: endTeam, x: wx(endTeam, 2.2), y: GYC };
  }
  clearQueue(M);
  M.phase = 'deadball'; b.vx = 0; b.vy = 0;
  M.restart = { ...r, timer: TUNE.deadBallSeconds, pick: null };
  // 재개할 선수를 정해 공을 들게 한다
  const cand = r.kind === 'goalkeeper' ? keeper(M, r.team) : outfield(M, r.team).sort((p, q) => hyp(p.x - r.x, p.y - r.y) - hyp(q.x - r.x, q.y - r.y))[0];
  cand.x = r.x; cand.y = r.y; cand.tx = r.x; cand.ty = r.y; cand.vx = 0; cand.vy = 0;
  setHold(M, cand);
  if (r.team === 0) M.control = M.players.indexOf(cand);
}

function updateDead(M, dt, input, acts) {
  const r = M.restart;
  for (const a of acts) applyHumanAction(M, a);
  r.timer -= dt; // 시계는 흐르지 않는다
  if (r.kind !== 'kickoff') { // 데드볼에서도 받을 자리를 찾아 계속 움직인다. 상대는 공에서 3m 이상 떨어진다.
    think(M, dt);
    const h = M.ball.owner;
    for (const q of M.players) {
      if (q === h) { q.tx = q.x; q.ty = q.y; q.ts = 0; continue; }
      if (q.team !== h.team) { const d = hyp(q.tx - h.x, q.ty - h.y); if (d < 3.2) { const k = 3.2 / (d || 1); q.tx = h.x + (q.tx - h.x) * k; q.ty = clamp(h.y + (q.ty - h.y) * k, 0.6, H - 0.6); } }
    }
    movePlayers(M, dt);
    for (const q of M.players) if (q.team !== h.team && hyp(q.x - h.x, q.y - h.y) < 3) { const d = hyp(q.x - h.x, q.y - h.y) || 1; q.x = clamp(h.x + (q.x - h.x) / d * 3, 0.4, W - 0.4); q.y = clamp(h.y + (q.y - h.y) / d * 3, 0.4, H - 0.4); }
  }
  const total = r.kind === 'kickoff' ? TUNE.autoRestartSeconds : TUNE.deadBallSeconds;
  const elapsed = total - r.timer;
  const humanPick = r.team === 0 && r.kind !== 'kickoff';
  // 사람은 4초 안에 1탭으로 받을 선수를 고른다(시간이 지나면 가장 가까운 동료로 자동). AI는 1초 뒤 재개.
  const ready = r.kind === 'kickoff' ? r.timer <= 0 : (humanPick ? (r.pick != null || r.timer <= 0) : elapsed >= 1.0);
  if (!ready) return;
  M.phase = 'play';
  if (r.kind !== 'kickoff') {
    const holder = M.ball.owner;
    const tgt = r.pick ?? nearestMate(M, holder, holder.x + (holder.team === 0 ? 6 : -6), H / 2) ?? outfield(M, holder.team)[0];
    if (tgt && tgt !== holder) passTo(M, holder, tgt);
  }
  M.restart = null;
}

function contest(M, dt) {
  const b = M.ball;
  if (b.st !== 'held' || !b.owner || b.owner.gk) { M.contestT = 0; return; }
  const c = b.owner;
  let near = null;
  for (const q of M.players) { if (q.team === c.team || q.gk) continue; if (hyp(q.x - c.x, q.y - c.y) < TUNE.contactR) { near = q; break; } }
  if (!near) { M.contestT = 0; return; }
  M.contestT += dt;
  if (M.contestT >= TUNE.contestInterval) {
    M.contestT = 0;
    const p = contestDefenderWins(c.ab, near.ab, c.dribbleUntil > M.real);
    if (M.rng() < p) { c.stumbleT = stumbleTime(c.ab.strength); near.slideT = 0.3; M.stats.tackles[near.team] += 1; M.events.push({ kind: 'tackle', team: near.team, id: near.id }); setHold(M, near); }
  }
}

function drain(M, dt) {
  for (const p of M.players) {
    const sp = hyp(p.vx, p.vy);
    p.ratio = Math.max(0, p.ratio - drainPerSecond(p.ab.stamina) * (sp / 4.5) * dt);
  }
}

function stepClock(M, dt) {
  M.real += dt; M.halfClock += dt * TUNE.clockScale; M.clock += dt * TUNE.clockScale;
  if (M.halfClock >= TUNE.halfClockSeconds && M.extra[M.half] == null) {
    const [lo, hi] = TUNE.extraMinutes[M.half];
    M.extra[M.half] = randInt(M.rng, lo, hi) * 60; M.inExtra = true;
    M.events.push({ kind: 'extra', half: M.half, minutes: M.extra[M.half] / 60 });
  }
  if (M.extra[M.half] != null && M.halfClock >= TUNE.halfClockSeconds + M.extra[M.half]) {
    M.inExtra = false; clearQueue(M);
    M.phase = M.half === 1 ? 'halftime' : 'end';
    M.events.push({ kind: M.half === 1 ? 'halftime' : 'end' });
  }
}

// 하프타임 후 후반 시작(성향 변경 한 번)
export function startSecondHalf(M, stance) {
  if (M.phase !== 'halftime') return;
  if (stance && stance !== M.stance[0]) { M.stance[0] = stance; buildTeams(M); }
  M.half = 2; M.halfClock = 0; M.inExtra = false;
  startKickoff(M, 1);
}
export const flyingGkAvailable = (M) => M.half === 2 && M.inExtra;
