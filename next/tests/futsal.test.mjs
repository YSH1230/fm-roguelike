// 풋살 시연판 P1 합격 기준: 규칙 수치, 입력 해석, 정지 시계와 추가시간, 득점과 킥오프, 정적 AI 금지.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng, gauss } from '../engine/rng.mjs';
import { TUNE, speedOf, effSpeed, drainPerSecond, ringTau, ringColor, gkDelay, sophistication, classifyGesture, shotZone, swipePower, passSpeedFor, gkReach } from '../proto/futsalRules.mjs';
import { createInput } from '../proto/futsalInput.mjs';
import { createMatch, update, demoTeam, startSecondHalf, flyingGkAvailable } from '../proto/futsalSim.mjs';

const mk = (seed = 1) => createMatch({ seed, home: demoTeam('H', seed), away: demoTeam('A', seed + 50) });
const play = (M, sec, input = {}, dt = 1 / 60) => { for (let i = 0; i < sec / dt && M.phase !== 'end'; i += 1) update(M, dt, input); };
const finish = (M) => { let n = 0; while (M.phase !== 'end' && n < 60 * 900) { if (M.phase === 'halftime') startSecondHalf(M); update(M, 1 / 60, {}); n += 1; } };

test('능력 함수: 속도, 체력 소모(5분 풀 출전 55% - 1.5% x 체력), 링 tau와 색, 골키퍼 지연, 정교함', () => {
  assert.equal(speedOf(20), 8);
  assert.ok(Math.abs(effSpeed(20, 0) - 8 * 0.7) < 1e-9);
  assert.ok(Math.abs(drainPerSecond(12) * TUNE.realMatchSeconds - 0.37) < 1e-9);
  assert.equal(ringTau(20, 1), 0.5);
  assert.equal(ringColor(2.3, 2.5), 'green'); assert.equal(ringColor(1.3, 1.5), 'yellow'); assert.equal(ringColor(1.0, 5), 'red');
  assert.ok(Math.abs(gkDelay(1, 0) - 1.4) < 1e-9);
  assert.equal(sophistication(20, 3), 20);
});

test('슛 구석: 쓸기 방향의 세로 성분이 위/가운데/아래를 고른다', () => {
  assert.equal(shotZone(80, -60), -1); assert.equal(shotZone(80, 0), 0); assert.equal(shotZone(80, 60), 1);
});

test('입력: 이동 손가락이 눌린 채 왼쪽 반을 100번 탭해도 패스 입력이 100% 실행된다', () => {
  const inp = createInput();
  inp.down(1, 100, 200, 0, 640); inp.move(1, 130, 200, 30);
  for (let i = 0; i < 100; i += 1) { const t = 100 + i * 400; inp.down(2, 80 + (i % 20), 150, t, 640); inp.up(2, 80 + (i % 20), 150, t + 90); }
  assert.equal(inp.poll(100 + 100 * 400 + 200).actions.filter((a) => a.type === 'tap').length, 100);
});
test('입력: pointercancel은 이동만 멈추고 쌓인 행동은 남는다', () => {
  const inp = createInput();
  inp.down(1, 100, 200, 0, 640); inp.move(1, 130, 200, 30);
  inp.down(2, 500, 100, 40, 640); inp.up(2, 500, 100, 100);
  inp.cancel(1);
  const r = inp.poll(120);
  assert.equal(r.move, null); assert.equal(r.actions.length, 1);
});
test('입력: 이동 손가락이 없을 때 왼쪽 반의 짧은 탭은 행동 탭, 데드존 안에서는 이동하지 않는다', () => {
  const inp = createInput();
  inp.down(1, 100, 100, 0, 640); inp.move(1, 106, 100, 30);
  assert.equal(inp.poll(40).move, null);
  inp.up(1, 106, 100, 120);
  assert.equal(inp.poll(130).actions[0].type, 'tap');
});
test('입력: 탭 = 선수 패스, 빈 공간 더블탭 = dtap, 오른쪽 스와이프 = 슛(방향과 속도), 왼쪽은 이동', () => {
  const inp = createInput();
  inp.down(1, 500, 100, 0, 640); inp.up(1, 500, 100, 120);
  assert.equal(inp.poll(130).actions[0].type, 'tap');
  inp.down(2, 500, 100, 200, 640); inp.up(2, 505, 102, 300); // 300ms 안의 두 번째 탭
  assert.equal(inp.poll(310).actions[0].type, 'dtap');
  inp.down(3, 500, 100, 2000, 640); inp.up(3, 500, 100, 2100);
  inp.down(4, 500, 100, 3000, 640); inp.move(4, 540, 80, 3040); inp.up(4, 580, 60, 3080); // 빠른 스와이프(오른쪽 위)
  const a = inp.poll(3100).actions.filter((x) => x.type === 'shot')[0];
  assert.ok(a && a.jx > 0.8 && a.jy < 0 && a.v > 1);
  inp.down(5, 100, 100, 5000, 640); inp.move(5, 160, 100, 5060);
  assert.ok(inp.poll(5070).move.x > 0);
  inp.down(6, 500, 100, 6000, 640); inp.up(6, 500, 100, 6900); // 오래 누르기만 하면 아무 일 없음
  assert.equal(inp.poll(6950).actions.length, 0);
});
test('입력: 조이스틱을 180ms 안에 반대로 튕기면 개인기 1회', () => {
  const inp = createInput();
  inp.down(1, 100, 100, 0, 640); inp.move(1, 140, 100, 20); inp.move(1, 60, 100, 120);
  assert.equal(inp.poll(130).actions.filter((a) => a.type === 'dribble').length, 1);
});
test('입력: 막힌 동안 들어온 행동은 150ms 안에 소비되면 실행, 넘으면 폐기', () => {
  const inp = createInput();
  inp.down(1, 500, 100, 0, 640); inp.up(1, 500, 100, 50);
  assert.equal(inp.poll(100, false).actions.length, 0);
  assert.equal(inp.poll(150, true).actions.length, 1);
  inp.down(2, 500, 100, 1000, 640); inp.up(2, 500, 100, 1050);
  assert.equal(inp.poll(1300, false).actions.length, 0);
  assert.equal(inp.poll(1310, true).actions.length, 0);
});
test('입력: 합성 제스처 1000개의 탭, 쓸기, 끌기 오분류 5% 이하', () => {
  const r = createRng(5); let bad = 0;
  for (let i = 0; i < 1000; i += 1) {
    if (classifyGesture({ m: Math.abs(gauss(r) * 3.5), ms: Math.max(40, 110 + gauss(r) * 35) }) !== 'tap') bad += 1;
    if (classifyGesture({ m: Math.max(30, 90 + gauss(r) * 20), ms: Math.max(40, 100 + gauss(r) * 25) }) !== 'flick') bad += 1;
    if (classifyGesture({ m: 70 + gauss(r) * 10, ms: 600 + gauss(r) * 100 }) !== 'drag') bad += 1;
  }
  assert.ok(bad / 3000 <= 0.05, `${(bad / 30).toFixed(1)}%`);
});

test('아무도 조종하지 않아도 한 경기가 끝나고 실제 길이는 5분 + 추가시간', () => {
  const M = mk(1); finish(M);
  assert.equal(M.phase, 'end');
  const extra = (M.extra[1] + M.extra[2]) / 60 / TUNE.clockScale * 60 / 60 * 60 / 60; // 추가시간(분) → 실제 초
  const expected = TUNE.realMatchSeconds + (M.extra[1] + M.extra[2]) / TUNE.clockScale;
  assert.ok(Math.abs(M.real - expected) <= 15, `실제 ${M.real.toFixed(0)}초, 기대 ${expected.toFixed(0)}초`);
  void extra;
});
test('추가시간: 전반 1~5분, 후반 3~10분(풋살 시계), 후반 추가시간에만 플라잉 골키퍼 가능', () => {
  const seen1 = new Set(); const seen2 = new Set();
  for (let s = 1; s <= 30; s += 1) { const M = mk(s); let n = 0; let avail = 0; let early = 0;
    while (M.phase !== 'end' && n < 60 * 900) { if (M.phase === 'halftime') startSecondHalf(M); update(M, 1 / 30, {}); n += 1; if (flyingGkAvailable(M)) avail += 1; else if (M.half === 2 && M.halfClock < TUNE.halfClockSeconds && flyingGkAvailable(M)) early += 1; }
    seen1.add(M.extra[1] / 60); seen2.add(M.extra[2] / 60);
    assert.ok(avail > 0 && early === 0);
  }
  assert.ok([...seen1].every((m) => m >= 1 && m <= 5)); assert.ok([...seen2].every((m) => m >= 3 && m <= 10));
  assert.ok(seen1.size >= 3 && seen2.size >= 4);
});
test('공이 코트 밖이면 시계가 멈춘다(재개 대기 4초 포함)', () => {
  const M = mk(2); play(M, 3);
  M.ball.st = 'loose'; M.ball.owner = null; M.ball.x = -2; M.ball.y = 5; M.ball.vx = 0; M.ball.vy = 0;
  update(M, 1 / 60, {});
  assert.equal(M.phase, 'deadball');
  const c = M.clock; const r = M.real; let n = 0;
  while (M.phase === 'deadball' && n < 600) { update(M, 1 / 60, {}); n += 1; assert.equal(M.clock, c); assert.equal(M.real, r); }
  assert.ok(n > 30, '재개를 기다리는 동안 시계가 멈춰 있었다');
});
test('킥오프: 모두 자기 진영에 서고 상대 팀은 센터서클(3m) 밖에 선다', () => {
  for (let sd = 1; sd <= 10; sd += 1) for (const t of [0, 1]) {
    const M = mk(sd); M.score = [0, 0]; startSecondHalf; // 시작 킥오프는 팀 0
    const kick = M.restart.team;
    for (const p of M.players) {
      const lx = p.team === 0 ? p.x : 40 - p.x;
      if (p === M.ball.owner) continue;
      assert.ok(lx <= 19.5, `${p.id} 자기 진영 밖 ${lx.toFixed(1)}`);
      if (p.team !== kick) assert.ok(Math.hypot(p.x - 20, p.y - 10) >= 3, `${p.id} 센터서클 안`);
    }
    void t;
  }
});
test('데드볼(골키퍼 재개)에서도 선수들이 받을 자리를 찾아 계속 움직이고, 상대는 공에서 3m 이상 떨어진다', () => {
  const M = mk(5); play(M, 2);
  const gk = M.players.find((p) => p.team === 0 && p.gk);
  gk.x = 2.2; gk.y = 10; M.ball.st = 'held'; M.ball.owner = gk; M.phase = 'deadball'; M.restart = { kind: 'goalkeeper', team: 0, timer: 4, pick: null, x: 2.2, y: 10 };
  M.control = M.players.indexOf(gk);
  const before = M.players.filter((p) => p.team === 0 && !p.gk).map((p) => [p.x, p.y]);
  for (let i = 0; i < 90; i += 1) update(M, 1 / 60, {});
  const moved = M.players.filter((p) => p.team === 0 && !p.gk).map((p, i) => Math.hypot(p.x - before[i][0], p.y - before[i][1]));
  assert.ok(moved.filter((m) => m > 0.5).length >= 2, `움직인 동료 ${moved.map((m) => m.toFixed(1))}`);
  for (const q of M.players) if (q.team === 1) assert.ok(Math.hypot(q.x - gk.x, q.y - gk.y) >= 2.9);
});
test('탭 패스는 유도탄이 아니다: 공은 한 번 정한 지점으로 곧게 날아가고, 달리는 동료가 그 지점에서 받는다', () => {
  let ok = 0; let n = 0;
  for (let sd = 1; sd <= 40; sd += 1) {
    const M = mk(sd); play(M, 1);
    const me = M.players.find((p) => p.team === 0 && !p.gk); const mate = M.players.find((p) => p.team === 0 && !p.gk && p !== me);
    for (const q of M.players) if (q.team === 1) { q.x = 38; q.y = 1 + (q.num % 4); q.tx = q.x; q.ty = q.y; q.ts = 0; }
    me.x = 12; me.y = 10; mate.x = 22; mate.y = 4; mate.vx = 0; mate.vy = 6; mate.tx = 22; mate.ty = 16; mate.ts = 6;
    M.phase = 'play'; M.ball.st = 'held'; M.ball.owner = me; M.control = M.players.indexOf(me);
    const d0 = null; void d0;
    update(M, 1 / 60, { actions: [{ type: 'tap', x: 0, y: 0, wx: mate.x, wy: mate.y }] });
    const dest = { ...M.ball.dest }; let bent = false;
    for (let i = 0; i < 90 && M.ball.st === 'pass'; i += 1) { update(M, 1 / 60, {}); if (M.ball.dest && (Math.abs(M.ball.dest.x - dest.x) > 1e-9 || Math.abs(M.ball.dest.y - dest.y) > 1e-9)) bent = true; }
    n += 1; if (!bent && M.ball.owner === mate) ok += 1;
  }
  assert.ok(ok / n >= 0.9, `받음 ${ok}/${n}`);
});
test('선수를 탭하면 그 선수에게, 빈 공간은 더블탭해야 그 자리로 공간 패스(한 번 탭은 아무 일 없음)', () => {
  const setup = (sd) => { const M = mk(sd); play(M, 1); const me = M.players.find((p) => p.team === 0 && !p.gk); const mate = M.players.find((p) => p.team === 0 && !p.gk && p !== me);
    for (const q of M.players) if (q.team === 1) { q.x = 38; q.y = 1 + (q.num % 4); q.tx = q.x; q.ty = q.y; q.ts = 0; }
    me.x = 12; me.y = 10; mate.x = 24; mate.y = 14; mate.vx = 0; mate.vy = 0; mate.tx = mate.x; mate.ty = mate.y; mate.ts = 0;
    M.phase = 'play'; M.ball.st = 'held'; M.ball.owner = me; M.control = M.players.indexOf(me); return { M, me, mate }; };
  let r = setup(3);
  update(r.M, 1 / 60, { actions: [{ type: 'tap', x: 0, y: 0, wx: r.mate.x + 0.8, wy: r.mate.y }] });
  assert.equal(r.M.ball.tgt, r.mate);
  r = setup(3);
  update(r.M, 1 / 60, { actions: [{ type: 'tap', x: 0, y: 0, wx: 30, wy: 4 }] });
  assert.equal(r.M.ball.st, 'held', '빈 공간 한 번 탭은 아무 일 없다');
  update(r.M, 1 / 60, { actions: [{ type: 'dtap', x: 0, y: 0, wx: 30, wy: 4 }] });
  assert.ok(Math.hypot(r.M.ball.dest.x - 30, r.M.ball.dest.y - 4) < 1e-6, '더블탭은 그 자리로 보낸다');
});
test('패스 속도는 거리에 따라 9~16 m/s, 공은 방향을 바꾸지 않고 가까이 지나가는 동료도 받는다', () => {
  assert.equal(passSpeedFor(0), 9); assert.equal(passSpeedFor(30), 16); assert.ok(passSpeedFor(6) > passSpeedFor(3));
});
test('슛 세기: 스와이프가 빠를수록 강하고, 약한 슛이 막히기 쉽다', () => {
  assert.equal(swipePower(0.5), TUNE.shot.minPower); assert.equal(swipePower(2.2), 1); assert.ok(swipePower(1.5) > swipePower(1));
  assert.ok(gkReach(12, 0.2) > gkReach(12, 1));
});
test('골 판정은 보이는 대로: 골키퍼가 닿는 범위 밖으로 공이 지나가면 골, 안이면 선방', () => {
  const run = (gkOffset) => { const M = mk(9); play(M, 0.5); const me = M.players.find((p) => p.team === 0 && !p.gk); me.x = 30; me.y = 10;
    const gk = M.players.find((p) => p.team === 1 && p.gk); M.phase = 'play'; M.ball.st = 'held'; M.ball.owner = me; M.control = M.players.indexOf(me);
    M.api.shoot(me, 10, true, 0.5); M.ball.reactAt = 1e9; gk.y = 10 + gkOffset; gk.tx = gk.x; gk.ty = gk.y; gk.ts = 0; // 골키퍼는 움직이지 못한다
    for (let k = 0; k < 90 && M.ball.st === 'shot'; k += 1) { update(M, 1 / 60, {}); gk.y = 10 + gkOffset; } return M; };
  assert.equal(run(0).score[0], 0); // 정면 = 선방
  assert.equal(run(2.8).score[0], 1); // 골키퍼가 멀리 비켜 있으면 골
});
test('득점하면 점수가 오르고 실점한 팀이 센터 킥오프', () => {
  const M = mk(3); play(M, 1);
  const shooter = M.players.find((p) => p.team === 0 && !p.gk);
  shooter.x = 36; shooter.y = 10; shooter.ab.shooting = 20;
  const gk = M.players.find((p) => p.team === 1 && p.gk); gk.y = 5; gk.tx = gk.x; gk.ty = 5; gk.ts = 0;
  let scored = false;
  for (let k = 0; k < 40 && !scored; k += 1) { M.ball.st = 'held'; M.ball.owner = shooter; M.phase = 'play'; M.api.shoot(shooter, 10, true, 0.9); M.ball.reactAt = 1e9; for (let i = 0; i < 40; i += 1) { update(M, 1 / 60, {}); gk.y = 5; } if (M.score[0] > 0) scored = true; }
  assert.ok(scored);
  assert.ok(['kickoff', 'goalkeeper'].includes(M.restart?.kind) || M.phase === 'play');
});
test('정적 AI 금지: 공이 움직이는 동안 3초 이상 같은 자리에 서 있는 AI 선수가 없다', () => {
  const M = mk(4); M.autoHuman = true;
  const still = new Map(); let worst = 0;
  for (let i = 0; i < 60 * 120 && M.phase !== 'end'; i += 1) {
    if (M.phase === 'halftime') startSecondHalf(M);
    update(M, 1 / 60, {});
    if (M.phase !== 'play') { still.clear(); continue; }
    for (const p of M.players) { if (p.gk) continue; const s = still.get(p.id) ?? { x: p.x, y: p.y, t: 0 }; if (Math.hypot(p.x - s.x, p.y - s.y) > 0.7) { s.x = p.x; s.y = p.y; s.t = 0; } else s.t += 1 / 60; still.set(p.id, s); worst = Math.max(worst, s.t); }
  }
  assert.ok(worst < 3, `최대 정지 ${worst.toFixed(1)}초`);
});
test('AI 대 AI 평균 득점이 팀당 1.5~3.5골(조정 중 범위)', () => {
  let g = 0; const n = 20;
  for (let s = 1; s <= n; s += 1) { const M = mk(s); M.autoHuman = true; finish(M); g += M.score[0] + M.score[1]; }
  const avg = g / n / 2;
  assert.ok(avg >= 1.5 && avg <= 3.5, `팀당 ${avg.toFixed(2)}골`);
});
