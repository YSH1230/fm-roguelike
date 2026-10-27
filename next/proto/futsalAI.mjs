// 풋살 팀 AI(시연판 P1: 기본 행동). 정적 금지: 모든 팀이 지원 삼각형, 마킹, 압박, 침투 런을 항상 한다.
// 이 모듈은 선수의 목표 위치(tx, ty, ts)와 공 가진 AI의 패스/슛 결정만 정한다. 이동과 공 물리는 futsalSim이 한다.
// 팀 기준 좌표(local)에서 계산하고 월드로 되돌린다: local x = 자기 골대에서 상대 골대 쪽으로 늘어난다.
import { TUNE, effSpeed, shotRange, standingReach } from './futsalRules.mjs';
import { canTackle } from './futsalSim.mjs';

const W = TUNE.court.w;
const H = TUNE.court.h;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const hyp = Math.hypot;
const lx = (t, x) => (t === 0 ? x : W - x);

function segDist(px, py, ax, ay, bx, by) {
  const abx = bx - ax; const aby = by - ay; const l2 = abx * abx + aby * aby || 1;
  const t = clamp(((px - ax) * abx + (py - ay) * aby) / l2, 0, 1);
  return hyp(px - (ax + t * abx), py - (ay + t * aby));
}
// 패스 길과 동료 주변의 수비 거리(m): 열림 정도 계산용(현재 위치 기준)
export function laneInfo(M, from, to) {
  let lane = 99; let mate = 99;
  for (const q of M.players) {
    if (q.team === from.team) continue;
    const dq = hyp(q.x - from.x, q.y - from.y); const dt2 = hyp(to.x - from.x, to.y - from.y) || 1;
    // 공 가진 선수 바로 옆(2.5m 안)의 수비수는 패스 방향 60도 밖이면 길을 막지 않는다(붙어 있으니 거리만으로는 항상 걸린다)
    const behind = dq < TUNE.ai.nearOpp && ((q.x - from.x) * (to.x - from.x) + (q.y - from.y) * (to.y - from.y)) / (dq * dt2 || 1) < TUNE.ai.nearCos;
    if (!behind) lane = Math.min(lane, segDist(q.x, q.y, from.x, from.y, to.x, to.y));
    mate = Math.min(mate, hyp(q.x - to.x, q.y - to.y));
  }
  return { lane, mate };
}

function ensureRun(M, t) {
  M.run ??= [null, null];
  M.run[t] ??= { t: 0, d: 0, who: null, cool: 2.5, jx: 0, jy: 0, started: 0 };
  return M.run[t];
}

export function think(M, dt) {
  for (let t = 0; t < 2; t += 1) aiTeam(M, t, dt);
}

function aiTeam(M, t, dt) {
  const b = M.ball;
  const mine = M.players.filter((p) => p.team === t);
  const opp = M.players.filter((p) => p.team !== t);
  const skill = M.ai.skill[t];
  const sloppy = 1 - skill / 20;
  const sp = (p, f = 1) => effSpeed(p.ab.speed, p.ratio) * f * p.fr;
  const go = (p, x, y, s) => { p.tx = lx(t, x); p.ty = clamp(y, 0.6, H - 0.6); p.ts = s; };
  const gk = mine.find((p) => p.gk);
  const field = mine.filter((p) => !p.gk);
  const hasBall = b.st === 'held' && b.owner?.team === t;
  const incoming = b.st === 'pass' && b.tgt?.team === t;
  const wob = (p) => Math.sin(M.real * 1.3 + p.num) * 1.4;
  const ownLocal = (p) => ({ x: t === 0 ? p.x : W - p.x, y: p.y });
  const run = ensureRun(M, t);
  const isH = (p) => t === 0 && !M.autoHuman && !M.autoCtl && p === M.players[M.control]; // 사람이 조종하는 선수는 AI가 건드리지 않는다

  // 골키퍼: 공을 따라 골문 앞에서 좌우로 움직인다(높은 골키퍼 특기는 P3)
  if (gk && !isH(gk) && !(b.owner === gk)) {
    if (b.st === 'shot' && b.shooter.team !== t && M.real >= b.reactAt && !b.gkDived) { b.gkDived = true; if (Math.abs((b.aimTarget ?? b.aimY) - gk.y) > 0.5) { gk.diveT = 0.55; gk.diveDir = (b.aimTarget ?? b.aimY) > gk.y ? 1 : -1; } }
    if (b.st === 'shot' && b.shooter.team !== t && M.real >= b.reactAt) go(gk, 2.2, clamp(b.aimTarget ?? b.aimY, TUNE.shot.goalY[0] - 0.4, TUNE.shot.goalY[1] + 0.4), effSpeed(gk.ab.speed, gk.ratio) * TUNE.shot.gkDive); // 반응 뒤 공이 지날 자리로 몸을 날린다
    else go(gk, 2.2, clamp(b.y, TUNE.shot.goalY[0] + 0.3, TUNE.shot.goalY[1] - 0.3), sp(gk, 0.55));
  }

  if (incoming && b.dest && !isH(b.tgt)) { b.tgt.tx = b.dest.x; b.tgt.ty = b.dest.y; b.tgt.ts = effSpeed(b.tgt.ab.speed, b.tgt.ratio); }
  if (hasBall || incoming) {
    const c = hasBall ? b.owner : b.tgt;
    const cl = ownLocal(c);
    // 침투 런: 소유자가 14~30m에 있을 때 3.5~6초마다 한 번(정교함이 높을수록 빠르고 자주)
    run.cool -= dt;
    if (run.d > 0) run.d -= dt; else if (run.t > 0) run.t -= dt;
    if (run.t <= 0 && run.d <= 0 && run.cool <= 0 && cl.x > 14 && cl.x < 30 && hasBall) {
      const cands = field.filter((p) => p !== c);
      const piv = cands.filter((p) => p.role === 'PIVOT'); const ala = cands.filter((p) => p.role === 'ALA');
      const pool = M.rng() < 0.7 && piv.length ? piv : (ala.length ? ala : cands);
      run.who = pool[Math.floor(M.rng() * pool.length)] ?? null;
      run.d = sloppy * 0.6; run.jx = (M.rng() - 0.5) * sloppy * 4.4; run.jy = (M.rng() - 0.5) * sloppy * 4.4; run.t = 1.6;
      run.cool = (3.5 + M.rng() * 2.5) * (2 - skill * 0.075);
      M.stats.runs[t] += 1; (M.runLog ??= []).push({ team: t, delay: run.d, at: M.real });
    }
    const lastOpp = Math.max(...opp.filter((p) => !p.gk).map((p) => (t === 0 ? p.x : W - p.x)));
    for (const p of field) {
      if (p === c || isH(p)) continue;
      if (incoming && p === b.tgt) continue;
      if (run.t > 0 && run.d <= 0 && run.who === p) { go(p, clamp(lastOpp + 1.5 + run.jx * 0.5, 18, 37), clamp((cl.y < 10 ? 13 : 7) + run.jy * 0.6, 3, 17), sp(p, 1.0) * 1.05); continue; }
      if (p.role === 'ALA' || (p.role === 'PIVOT' && field.filter((q) => q.role === 'PIVOT').length > 1 && p !== field.find((q) => q.role === 'PIVOT'))) {
        const up = p.home.y < H / 2;
        const drift = Math.sin(M.real * 0.8 + p.num * 1.7); // 지원 선수는 자리를 지키며 천천히 오르내린다
        go(p, clamp(cl.x + 3 + wob(p) * sloppy + drift * 1.6, 5, 34), clamp(cl.y + (up ? -5.5 : 5.5) + wob(p) * (0.4 + sloppy) + drift * 1.6, 3, 17), sp(p, 0.95));
      } else if (p.role === 'FIXO') go(p, clamp(cl.x - 5 + wob(p) * sloppy, 5, 28), 10 + wob(p) * (0.5 + sloppy), sp(p, 0.9));
      else go(p, clamp(cl.x + 9, 22, 35), 10 + wob(p), sp(p, 0.95)); // 피보
    }
    if (hasBall && !isH(c) && M.phase === 'play' && !M.frozenAI?.has(c.id)) carrierAI(M, t, c, dt, mine, opp, go, sp);
    return;
  }

  // 수비 또는 루즈볼(5장)
  // 1차 수비수: 공 가진 상대에게 곧장 달려들지 않고 약 1.3m 거리를 두고 골대 쪽에서 따라붙는다.
  // 2차 수비수(커버): 1차 수비수 뒤 2~3m, 골대 쪽 중앙. 나머지: 상대 선수 옆이 아니라 공과 그 선수 사이에 서서 패스 길을 막는다.
  const ob = b.st === 'held' && b.owner ? b.owner : null;
  const D = TUNE.defense;
  const byBall = [...field].sort((p, q) => hyp(p.x - b.x, p.y - b.y) - hyp(q.x - b.x, q.y - b.y));
  const presser = byBall[0]; const cover = byBall[1];
  const ownGoalX = t === 0 ? 0 : W;
  const attackers = opp.filter((p) => !p.gk && p !== ob).sort((p, q) => (t === 0 ? q.x - p.x : p.x - q.x));
  // AI 대 AI(자동 진행)는 양쪽 같은 강도
  const level = (t === 0 && !M.autoHuman) ? TUNE.difficulty.autoDefense : 'normal'; const attempt = (D.attemptPerSec[level] ?? 1) * TUNE.difficulty.aiActivity;
  let mi = 0;
  for (const p of field) {
    if (isH(p)) continue;
    if (p === presser) {
      if (ob) { // 공 쪽으로 1.3m 떨어진 골대 쪽 지점에 선다(상대가 움직이면 그 앞을 읽는다)
        const dx = ownGoalX - ob.x; const dy = 10 - ob.y; const l = hyp(dx, dy) || 1;
        p.tx = ob.x + ob.vx * 0.15 + dx / l * D.jockey; p.ty = clamp(ob.y + ob.vy * 0.15 + dy / l * D.jockey, 0.6, H - 0.6); p.ts = sp(p, 1.0);
        // 상대의 공이 몸에서 멀어지거나 방향을 바꾸는 틈에 스탠딩 태클을 시도한다
        if (hyp(p.x - ob.x, p.y - ob.y) <= standingReach(p.ab) && canTackle(M, p, false) && !M.queue.some((e) => e.p === p) && (b.far ? (p.sigTry !== Math.floor(M.real / D.signalWindow) && (p.sigTry = Math.floor(M.real / D.signalWindow), M.rng() < attempt)) : M.rng() < attempt * D.randomAttempt * 0.016)) M.api.tackle(p, false, { signal: !!b.far }); // AI도 공이 몸에서 멀어진 틈에 시도하면 신호 보너스를 받는다. 공이 몸에서 멀어진 틈마다 한 번 시도할지 정한다
      } else { p.tx = b.x; p.ty = b.y; p.ts = sp(p, 1.0); }
      continue;
    }
    if (p === cover && ob) { const dx = ownGoalX - presser.x; const dy = 10 - presser.y; const l = hyp(dx, dy) || 1; p.tx = presser.x + dx / l * D.coverBack; p.ty = clamp(presser.y + dy / l * D.coverBack, 0.6, H - 0.6); p.ts = sp(p, 0.95); continue; }
    const m = attackers[mi % Math.max(1, attackers.length)]; mi += 1;
    if (m) { // 패스 길을 막되 완벽하지는 않다: 길에서 옆으로 laneError만큼 어긋난 자리에 선다(정교함이 높을수록 줄어든다 - P3)
      const k = ob ? D.laneShare : 0.4; const lx0 = b.x + (m.x - b.x) * k; const ly0 = b.y + (m.y - b.y) * k;
      const dl = hyp(m.x - b.x, m.y - b.y) || 1; const nx = -(m.y - b.y) / dl; const ny = (m.x - b.x) / dl; const side = (p.num % 2 ? 1 : -1) * (level === 'weak' ? D.laneErrorWeak : D.laneError);
      const w = Math.sin(M.real * 1.3 + p.num * 2.1) * 0.9; // 서 있는 수비도 조금씩 움직인다
      p.tx = lx0 + nx * side + w; p.ty = clamp(ly0 + ny * side + w * 0.6, 0.6, H - 0.6); p.ts = sp(p, 0.9);
    } else go(p, 10, 10, sp(p, 0.7));
  }
}

function shotLaneClear(M, c, opp) {
  const gx = c.team === 0 ? W : 0;
  for (const q of opp) { if (q.gk) continue; if (segDist(q.x, q.y, c.x, c.y, gx, 10) < TUNE.ai.shotLane) return false; }
  return true;
}
// 공 가진 AI 선수의 선택: 사거리 안이면 슛, 아니면 열린 동료에게 패스, 아니면 골문 쪽으로 몰고 간다
function carrierAI(M, t, c, dt, mine, opp, go, sp) {
  const A = TUNE.ai;
  c.think = (c.think ?? 1) - dt;
  const cl = { x: t === 0 ? c.x : W - c.x, y: c.y };
  const press = Math.min(...opp.filter((p) => !p.gk).map((p) => hyp(p.x - c.x, p.y - c.y)));
  const pressed = press < A.pressDist;
  const first = (M.holdT ?? 0) < A.firstTouch; // 받은 직후에는 바로 결정하지 않는다
  c.stuckT = Math.hypot(c.vx, c.vy) < 1 ? (c.stuckT ?? 0) + dt : 0; // 벽과 수비수 사이에 갇히면 곧 결정한다
  if (pressed && !first) c.think = Math.min(c.think, c.stuckT > 0.8 ? 0.1 : A.pressedThink); // 압박받으면 곧 결정
  const dist = W - cl.x;
  const range = shotRange(c.ab.shooting ?? 8);
  c.shotT = (c.shotT ?? 0.5) - dt;
  if (c.shotT <= 0 && !first && !c.gk) { // 슛 판단은 패스 판단과 따로 더 자주 한다
    c.shotT = A.shotThink;
    const gkp = opp.find((p) => p.gk);
    if (dist < range && dist > 2.5 && M.rng() < A.shotP && shotLaneClear(M, c, opp)) {
      const corner = (gkp && gkp.y > 10) ? -1 : 1;
      M.api.shoot(c, 10 + corner * TUNE.shot.cornerOffset, false, 0.7 + M.rng() * 0.3);
      return;
    }
  }
  if (c.think <= 0 && !first) {
    c.think = c.gk ? A.gkThink[0] + M.rng() * (A.gkThink[1] - A.gkThink[0]) : A.think[0] + M.rng() * (A.think[1] - A.think[0]);
    let best = null; let bs = 0;
    for (const q of mine) {
      if (q === c || q.gk) continue;
      const { lane, mate } = laneInfo(M, c, q);
      const slack = (M.holdT ?? 0) > 3 ? TUNE.ai.slack : 1; // 오래 들고 있으면 기준을 낮춘다
      if (lane < A.passLane * slack || mate < A.passMate * slack) continue; // 수비수가 지나는 길 근처에 있으면 보내지 않는다
      const adv = (t === 0 ? q.x : W - q.x) - cl.x;
      const sc = Math.min(lane, 3) + Math.min(mate, 4) * 0.5 + adv * 0.12;
      if (sc > bs) { bs = sc; best = q; }
    }
    if (best && (c.gk || (M.holdT ?? 0) > 3 || M.rng() < (pressed ? A.passPressed : A.pass))) { M.api.pass(c, best); return; }
  }
  // 몰고 가기: 골문 쪽으로, 수비수가 가까우면 옆으로 비켜서
  let ty = 10 + (cl.y > 10 ? 1 : -1) * 2;
  const pr = opp.find((p) => !p.gk && hyp(p.x - c.x, p.y - c.y) < 2.2);
  if (pr) ty = cl.y + (pr.y > cl.y ? -3 : 3);
  if (c.stuckT > 1.2) { go(c, clamp(cl.x - 3, 5, 36), 10, sp(c, 0.8)); return; } // 갇혔으면 중앙 쪽으로 물러나 빠져나온다
  go(c, clamp(cl.x + 4, 5, 36), clamp(ty, 2, 18), sp(c, 0.8));
}
