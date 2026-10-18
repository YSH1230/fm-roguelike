// 헤드리스 봇: 렌더링 없이 Attack 상태 머신을 돌려 "느낌"의 합격 기준을 숫자로 잰다.
import { Attack } from '../proto/attack.mjs?v15';
import { TUNE, aimOf } from '../proto/rules.mjs?v15';

export const mulberry = (seed) => () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const gauss = (r) => { let u = 0; for (let i = 0; i < 6; i += 1) u += r(); return (u - 3) / Math.sqrt(0.5); };

// 봇 유형: 'skilled'(능숙), 'idle'(무입력), 'early'/'late'(첫 패스 창 밖)
export function playAttack({ seed = 1, bot = 'skilled', target = 'ST', stats = {}, cell, noise = 0.05, forceLoft = null, dt = 1 / 60, attackNo = 0 } = {}) {
  const r = mulberry(seed);
  const A = new Attack({ rand: r, stats, cell, attackNo });
  const ids0 = A.players.map((p) => p.id).sort().join(',');
  let idsChanged = false;
  let quiet = 0; let maxQuiet = 0; let prevBall = { x: A.ball.x, y: A.ball.y };
  let tapAt = null; let did = {}; let aimPlan = null;
  const jitter = () => gauss(r) * noise;
  let steps = 0;
  while (!A.done && steps < 60 * 40) {
    steps += 1;
    const phase = A.phase;
    if (bot !== 'idle') act(A, { r, bot, target, jitter, did, forceLoft, noise, get aimPlan() { return aimPlan; }, set aimPlan(v) { aimPlan = v; } });
    const before = A.lastInputT;
    A.update(dt);
    // 입력도 움직임도 없는 구간 측정
    const moving = A.players.some((p) => Math.hypot(p.vx, p.vy) > 3) || Math.hypot(A.ball.x - prevBall.x, A.ball.y - prevBall.y) > 0.05 || (A.lastInputT !== before);
    prevBall = { x: A.ball.x, y: A.ball.y };
    quiet = moving ? 0 : quiet + dt; maxQuiet = Math.max(maxQuiet, quiet);
    if (A.players.map((p) => p.id).sort().join(',') !== ids0) idsChanged = true;
    void phase; void tapAt;
  }
  return { A, maxQuiet, idsChanged, steps, ended: A.done };
}

function act(A, c) {
  const { r, bot, target, jitter, did } = c;
  const ph = A.phase;
  if (ph === 'first') {
    const cand = A.cands[target];
    const mid = (cand.open + cand.close) / 2;
    const when = bot === 'early' ? cand.open - 0.3 : (bot === 'late' ? cand.close + 0.3 : mid + jitter());
    if (!did.first && A.pt >= when) { did.first = true; A.input({ type: 'tap', x: cand.me.x, y: cand.me.y }); }
  } else if (ph === 'aim') {
    if (!did.aim && A.prt > 0.35) {
      did.aim = true;
      const loft = c.forceLoft ?? (r() < 0.5);
      const dur = loft ? TUNE.lobTime.loft : TUNE.lobTime.low;
      const holder = A.aim.holder; const lead = A.stLead(dur);
      const want = Math.atan2(lead.y - holder.y, lead.x - holder.x) + jitter() * 0.3;
      const len = loft ? 38 : 90;
      A.input({ type: 'aimRelease', dx: -Math.cos(want) * len, dy: -Math.sin(want) * len });
    }
  } else if (ph === 'run') {
    const run = A.runner;
    // 가장 급한 위협에서 멀어지는 쪽으로 튼다
    let steer = null; let danger = null;
    for (const th of A.threats) if (th.state === 'warn' || th.state === 'windup' || th.state === 'lunge') for (const q of th.defs) if (q.p.stun <= 0 && q.p.state !== 'done') { const d = Math.hypot(q.p.x - run.x, q.p.y - run.y); if (!danger || d < danger.d) danger = { d, q, th }; }
    const pd = Math.hypot(A.presser.x - run.x, A.presser.y - run.y);
    if (danger) {
      const score = (dir) => Math.abs(run.y + dir * 100 - danger.q.p.y) - Math.abs(run.y + dir * 100 - 213) * 0.6;
      steer = run.y + (score(1) >= score(-1) ? 1 : -1) * 45;
      // 가까이 오면 개인기
      if (c.bot !== 'straight' && !did['s' + danger.th.tc] && A.skill.cd <= 0 && (danger.th.state === 'lunge' && danger.d < 130) && (c.bot === 'skilled') && r() < 0.9) { did['s' + danger.th.tc] = true; A.input({ type: 'tap', x: run.x, y: run.y }); }
    }
    if (c.bot === 'straight') steer = run.y;
    A.input({ type: 'steer', y: steer == null ? 213 : steer });
    if (A.inRange && !did.range && c.bot !== 'straight') {
      did.range = true;
      if (run.role === 'WG') { if (r() < 0.5) A.input({ type: 'flick', dx: 60, dy: 0 }); else A.input({ type: 'tap', x: run.x, y: run.y }); }
      else A.input({ type: 'flick', dx: -60, dy: 0 });
    }
  } else if (ph === 'loose' && c.bot !== 'straight') {
    if (!did.loose && A.prt >= TUNE.looseTarget + jitter() * 0.6) { did.loose = true; A.input({ type: 'tap', x: 0, y: 0 }); }
  } else if (ph === 'pow') {
    if (!did.pow && Math.abs(A.gaugeNow() - 0.65) < 0.03 && A.prt > 0.25) { did.pow = true; A.input({ type: 'tap', x: 0, y: 0 }); }
  } else if (ph === 'dir') {
    const goal = A.gauge.farSide > 0 ? 0.79 : 0.21;
    if (!did.dir && Math.abs(A.gaugeNow() - goal) < 0.03 && A.prt > 0.2) { did.dir = true; A.input({ type: 'tap', x: 0, y: 0 }); }
  } else if (ph === 'rebound') {
    if (!did.reb && Math.abs(aimOf(A.gaugeNow()) - 0.7) < 0.08) { did.reb = true; A.input({ type: 'tap', x: 0, y: 0 }); }
  } else if (ph === 'header') {
    if (!did.head && A.prt >= TUNE.headerPeak + jitter()) { did.head = true; A.input({ type: 'tap', x: 0, y: 0 }); }
  }
}
