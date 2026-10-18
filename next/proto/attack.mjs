// 내 공격 한 번 = 끊김 없는 하나의 월드(v3). 렌더링과 무관한 상태 머신이라 헤드리스로 돌려 볼 수 있다.
// 선수는 생성자에서 한 번만 만들고 단계가 바뀌어도 지우지 않는다. 단계는 "조종 대상"과 "입력 해석"만 바꾼다.
// 좌표는 640x360 논리 화면(월드 단위), 공격은 +x, 상대 골문은 오른쪽이다.
import {
  TUNE, aimOf, clamp, fatigue, gaugeAt, headerWindow, instantGoalProb, looseWindow, openWindow, pressArrival, rangeMul,
  resolveShot, runSpeedOf, shootTime, shotRange, slingRange,
} from './rules.mjs?v14';

export const FIELD = { x0: 14, x1: 626, y0: 32, y1: 346, gy: 189 };
const GX = FIELD.x1;
const GY = FIELD.gy;
export const DEFAULT_STATS = {
  speed: 12, dribble: 12, shooting: 12, finishing: 12, pass: 12, vision: 12, stamina: 12, tackle: 12, reaction: 12, position: 12,
  activity: 12, oppDef: 10, oppAtk: 10,
};
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => { const k = clamp(t, 0, 1); return k * k * (3 - 2 * k); };

// 시작 칸 3x3: 해시(좌/중/우) x 깊이(우리 진영/하프라인/상대 진영). 다음 칸은 해시도 깊이도 모두 다른 4칸 중 하나.
export function nextCell(prev, rand = Math.random) {
  if (!prev) return { h: Math.floor(rand() * 3), d: Math.floor(rand() * 2) };
  const opts = [];
  for (let h = 0; h < 3; h += 1) for (let d = 0; d < 3; d += 1) if (h !== prev.h && d !== prev.d) opts.push({ h, d });
  return opts[Math.floor(rand() * opts.length)];
}

export class Attack {
  constructor(o = {}) {
    this.s = { ...DEFAULT_STATS, ...(o.stats ?? {}) };
    this.rand = o.rand ?? Math.random;
    this.easy = o.easy ?? 1; // 처음 3번의 내 공격은 창과 제한 시간 x1.5
    this.attackNo = o.attackNo ?? 0;
    this.fat = { MF: 0, WB: 0, WG: 0, ST: 0, ...(o.fatigue ?? {}) };
    this.cell = o.cell ?? nextCell(null, this.rand);
    this.listeners = [];
    this.t = 0; // 월드 시간
    this.rt = 0; // 실시간
    this.pt = 0; // 단계 월드 시간
    this.prt = 0; // 단계 실시간
    this.slow = 1; // 월드 속도 배율(정밀 슛, 헤더, 개인기 성공 같은 짧은 순간에만 1 미만)
    this.slowUntil = 0;
    this.phase = 'first';
    this.result = null;
    this.done = false;
    this.steerY = null;
    this.looseUsed = false;
    this.skill = { cd: 0, until: 0 };
    this.stats = { threats: 0, contacts: 0, nearMiss: 0, vignette: 0, runTime: 0, minGap: 9, looseTries: 0, skills: 0, taps: 0 };
    this.lastInputT = 0;
    this.log = [];
    this.build();
  }

  on(fn) { this.listeners.push(fn); }
  emit(name, data = {}) { this.log.push({ t: this.rt, name }); for (const fn of this.listeners) fn(name, data); }

  // ---------- 월드 만들기: 모든 선수는 여기서 한 번만 ----------
  build() {
    const { h, d } = this.cell; const r = this.rand;
    const sy = [96, GY, 282][h] + (r() - 0.5) * 30;
    const sx = [64, 112, 164][d] + (r() - 0.5) * 20; // 공격이 짧게 끝나지 않도록 시작 칸은 앞쪽 절반 안에 둔다(달리기 3.2초 이상 확보)
    this.players = [];
    this.byId = {};
    const add = (id, team, role, x, y, extra = {}) => { const p = { id, team, role, x, y, vx: 0, vy: 0, anim: 'idle', kick: 0, lay: 0, stun: 0, ...extra }; this.players.push(p); this.byId[id] = p; return p; };
    const sideY = sy < GY - 20 ? 62 : (sy > GY + 20 ? 316 : (r() < 0.5 ? 62 : 316));
    const wgY = sideY < GY ? 268 : 110;
    this.mf = add('MF', 'me', 'MF', sx, sy);
    this.wb = add('WB', 'me', 'WB', sx + 14, sideY, { vx: TUNE.candSpeed.WB });
    this.wg = add('WG', 'me', 'WG', sx + 36, wgY, { vx: TUNE.candSpeed.WG });
    this.st = add('ST', 'me', 'ST', sx + 170, GY + (r() - 0.5) * 70, { vx: TUNE.candSpeed.ST });
    add('GKm', 'me', 'GK', FIELD.x0 + 10, GY);
    [[120, 96], [96, 189], [120, 282]].forEach(([x, y], i) => add(`DF${i}`, 'me', 'DF', x, y));
    // 상대: 골키퍼 + 필드 10명(마커 3, 압박수 1, 나머지 6). 위협으로 쓰는 수비수는 모두 여기 있던 선수다.
    this.gk = add('GKo', 'opp', 'GK', GX - 10, GY);
    this.arrival = pressArrival(this.s.activity) * (this.easy > 1 ? 1.2 : 1);
    const pStart = { x: Math.max(FIELD.x0 + 20, sx - this.arrival * 38), y: clamp(sy + 12, 50, 330) };
    this.presser = add('P', 'opp', 'DF', pStart.x, pStart.y);
    this.pStart = pStart;
    this.cands = {};
    for (const role of ['WB', 'WG', 'ST']) {
      const me = this.byId[role];
      const w = openWindow(role, { arrival: this.arrival, vision: this.s.vision, oppDef: this.s.oppDef, easy: this.easy });
      const marker = add(`M${role}`, 'opp', 'DF', me.x - 6, me.y + (role === 'ST' ? 8 : 5), { vx: me.vx });
      this.cands[role] = { role, me, marker, ...w, state: 'closed' };
    }
    const spots = [[330, 80], [335, 189], [330, 300], [430, 120], [430, 258], [500, 80], [500, 189], [500, 300], [560, 130], [560, 250]];
    this.pool = [];
    let n = 0;
    for (const [x, y] of spots.sort(() => r() - 0.5)) { if (n >= 6) break; if (x > sx + 90) { this.pool.push(add(`O${n}`, 'opp', 'DF', x + (r() - 0.5) * 16, y + (r() - 0.5) * 16, { home: { x, y } })); n += 1; } }
    for (let i = n; i < 6; i += 1) this.pool.push(add(`O${i}`, 'opp', 'DF', 540 + (r() - 0.5) * 30, 60 + i * 45, { home: { x: 540, y: 60 + i * 45 } }));
    for (const p of this.pool) p.home ??= { x: p.x, y: p.y };
    this.ball = { state: 'held', holder: this.mf, x: sx, y: sy, z: 0, vx: 0, vy: 0, fx: 0, fy: 0, tx: 0, ty: 0, t: 0, dur: 0, arc: 0 };
    this.runner = null; this.shooter = null;
    this.threats = []; this.presserGap = 9; this.rangeT = 0; this.inRange = false; this.runClock = 0;
    this.aim = null; this.gauge = null; this.header = null;
    this.range = shotRange(this.s.shooting);
    this.runSpeed = runSpeedOf(this.s.speed);
  }

  // ---------- 단계 전환 ----------
  setPhase(ph) { this.phase = ph; this.pt = 0; this.prt = 0; this.emit('phase', { phase: ph }); }
  slowTo(k, dur) { this.slow = k; this.slowUntil = this.rt + dur; }
  toGoal(p) { return Math.hypot(GX - p.x, GY - p.y); }
  mulAt(p) { return rangeMul(this.toGoal(p), this.range); }

  // ---------- 입력 ----------
  // ev: {type:'tap', x, y} | {type:'flick', dx, dy} | {type:'steer', y|null} | {type:'aimPull', dx, dy} | {type:'aimRelease', dx, dy}
  input(ev) {
    if (this.done) return;
    if (ev.type === 'steer') { this.steerY = ev.y; return; }
    if (ev.type === 'aimPull') { if (this.phase === 'aim') this.aim.pull = { dx: ev.dx, dy: ev.dy }; return; }
    this.lastInputT = this.rt; this.stats.taps += 1;
    if (this.phase === 'first' && ev.type === 'tap') return this.tapFirst(ev);
    if (this.phase === 'aim' && ev.type === 'aimRelease') return this.releaseAim(ev);
    if (this.phase === 'loose' && ev.type === 'tap') return this.tapLoose();
    if (this.phase === 'run') return this.inputRun(ev);
    if ((this.phase === 'pow' || this.phase === 'dir' || this.phase === 'rebound') && ev.type === 'tap') return this.tapGauge();
    if (this.phase === 'header' && ev.type === 'tap') return this.tapHeader();
  }

  // ---------- 첫 패스: 열린 선수를 타이밍에 맞춰 탭 ----------
  candAt(x, y) {
    let best = null; let bd = 26;
    for (const c of Object.values(this.cands)) { const d = Math.hypot(c.me.x - x, c.me.y - y); if (d < bd) { bd = d; best = c; } }
    return best;
  }
  tapFirst(ev) {
    const c = this.candAt(ev.x, ev.y);
    if (!c) return;
    if (this.pt < c.open) return this.turnover('cut', { at: c });
    if (this.pt > c.close) return this.turnover('late', { at: c });
    this.emit('pass', { role: c.role });
    if (c.role === 'ST') return this.startAim(this.mf, c);
    this.lobTo(this.mf, c.me, TUNE.lobTime.low, 'pass', { role: c.role });
  }
  // 공을 건넨다: 받는 선수는 계속 달리고, 공은 그 선수가 갈 자리로 날아간다
  lobTo(from, to, dur, phase, extra = {}) {
    const lead = { x: to.x + to.vx * dur, y: to.y + to.vy * dur };
    Object.assign(this.ball, { state: 'flying', holder: null, fx: this.ball.x, fy: this.ball.y, tx: lead.x, ty: lead.y, t: 0, dur, arc: extra.loft ? 26 : 8 });
    this.flight = { to, ...extra };
    from.kick = 0.25;
    this.setPhase(phase);
  }

  // ---------- 새총 조준: 압박수만 0.35배로 느려지고 최대 2초 ----------
  startAim(holder, cand) {
    this.aim = { holder, cand, pull: null };
    this.setPhase('aim');
    this.emit('aimStart');
  }
  stLead(dur) { return { x: this.st.x + this.st.vx * dur, y: this.st.y + this.st.vy * dur }; }
  releaseAim(ev) {
    const { holder } = this.aim;
    const len = Math.hypot(ev.dx, ev.dy);
    if (len < TUNE.aimMinPull) return; // 너무 짧으면 취소: 계속 조준
    const loft = len < TUNE.aimLowPull;
    const dur = loft ? TUNE.lobTime.loft : TUNE.lobTime.low;
    const lead = this.stLead(dur);
    const want = Math.atan2(lead.y - holder.y, lead.x - holder.x);
    const got = Math.atan2(-ev.dy, -ev.dx);
    let err = Math.abs(want - got); if (err > Math.PI) err = 2 * Math.PI - err;
    const tol = (TUNE.aimAngle * (1 + this.s.pass / 40) * this.easy * Math.PI) / 180;
    const maxD = slingRange(this.s.pass, this.s.stamina, this.attackNo) * 620;
    const ok = err <= tol && dist(holder, lead) <= maxD;
    this.lastSling = { err, tol, d: dist(holder, lead), maxD, ok };
    this.emit('sling', { loft, ok });
    if (!ok) {
      const end = { x: holder.x + Math.cos(got) * Math.min(maxD, 200), y: clamp(holder.y + Math.sin(got) * Math.min(maxD, 200), FIELD.y0 + 8, FIELD.y1 - 8) };
      Object.assign(this.ball, { state: 'flying', holder: null, fx: this.ball.x, fy: this.ball.y, tx: end.x, ty: end.y, t: 0, dur, arc: loft ? 26 : 8 });
      this.flight = { fail: true };
      this.setPhase('lob');
      return;
    }
    this.lobTo(holder, this.st, dur, 'lob', { loft, st: true });
  }
  aimTimedOut() { return this.phase === 'aim' && this.prt >= TUNE.aimMax; }

  // ---------- 받은 뒤: 연속 달리기 ----------
  beginRun(r) {
    this.runner = r; this.shooter = r;
    for (const c of Object.values(this.cands)) { c.marker.home = { x: c.marker.x + 60, y: c.marker.y }; c.marker.state = 'idle'; this.pool.push(c.marker); }
    this.ball.state = 'held'; this.ball.holder = r;
    this.runClock = 0; this.rangeT = 0; this.inRange = false;
    r.runVx = Math.max(r.vx, 20);
    this.scheduleThreats();
    this.setPhase('run');
    this.runStartX = r.x;
  }
  scheduleThreats() {
    const r = this.runner;
    const tRange = Math.max(0, (GX - this.range - r.x) / this.runSpeed);
    const total = tRange + TUNE.rangeWindow * 0.6;
    const n = clamp(Math.floor((total - TUNE.threatFirst) / 0.9) + 1, 2, 6);
    const kinds = ['front', 'side', 'front', 'pair', 'side', 'front'];
    let t = TUNE.threatFirst;
    this.threats = [];
    for (let i = 0; i < n; i += 1) {
      this.threats.push({ kind: kinds[i % kinds.length], tc: t, state: 'wait', defs: [] });
      t += lerp(TUNE.threatGap[0], TUNE.threatGap[1], this.rand());
    }
    this.stats.threats = n;
  }
  inputRun(ev) {
    const r = this.runner;
    const inRange = this.inRange;
    if (ev.type === 'tap') {
      if (!inRange) return this.useSkill();
      if (r.role === 'WG') return this.startPrecise(r, { curl: true });
      return;
    }
    if (ev.type === 'flick' && inRange) {
      if (ev.dx > 0 && Math.abs(ev.dx) >= Math.abs(ev.dy)) { if (r.role === 'WG') this.instantShot(r, { curl: true }); return; }
      if (ev.dx < 0 && Math.abs(ev.dx) >= Math.abs(ev.dy)) this.startAim(r, this.cands.ST);
    }
  }
  useSkill() {
    if (this.skill.cd > 0) return;
    this.skill.cd = TUNE.skillCD; this.skill.until = this.runClock + TUNE.skillVoid; this.stats.skills += 1;
    this.runner.hesitate = TUNE.skillStall;
    this.emit('skill');
  }

  // ---------- 접촉: 루즈볼 1회 ----------
  contact(by) {
    this.stats.contacts += 1;
    if (by.threat) by.threat.contactClock = this.runClock;
    const r = this.runner;
    if (this.runClock < this.skill.until) { // 개인기: 접촉 한 번 무효
      this.skill.until = 0; by.stun = 0.6; by.state = 'done';
      this.slowTo(0.4, TUNE.skillSlow);
      this.emit('skillOK', { by }); return;
    }
    if (this.looseUsed) return this.turnover('tackle', { by });
    this.looseUsed = true; this.stats.looseTries += 1;
    by.stun = 0.5; by.state = 'done';
    Object.assign(this.ball, { state: 'loose', holder: null, vx: 70, vy: (this.rand() - 0.5) * 40, t: 0 });
    r.pause = 9;
    this.slow = TUNE.slowShot;
    this.setPhase('loose');
    this.emit('loose');
  }
  tapLoose() {
    const w = looseWindow(this.s.dribble, this.easy);
    if (Math.abs(this.prt - TUNE.looseTarget) <= w) {
      this.slow = 1;
      this.ball.state = 'held'; this.ball.holder = this.runner; this.runner.pause = TUNE.looseStop;
      for (const th of this.threats) if (th.state === 'warn' || th.state === 'windup') th.state = 'wait';
      this.presser.x = Math.max(FIELD.x0, this.runner.x - 40); // 압박수가 잠깐 밀린다
      this.emit('secured');
      this.setPhase('run');
    } else this.turnover('loose');
  }

  // ---------- 슛 ----------
  startPrecise(p, { curl = false, striker = false } = {}) {
    this.shooter = p;
    this.gauge = { curl, striker, stage: 'pow', power: 0, limit: shootTime(this.s.finishing, striker) * this.easy, mul: this.mulAt(p), farSide: p.y < GY ? 1 : -1 };
    this.slow = TUNE.slowShot;
    this.setPhase('pow');
    this.emit('preciseStart');
  }
  gaugeNow() { return gaugeAt(this.prt, TUNE.gaugeCycle * (this.gauge?.stage === 'dir' ? 0.9 : 1)); }
  tapGauge() {
    const g = this.gauge;
    if (this.phase === 'rebound') return this.fire(this.shooter, { power: 0.65, aim: aimOf(gaugeAt(this.prt, TUNE.gaugeCycle * 0.9)), rebound: true });
    if (this.phase === 'pow') { g.power = this.gaugeNow(); g.stage = 'dir'; this.setPhase('dir'); this.emit('tap'); return; }
    this.fire(this.shooter, { power: g.power, aim: aimOf(this.gaugeNow()) });
  }
  fire(p, { power, aim, rebound = false }) {
    const g = this.gauge ?? { curl: false, mul: this.mulAt(p), farSide: 1 };
    const out = resolveShot({ power, aim, shooting: this.s.shooting, curl: g.curl, farSide: g.farSide, mul: g.mul });
    this.shot(p, out, { rebound, aim });
  }
  instantShot(p, { curl = false } = {}) {
    const mul = this.mulAt(p);
    const goal = this.rand() < instantGoalProb(this.s.shooting, mul) * (curl ? 1 : 1);
    let out = 'goal';
    if (!goal) { const k = this.rand(); out = k < 0.55 ? 'save' : (k < 0.7 ? 'post' : 'miss'); }
    this.emit('instant');
    this.shot(p, out === 'post' ? 'miss' : out, { instant: true, aim: (this.rand() - 0.5) * 1.8 });
  }
  shot(p, out, { rebound = false, instant = false, aim = 0 } = {}) {
    this.shooter = p;
    p.kick = 0.3;
    this.slow = 1;
    const goalY = GY + clamp(aim, -1.2, 1.2) * 18;
    const end = out === 'goal' ? { x: GX + 6, y: goalY } : (out === 'save' ? { x: GX - 8, y: GY + aim * 8 } : (out === 'post' ? { x: GX, y: GY + (aim > 0 ? 20 : -20) } : { x: GX + 18, y: GY + (aim > 0 ? 44 : -44) }));
    Object.assign(this.ball, { state: 'flying', holder: null, fx: this.ball.x, fy: this.ball.y, tx: end.x, ty: end.y, t: 0, dur: TUNE.shotFlight, arc: out === 'miss' ? 14 : 6 });
    this.flight = { shot: out, rebound, instant };
    if (out === 'save' || out === 'post') this.gk.dive = aim >= 0 ? 1 : -1;
    this.setPhase('shotFlight');
    this.emit('kick', { out, instant });
  }
  startHeader() {
    this.shooter = this.st;
    this.header = { mul: this.mulAt(this.st), tapped: false };
    this.slow = TUNE.slowShot;
    this.setPhase('header');
    this.emit('headerStart');
  }
  tapHeader() {
    const e = Math.abs(this.prt - TUNE.headerPeak);
    const w = headerWindow(this.s.finishing, this.header.mul) * this.easy;
    this.slow = 1;
    let out;
    const k = this.rand();
    if (e <= w * TUNE.headerCenter) out = k < 0.75 ? 'goal' : (k < 0.9 ? 'save' : 'post');
    else if (e <= w) out = k < 0.25 ? 'goal' : (k < 0.85 ? 'save' : 'post');
    else out = 'miss';
    this.header.e = e; this.header.w = w;
    this.st.kick = 0.3;
    this.shot(this.st, out === 'post' ? 'post' : out, { aim: (this.rand() - 0.5) * 1.4 });
  }

  // ---------- 결과 ----------
  turnover(why, extra = {}) {
    if (this.result) return;
    this.slow = 1;
    if (why === 'tackle' || why === 'loose') {
      const r = this.runner;
      if (r) { r.lay = 1; r.pause = 9; r.vx = 0; r.vy = 0; }
      if (extra.by) extra.by.kick = 0.3;
      this.ball.state = 'loose'; this.ball.holder = null; this.ball.vx = -20; this.ball.vy = 0;
    }
    this.finish('turnover', why);
  }
  finish(kind, why) {
    if (this.result) return;
    this.slow = 1;
    this.result = { kind, why, t: 0, hold: kind === 'goal' ? TUNE.goalHold : TUNE.otherHold };
    this.setPhase('result');
    this.emit('result', { kind, why });
  }

  // ---------- 진행 ----------
  update(rawDt) {
    if (this.done) return;
    this.rt += rawDt; this.prt += rawDt;
    if (this.slow < 1 && this.slowUntil && this.rt >= this.slowUntil) { this.slow = 1; this.slowUntil = 0; }
    const dt = rawDt * this.slow;
    this.t += dt; this.pt += dt;
    if (this.skill.cd > 0) this.skill.cd -= rawDt;
    for (const p of this.players) { if (p.kick > 0) p.kick -= rawDt; if (p.stun > 0) p.stun -= dt; if (p.lay && p.lay < 1.4) p.lay += dt * 3; }
    this.updateBall(dt);
    switch (this.phase) {
      case 'first': this.updateFirst(dt); break;
      case 'pass': this.stepRunners(dt); this.ambient(dt); if (this.ball.t >= this.ball.dur) this.beginRun(this.flight.to); break;
      case 'aim': this.stepRunners(dt); this.coast(dt); this.updatePresser(dt, this.aimTimedOut() ? 1 : TUNE.aimSlow); this.ambient(dt); this.markers(dt); break;
      case 'lob': this.stepRunners(dt); this.updatePresser(dt, 1); this.ambient(dt); this.markers(dt); if (this.ball.t >= this.ball.dur) this.landLob(); break;
      case 'run': this.updateRun(dt); break;
      case 'loose': this.updateLoose(dt, rawDt); break;
      case 'pow': case 'dir': case 'rebound': this.updateShotGauge(dt, rawDt); break;
      case 'header': this.updateHeader(dt, rawDt); break;
      case 'shotFlight': this.ambient(dt); this.stepRunners(dt, true); if (this.ball.t >= this.ball.dur) this.landShot(); break;
      case 'result': this.updateResult(dt, rawDt); break;
      default: break;
    }
    for (const p of this.players) p.anim = Math.hypot(p.vx, p.vy) > 6 && !p.lay ? 'run' : 'idle';
    this.updateGap();
  }

  updateBall(dt) {
    const b = this.ball;
    if (b.state === 'held' && b.holder) { b.x = b.holder.x + 6; b.y = b.holder.y + 6; b.z = 0; }
    else if (b.state === 'flying') {
      b.t += dt; const k = clamp(b.t / b.dur, 0, 1);
      b.x = lerp(b.fx, b.tx, k); b.y = lerp(b.fy, b.ty, k); b.z = Math.sin(Math.PI * k) * b.arc;
    } else if (b.state === 'loose') {
      b.x += b.vx * dt; b.y += b.vy * dt; b.vx *= Math.exp(-dt * 2.5); b.vy *= Math.exp(-dt * 2.5); b.z = 0;
    }
  }
  // 후보와 달리는 선수는 단계가 바뀌어도 계속 달린다
  stepRunners(dt, hold = false) {
    for (const k of ['WB', 'WG', 'ST']) {
      const p = this.byId[k];
      if (p === this.runner && this.phase !== 'pass') continue;
      p.x = Math.min(p.x + p.vx * dt, k === 'ST' ? GX - 56 : GX - 90); p.y += p.vy * dt;
      if (p.x >= (k === 'ST' ? GX - 56 : GX - 90)) p.vx = Math.max(0, p.vx - 150 * dt);
    }
    void hold;
  }
  ambient(dt) {
    for (const p of this.pool) { if (p.state === 'idle' || !p.state || p.state === 'done') { p.state = p.stun > 0 ? 'done' : 'idle'; const hx = p.home.x - p.x; const hy = p.home.y - p.y; const d = Math.hypot(hx, hy) || 1; const v = Math.min(30, d * 2); if (p.stun <= 0 && d > 2) { p.vx = (hx / d) * v; p.vy = (hy / d) * v; } else { p.vx = 0; p.vy = 0; } p.x += p.vx * dt; p.y += p.vy * dt; } }
  }
  markers(dt) {
    const t = this.pt;
    for (const c of Object.values(this.cands)) {
      const rise = smooth((t - (c.open - 0.15)) / 0.15); const fall = smooth((t - c.close) / 0.15);
      const gap = 6 + 26 * rise - 26 * fall;
      c.gap = gap;
      c.marker.x = c.me.x - gap; c.marker.y = lerp(c.marker.y, c.me.y + 5, Math.min(1, dt * 6));
      c.marker.vx = c.me.vx;
    }
  }
  updateFirst(dt) {
    const t = this.pt;
    this.stepRunners(dt);
    this.markers(dt);
    this.ambient(dt);
    for (const c of Object.values(this.cands)) c.state = t < c.open - c.warn ? 'closed' : (t < c.open ? 'warn' : (t <= c.close ? 'open' : 'gone'));
    // 압박수: 직선으로 다가온다. 도달하면 턴오버.
    const k = clamp(t / this.arrival, 0, 1);
    this.presser.x = lerp(this.pStart.x, this.mf.x - 34, k); this.presser.y = lerp(this.pStart.y, this.mf.y + 6, k);
    this.presser.vx = (this.mf.x - 34 - this.pStart.x) / this.arrival; this.presser.vy = (this.mf.y + 6 - this.pStart.y) / this.arrival;
    this.presserGap = (this.arrival - t);
    if (k >= 1) this.turnover('pressed');
  }
  // 조준 중 달리던 선수는 관성으로 조금 더 간다
  coast(dt) {
    const r = this.runner;
    if (!r || this.aim.holder !== r) return;
    r.x += r.vx * dt; r.vx *= Math.exp(-dt * 1.5);
  }
  updatePresser(dt, scale) {
    const target = this.aim?.holder ?? this.runner ?? this.mf;
    const p = this.presser;
    const d = dist(p, target);
    let v = this.runSpeed * TUNE.pressMul * scale;
    if (this.phase === 'aim') v = Math.max(18, v);
    if (this.phase === 'lob') v = this.runSpeed * 0.6;
    if (d > 4) { p.vx = ((target.x - p.x) / d) * v; p.vy = ((target.y - p.y) / d) * v; p.x += p.vx * dt; p.y += p.vy * dt; }
    if (this.phase === 'aim' && dist(p, this.aim.holder) < TUNE.contactR) this.turnover('pressed');
  }
  landLob() {
    if (this.flight?.fail) return this.turnover('pass');
    const st = this.st;
    this.shooter = st; this.ball.state = 'held'; this.ball.holder = st; st.vx *= 0.3;
    this.looseUsed = true; // 스트라이커 마무리에서는 루즈볼 없음(받은 즉시 슛)
    if (this.flight.loft) this.startHeader(); else this.startPrecise(st, { striker: true });
  }

  // ---------- 달리기 ----------
  updateRun(dt) {
    const r = this.runner;
    this.runClock += dt; this.stats.runTime += dt;
    this.stepRunners(dt);
    this.ambient(dt);
    // 앞으로 자동, 옆은 손가락
    const speed = fatigue(this.runSpeed, { scene: this.attackNo, stamina: this.s.stamina, ranScenes: this.fat[r.role], c: r.role === 'WB' ? 2 : 1 });
    const mulGo = r.pause > 0 ? 0 : (r.hesitate > 0 ? 0.4 : 1); // 루즈볼 확보 직후 멈칫(0.3초), 개인기 직후 멈칫(0.15초)
    if (r.pause > 0) r.pause -= dt;
    if (r.hesitate > 0) r.hesitate -= dt;
    const aX = speed / TUNE.runAccel;
    const latMax = TUNE.runLat;
    const wantVy = this.steerY == null ? 0 : clamp((this.steerY - r.y) / 22, -1, 1) * latMax;
    const aY = latMax / TUNE.runAccel;
    r.vy += clamp(wantVy - r.vy, -aY * dt, aY * dt);
    // 전체 속도는 일정하다: 옆으로 틀수록 앞으로 가는 속도가 줄어 뒤 추격이 따라붙는다
    const wantVx = Math.min(speed * mulGo, Math.sqrt(Math.max(0, speed * speed - (TUNE.latCost * r.vy) ** 2)));
    r.vx += clamp(wantVx - r.vx, -aX * dt, aX * dt);
    r.x += r.vx * dt; r.y = clamp(r.y + r.vy * dt, FIELD.y0 + 12, FIELD.y1 - 12);
    if (r.y <= FIELD.y0 + 12 || r.y >= FIELD.y1 - 12) r.vy = 0;
    // 사거리
    const toGoalX = GX - r.x;
    if (!this.inRange && this.toGoal(r) <= this.range) { this.inRange = true; this.rangeT = 0; this.emit('inRange'); }
    if (this.inRange) { this.rangeT += dt; if (this.rangeT > TUNE.rangeWindow || toGoalX < 18) return this.turnover('noShot'); }
    if (!this.inRange && toGoalX < 8) return this.turnover('noRange'); // 사거리에 못 들어간 채 골라인까지 달려 버렸다
    this.updateThreats(dt);
    this.updatePresserRun(dt);
  }
  pickDefender(amb, avoid) {
    let best = null; let bd = 1e9;
    for (const p of this.pool) {
      if (p.state === 'warn' || p.state === 'windup' || p.state === 'lunge' || p.stun > 0 || avoid.includes(p)) continue;
      if (p.x < this.runner.x - 6) continue;
      const d = Math.hypot(p.x - amb.x, p.y - amb.y);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }
  updateThreats(dt) {
    const r = this.runner; const c = this.runClock;
    for (const th of this.threats) {
      if (th.state === 'wait' && c >= th.tc - TUNE.warnLead - 0.04) {
        th.state = 'warn'; th.warnClock = c;
        const P = { x: r.x + r.vx * (th.tc - c), y: r.y + r.vy * (th.tc - c) };
        th.P = P; th.eta = th.tc;
        const side = r.y < GY ? -1 : 1;
        const kinds = th.kind === 'pair' ? ['front', 'side'] : [th.kind];
        for (const kd of kinds) {
          const vd = this.runSpeed * lerp(TUNE.defSpeedMul[0], TUNE.defSpeedMul[1], this.rand());
          const amb = kd === 'front' ? { x: P.x + vd * 0.4, y: clamp(P.y + (this.rand() - 0.5) * 24, FIELD.y0 + 12, FIELD.y1 - 12) } : { x: P.x + 10, y: clamp(P.y + side * (vd * 0.4 + 12), FIELD.y0 + 12, FIELD.y1 - 12) };
          const d = this.pickDefender(amb, th.defs.map((q) => q.p));
          if (!d) continue;
          th.defs.push({ p: d, amb, vd, kind: kd });
          d.state = 'warn'; d.threat = th;
        }
        if (!th.defs.length) { th.state = 'done'; continue; }
        this.emit('warn', { th });
      }
      if (th.state === 'warn' || th.state === 'windup' || th.state === 'lunge') {
        let alive = false;
        for (const q of th.defs) {
          const d = q.p;
          if (d.stun > 0) continue;
          if (th.state !== 'lunge') {
            const dx = q.amb.x - d.x; const dy = q.amb.y - d.y; const dd = Math.hypot(dx, dy);
            const v = Math.min(120, dd / 0.7);
            if (dd > 2) { d.vx = (dx / dd) * v; d.vy = (dy / dd) * v; d.x += d.vx * dt; d.y += d.vy * dt; } else { d.vx = 0; d.vy = 0; }
            alive = true;
          }
        }
        if (th.state === 'warn' && c >= th.tc - TUNE.windup) { th.state = 'windup'; for (const q of th.defs) { q.p.vx = 0; q.p.vy = 0; q.p.state = 'windup'; } }
        if (th.state === 'windup' && c >= th.tc) { th.state = 'lunge'; th.t0 = c; for (const q of th.defs) q.p.state = 'lunge'; }
        if (th.state === 'lunge') {
          let any = false;
          for (const q of th.defs) {
            const d = q.p;
            if (d.stun > 0 || d.state === 'done') continue;
            const dd = dist(d, r);
            const tl = clamp(dd / q.vd, 0.2, 1.2);
            const tx = r.x + r.vx * tl; const ty = r.y + r.vy * tl;
            const ex = tx - d.x; const ey = ty - d.y; const el = Math.hypot(ex, ey) || 1;
            d.vx = (ex / el) * q.vd; d.vy = (ey / el) * q.vd;
            d.x += d.vx * dt; d.y += d.vy * dt;
            q.min = Math.min(q.min ?? 99, dd);
            if (dd < TUNE.contactR) { this.contact(d); th.state = 'done'; any = false; break; }
            if (q.min < TUNE.nearMiss && dd > q.min + 3 && !q.near) { q.near = true; this.stats.nearMiss += 1; this.emit('nearMiss'); }
            any = true;
          }
          if (th.state === 'lunge' && (!any || c - th.t0 > TUNE.lungeMax)) th.state = 'done';
          if (this.phase !== 'run') return;
        }
        void alive;
      }
      if (th.state === 'done') for (const q of th.defs) { if (q.p.state !== 'idle') q.p.state = 'done'; }
    }
  }
  updatePresserRun(dt) {
    const r = this.runner; const p = this.presser;
    const d = dist(p, r);
    const gap = Math.max(0, d - TUNE.contactR) / this.runSpeed; // 가장자리 기준 간격(초)
    let v = this.runSpeed * TUNE.pressMul;
    if (gap > TUNE.pressGap0) v *= TUNE.pressCatchUp; // 처음에는 0.34초 간격까지 따라붙는다
    p.vx = ((r.x - p.x) / (d || 1)) * v; p.vy = ((r.y - p.y) / (d || 1)) * v;
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (d < TUNE.contactR && this.runClock > 0.6) this.contact(p);
  }
  updateGap() {
    const r = this.runner;
    if (!r || this.phase !== 'run') { this.presserGap = this.phase === 'first' ? this.presserGap : this.presserGap; return; }
    this.presserGap = Math.max(0, dist(this.presser, r) - TUNE.contactR) / this.runSpeed;
    if (this.runClock > 0.8) {
      this.stats.minGap = Math.min(this.stats.minGap, this.presserGap);
      if (this.presserGap <= TUNE.vignetteGap) this.stats.vignette += 1;
    }
  }
  updateLoose(dt, rawDt) {
    this.ambient(dt);
    this.stepRunners(dt);
    if (this.prt >= TUNE.looseTime) this.turnover('loose');
    void rawDt;
  }

  // ---------- 슛 게이지와 헤더(실시간) ----------
  updateShotGauge(dt, rawDt) {
    this.ambient(dt); this.stepRunners(dt);
    if (this.phase === 'rebound') { if (this.prt > 2.5) this.finish('miss', 'rebound'); return; }
    const g = this.gauge;
    g.t = (g.t ?? 0) + rawDt;
    // 슬로우 중에도 수비수가 다가온다. 슈터에게 닿으면 막힌다.
    if (this.phase !== 'rebound') {
      const sh = this.shooter;
      const def = this.presser; const dd = dist(def, sh);
      if (sh === this.runner) { const v = this.runSpeed * TUNE.pressMul * 0.15; def.x += ((sh.x - def.x) / (dd || 1)) * v * dt; def.y += ((sh.y - def.y) / (dd || 1)) * v * dt; if (dd < TUNE.contactR) return this.turnover('blocked'); }
    }
    if (g.t >= g.limit) this.turnover('shotTimeout');
  }
  updateHeader(dt, rawDt) {
    this.ambient(dt); this.stepRunners(dt);
    if (this.prt >= TUNE.headerTime) { this.slow = 1; this.shot(this.st, 'miss', { aim: 1.5 }); }
    void rawDt;
  }
  landShot() {
    const f = this.flight; const out = f.shot;
    if (out === 'goal') return this.finish('goal', f.instant ? 'instant' : 'shot');
    if (out === 'post' && !f.rebound) {
      this.ball.state = 'loose'; this.ball.vx = -50; this.ball.vy = (this.rand() - 0.5) * 60; this.ball.x = GX - 6;
      this.gauge = { curl: false, mul: this.mulAt(this.shooter), farSide: 1, shooterId: this.shooter.id };
      this.setPhase('rebound'); this.slow = TUNE.slowShot; this.emit('rebound'); return;
    }
    return this.finish(out === 'save' ? 'save' : (out === 'post' ? 'post' : 'miss'), out);
  }
  updateResult(dt, rawDt) {
    this.ambient(dt); this.stepRunners(dt);
    this.result.t += rawDt;
    // 결과 중에도 월드는 움직인다(상대는 느슨히 걷고, 달리던 선수는 감속)
    for (const p of this.players) { if (p.team === 'me' && p.vx > 0) p.vx *= Math.exp(-dt * 3); }
    if (this.runner && !this.runner.lay) { this.runner.x += this.runner.vx * dt; }
    if (this.result.t >= this.result.hold) { this.done = true; this.emit('done'); }
  }
}

// ---------- 카메라 규칙(하나): 공과 조종 선수, 눈여겨볼 위협/후보를 담고 진행 방향으로 앞서 본다. 줌은 연속으로 변한다 ----------
export function cameraPlan(A) {
  const pts = [{ x: A.ball.x, y: A.ball.y }];
  const focus = A.phase === 'first' ? A.mf : (A.runner ?? A.shooter ?? A.mf);
  pts.push({ x: focus.x, y: focus.y });
  if (A.phase === 'first') { for (const c of Object.values(A.cands)) if (c.state !== 'closed' && c.state !== 'gone') pts.push({ x: c.me.x, y: c.me.y }); pts.push({ x: A.presser.x, y: A.presser.y }); }
  if (A.phase === 'aim') { pts.push({ x: A.st.x, y: A.st.y }); pts.push({ x: A.presser.x, y: A.presser.y }); }
  if (A.phase === 'lob' || A.phase === 'pow' || A.phase === 'dir' || A.phase === 'header' || A.phase === 'shotFlight' || A.phase === 'rebound') { pts.push({ x: A.shooter?.x ?? A.st.x, y: A.shooter?.y ?? A.st.y }); pts.push({ x: GX - 20, y: GY }); }
  if (A.phase === 'run') for (const th of A.threats) if (th.state === 'warn' || th.state === 'windup' || th.state === 'lunge') for (const q of th.defs) pts.push({ x: q.p.x, y: q.p.y });
  if (A.phase === 'result' && A.result.kind === 'goal') pts.push({ x: GX - 20, y: GY });
  const vx = focus.vx ?? 0;
  return { pts, lead: { x: vx * 0.35, y: (focus.vy ?? 0) * 0.2 } };
}

// 카메라 목표(하나의 규칙): 눈여겨볼 점을 담고 진행 방향으로 앞서 본다. 줌 최소값은 조종 선수의 속도에 연속으로 비례한다.
export function cameraTarget(A, W = 640, H = 360) {
  const { pts, lead } = cameraPlan(A);
  const xs = pts.map((q) => q.x); const ys = pts.map((q) => q.y);
  const margin = 56;
  const x0 = Math.min(...xs) - margin; const x1 = Math.max(...xs) + margin; const y0 = Math.min(...ys) - margin; const y1 = Math.max(...ys) + margin;
  const focus = A.phase === 'first' ? A.mf : (A.runner ?? A.shooter ?? A.mf);
  const zMin = 1.2 + 0.5 * clamp(Math.abs(focus.vx ?? 0) / A.runSpeed, 0, 1);
  const z = clamp(Math.min(W / (x1 - x0), (H - 70) / (y1 - y0)), zMin, 1.8);
  const x = clamp((x0 + x1) / 2 + lead.x, W / (2 * z), W - W / (2 * z));
  const y = clamp((y0 + y1) / 2 + lead.y - 6, H / (2 * z), H - H / (2 * z));
  return { x, y, z };
}
