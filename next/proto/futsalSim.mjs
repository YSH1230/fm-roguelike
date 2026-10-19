// 풋살 5 대 5 시뮬레이션(순수 상태 머신, DOM 없음). 시간은 update(dt)의 dt만 쓰고 난수는 시드 RNG만 쓴다.
// 좌표는 미터. 팀 0(사람)은 왼쪽 골대를 지키고 +x로 공격, 팀 1은 오른쪽 골대를 지키고 -x로 공격한다.
import { createRng, randInt, gauss } from '../engine/rng.mjs';
import {
  TUNE, contestDefenderWins, drainPerSecond, effSpeed, gkDelay, shotNoise, shotRange, shotZone,
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
    players.push({ id: `${name}${i}`, name: `${name}${i}`, gk, cond: 1, ab: gk ? { speed: j(), stamina: j(), strength: j(), reaction: j(), handling: j() } : { speed: j(), stamina: j(), strength: j(), skill: j(), shooting: j() } });
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
  M.api = { pass: (p, t) => passTo(M, p, t), shoot: (p, ay) => shoot(M, p, ay), takeRestartPick: null };
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

function setHold(M, p) { M.holdT = 0; M.ball.st = 'held'; M.ball.owner = p; M.ball.tgt = null; M.lastTouch = p.team; M.ball.x = p.x; M.ball.y = p.y; }

function startKickoff(M, t) {
  for (const p of M.players) placeHome(M, p);
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
  return true;
}

// ---------- 행동 ----------
export function passTo(M, p, tgt) {
  const b = M.ball;
  b.st = 'pass'; b.owner = null; b.tgt = tgt; M.lastTouch = p.team; M.stats.passes[p.team] += 1;
  if (p.team === 0) M.control = M.players.indexOf(tgt); // 패스하면 받는 선수로 조종이 넘어간다
}
function nearestMate(M, p, wxp, wyp) {
  let best = null; let bd = 1e9;
  for (const q of M.players) { if (q.team !== p.team || q === p || q.gk) continue; const d = hyp(q.x - wxp, q.y - wyp); if (d < bd) { bd = d; best = q; } }
  return best;
}
export function shoot(M, p, ay, noiseFree = false) {
  const b = M.ball; const gx = goalX(p.team); const dist = Math.abs(gx - p.x);
  const sh = p.ab.shooting ?? 8;
  const noise = noiseFree ? 0 : gauss(M.rng) * shotNoise(sh, dist);
  const rangeFactor = dist > shotRange(sh) ? 1 + (dist - shotRange(sh)) * 0.25 : 1; // 사거리 밖은 많이 흔들린다
  const tyv = ay + noise * rangeFactor;
  const dx = gx - p.x; const dy = tyv - p.y; const l = hyp(dx, dy) || 1;
  Object.assign(b, { st: 'shot', owner: null, tgt: null, x: p.x, y: p.y, vx: dx / l * TUNE.shotSpeed, vy: dy / l * TUNE.shotSpeed, trav: 0, shooter: p, aimY: tyv, dist });
  M.lastTouch = p.team; M.stats.shots[p.team] += 1; M.events.push({ kind: 'shot', team: p.team, id: p.id });
}

function applyHumanAction(M, a) {
  const me = M.players[M.control];
  const b = M.ball;
  const holding = b.st === 'held' && b.owner === me;
  if (a.type === 'dribble') { me.dribbleUntil = M.real + TUNE.dribbleSeconds; return; }
  if (M.phase === 'deadball') { // 킥인, 코너, 골키퍼 재개: 탭 한 번으로 받을 선수를 고른다
    if (a.type === 'tap' || a.type === 'drag') { const r = M.restart; const tg = nearestMate(M, M.players[M.control], a.wx, a.wy); if (tg) r.pick = tg; }
    return;
  }
  if (holding) {
    if (a.type === 'tap' || a.type === 'drag') { const tg = nearestMate(M, me, a.wx, a.wy); if (tg) passTo(M, me, tg); }
    else if (a.type === 'shot') shoot(M, me, GYC + shotZone(a.dx, a.dy) * TUNE.shot.cornerOffset);
    return;
  }
  if (a.type === 'tap') tackle(M, me); // 수비 때 탭 = 태클
}
function tackle(M, me) {
  const b = M.ball;
  if (b.st === 'held' && b.owner && b.owner.team !== me.team && hyp(b.owner.x - me.x, b.owner.y - me.y) < 1.5) {
    const pDef = Math.min(0.85, contestDefenderWins(b.owner.ab, me.ab, b.owner.dribbleUntil > M.real) + 0.15);
    if (M.rng() < pDef) { M.stats.tackles[me.team] += 1; setHold(M, me); M.events.push({ kind: 'tackle', team: me.team, id: me.id }); }
  } else if (b.st === 'loose' && hyp(b.x - me.x, b.y - me.y) < 1.8) setHold(M, me);
}

// ---------- 갱신 ----------
export function update(M, dt, input = {}) {
  if (M.phase === 'halftime' || M.phase === 'end') return;
  const acts = input.actions ?? [];
  if (M.phase === 'deadball') { updateDead(M, dt, input, acts); return; }
  for (const a of acts) applyHumanAction(M, a);
  updateControl(M);
  think(M, dt);
  if (!M.autoHuman) controlTargets(M, input.move, dt);
  movePlayers(M, dt);
  stepBall(M, dt);
  contest(M, dt);
  drain(M, dt);
  M.holdT = (M.holdT ?? 0) + dt;
  stepClock(M, dt);
}

function updateControl(M) {
  const b = M.ball;
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
  } else { me.tx = me.x; me.ty = me.y; me.ts = 0; }
  void dt;
}
function movePlayers(M, dt) {
  for (const p of M.players) {
    const dx = p.tx - p.x; const dy = p.ty - p.y; const d = hyp(dx, dy);
    let vx = 0; let vy = 0;
    if (p.delay > 0) p.delay -= dt;
    if (d > 0.05 && p.ts > 0 && p.delay <= 0) { const s = Math.min(p.ts, d / 0.15); vx = dx / d * s; vy = dy / d * s; }
    const a = Math.min(1, dt * TUNE.accel);
    p.vx += (vx - p.vx) * a; p.vy += (vy - p.vy) * a;
    p.x = clamp(p.x + p.vx * dt, 0.4, W - 0.4); p.y = clamp(p.y + p.vy * dt, 0.4, H - 0.4);
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
    const t = b.tgt; const dx = t.x - b.x; const dy = t.y - b.y; const d = hyp(dx, dy) || 1; const s = Math.min(d, TUNE.passSpeed * dt);
    b.x += dx / d * s; b.y += dy / d * s; b.vx = dx / d * TUNE.passSpeed; b.vy = dy / d * TUNE.passSpeed;
    for (const q of M.players) {
      if (q.team === M.lastTouch || q.gk && hyp(q.x - b.x, q.y - b.y) > TUNE.interceptR) continue;
      if (q.team !== M.lastTouch && hyp(q.x - b.x, q.y - b.y) < TUNE.interceptR) { M.stats.intercepts[q.team] += 1; setHold(M, q); M.events.push({ kind: 'intercept', team: q.team, id: q.id }); return; }
    }
    if (d < 0.65) setHold(M, t);
  } else if (b.st === 'shot') {
    const s = TUNE.shotSpeed * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.trav += s;
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
  let pGoal;
  if (emptyNet) pGoal = TUNE.flyingGk.emptyNetGoal;
  else {
    const q = (gk.ab.reaction + gk.ab.handling) / 40; // 0~1
    const lag = gkDelay(1, gk.ratio) - 1;
    const pSave = clamp(0.8 - 0.18 * Math.abs(ay - GYC) / 1.1 + 0.012 * (b.dist - 8) + (q - 0.5) * 0.3 - lag * 0.2, 0.1, 0.9); // 코트 중앙에서 8m 기준
    pGoal = 1 - pSave;
  }
  if (M.rng() < pGoal) goalScored(M, att, b.shooter);
  else {
    M.stats.saves[1 - att] += 1; M.events.push({ kind: 'save', team: 1 - att, id: gk?.id });
    const hold = M.rng() < clamp(gk.ab.handling / 25, 0.3, 0.9);
    if (hold) { gk.x = wx(gk.team, 2.2); gk.y = clamp(ay, GY0, GY1); setHold(M, gk); M.phase = 'deadball'; M.restart = { kind: 'goalkeeper', team: gk.team, timer: TUNE.deadBallSeconds, pick: null, x: gk.x, y: gk.y }; if (gk.team === 0) M.control = M.players.indexOf(gk); }
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
    if (M.rng() < p) { M.stats.tackles[near.team] += 1; M.events.push({ kind: 'tackle', team: near.team, id: near.id }); setHold(M, near); }
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
    M.inExtra = false;
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
