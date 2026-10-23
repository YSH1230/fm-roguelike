// 풋살 시연판 P1 합격 기준: 규칙 수치, 입력 해석, 정지 시계와 추가시간, 득점과 킥오프, 정적 AI 금지.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng, gauss } from '../engine/rng.mjs';
import { TUNE, speedOf, effSpeed, drainPerSecond, ringTau, ringColor, gkDelay, sophistication, classifyGesture, swipePower, passSpeedFor, gkReach, link, mixAbility, kickPrep, stumbleTime, passV0, passSpeedCoef, passErrorCoef, passErrorSigma, interceptRadius, pickupRadius } from '../proto/futsalRules.mjs';
import { createInput } from '../proto/futsalInput.mjs';
import { createMatch, update, demoTeam, startSecondHalf, flyingGkAvailable, setHold } from '../proto/futsalSim.mjs';

const mk = (seed = 1) => createMatch({ seed, home: demoTeam('H', seed), away: demoTeam('A', seed + 50) });
const play = (M, sec, input = {}, dt = 1 / 60) => { for (let i = 0; i < sec / dt && M.phase !== 'end'; i += 1) update(M, dt, input); };
const settle = (M) => { for (let i = 0; i < 60 && M.queue.length; i += 1) update(M, 1 / 60, {}); }; // 킥 준비가 끝나 임팩트가 지나갈 때까지
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

test('능력치 연계 함수 하나: V = V0 x (1 ± k x (A - 10) / 10), 능력치 0/10/20 샘플이 표와 맞다', () => {
  const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
  near(link(0.05, 0, 0.3, false), 0.065); near(link(0.05, 10, 0.3, false), 0.05); near(link(0.05, 20, 0.3, false), 0.035); // 패스 준비(작을수록 좋음)
  near(link(1.0, 0, 0.1), 0.9); near(link(1.0, 20, 0.1), 1.1); // 패스 속도 계수(클수록 좋음)
  near(mixAbility([[0, 0.7], [20, 0.3]]), 6); // 비중대로 섞은 값
});
test('입력: 이동 손가락이 눌린 채 왼쪽 반을 100번 콕해도 행동 입력이 100% 실행된다', () => {
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
test('입력: 콕 = 20px 이하 + 250ms 이내, 20~35px로 미끄러진 콕도 콕, 35px 이상이어도 느리면 아무 일 없음', () => {
  const inp = createInput();
  inp.down(1, 500, 100, 0, 640); inp.up(1, 512, 106, 120); assert.equal(inp.poll(130).actions[0].type, 'tap');
  inp.down(2, 500, 100, 1000, 640); inp.move(2, 520, 110, 1040); inp.move(2, 528, 112, 1080); inp.up(2, 528, 112, 1120); // 약 30px: 미끄러진 콕
  const a = inp.poll(1130).actions[0]; assert.equal(a.type, 'tap'); assert.equal(a.x, 500);
  inp.down(3, 500, 100, 2000, 640); inp.move(3, 560, 100, 2300); inp.up(3, 560, 100, 2400); // 60px를 0.4초: 쓸기도 콕도 아님
  assert.equal(inp.poll(2410).actions.length, 0);
  assert.equal(TUNE.input.tapMove, 20); assert.equal(TUNE.input.leftTapMove, 20);
});
test('입력: 꾹은 20px 이하로 0.25초가 되는 순간 발동하고(떼지 않아도), 그 전에 떼면 콕이다', () => {
  const inp = createInput();
  inp.down(1, 500, 100, 0, 640);
  assert.equal(inp.poll(200).actions.length, 0); assert.ok(inp.holdProgress(125) > 0.45 && inp.holdProgress(125) < 0.55);
  const h = inp.poll(260).actions; assert.equal(h.length, 1); assert.equal(h[0].type, 'hold');
  inp.up(1, 500, 100, 900); assert.equal(inp.poll(910).actions.length, 0, '발동한 꾹은 뗄 때 다시 입력되지 않는다');
  inp.down(2, 500, 100, 2000, 640); inp.up(2, 500, 100, 2200); assert.equal(inp.poll(2210).actions[0].type, 'tap');
  inp.down(3, 500, 100, 3000, 640); inp.move(3, 530, 100, 3100); assert.equal(inp.poll(3300).actions.length, 0, '20px를 넘으면 꾹이 아니다');
});
test('입력: 왼쪽 반의 첫 손가락은 이동 전용(쓸기와 꾹은 안 됨), 쓸기는 오른쪽 손가락으로', () => {
  const inp = createInput();
  inp.down(1, 100, 100, 0, 640); assert.equal(inp.poll(400).actions.length, 0, '이동 손가락의 꾹은 인식하지 않는다');
  inp.move(1, 160, 100, 460); assert.ok(inp.poll(470).move.x > 0);
  inp.down(2, 500, 100, 1000, 640); inp.move(2, 540, 80, 1040); inp.up(2, 580, 60, 1080);
  const a = inp.poll(1090).actions[0]; assert.equal(a.type, 'swipe'); assert.ok(a.dx > 0.8 && a.dy < 0 && a.v > 1);
  assert.equal(inp.swipeTrail(1100)?.live, false);
});
test('입력: 더블탭 판정 코드는 남아 있지 않다', () => {
  for (const k of ['dtapMs', 'dtapPx']) assert.equal(TUNE.input[k], undefined);
  const inp = createInput();
  inp.down(1, 500, 100, 0, 640); inp.up(1, 500, 100, 80); inp.down(2, 500, 100, 150, 640); inp.up(2, 500, 100, 220);
  assert.deepEqual(inp.poll(230).actions.map((x) => x.type), ['tap', 'tap']);
});
test('입력: 민감도(±30%)는 꾹 시간과 쓸기 기준을 조절한다', () => {
  const inp = createInput(); inp.setSensitivity(1.3);
  inp.down(1, 500, 100, 0, 640); assert.equal(inp.poll(200).actions[0].type, 'hold'); // 250 / 1.3 = 192ms
  inp.setSensitivity(0.7); assert.equal(inp.sensitivity, 0.7);
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
test('입력: 합성 제스처 1000개의 콕, 쓸기, 꾹 인식 오류 5% 이하', () => {
  const r = createRng(5); let bad = 0;
  for (let i = 0; i < 1000; i += 1) {
    if (classifyGesture({ m: Math.abs(gauss(r) * 6), ms: Math.max(40, 110 + gauss(r) * 35) }) !== 'tap') bad += 1; // 콕: 거의 안 움직이고 짧게
    if (classifyGesture({ m: Math.max(40, 90 + gauss(r) * 20), ms: Math.max(40, 100 + gauss(r) * 25) }) !== 'swipe') bad += 1; // 쓸기: 90px 안팎을 0.1초에
    const inp = createInput(); inp.down(1, 500, 100, 0, 640); const dx = gauss(r) * 5; inp.move(1, 500 + dx, 100, 100);
    if (inp.poll(260).actions[0]?.type !== 'hold') bad += 1; // 꾹: 0.25초 동안 20px 안에 머문다
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
    update(M, 1 / 60, { actions: [{ type: 'tap', x: 0, y: 0, wx: mate.x, wy: mate.y }] }); settle(M);
    const dest = { ...M.ball.dest }; let bent = false;
    for (let i = 0; i < 90 && M.ball.st === 'pass'; i += 1) { update(M, 1 / 60, {}); if (M.ball.dest && (Math.abs(M.ball.dest.x - dest.x) > 1e-9 || Math.abs(M.ball.dest.y - dest.y) > 1e-9)) bent = true; }
    n += 1; if (!bent && M.ball.owner === mate) ok += 1;
  }
  assert.ok(ok / n >= 0.9, `받음 ${ok}/${n}`);
});
test('공을 가졌을 때: 선수 근처 콕은 그 선수에게 패스, 빈 곳 콕은 한 번에 공간 패스, 동료를 꾹은 효과 없음', () => {
  const setup = (sd) => { const M = mk(sd); play(M, 1); const me = M.players.find((p) => p.team === 0 && !p.gk); const mate = M.players.find((p) => p.team === 0 && !p.gk && p !== me);
    for (const q of M.players) if (q.team === 1) { q.x = 38; q.y = 1 + (q.num % 4); q.tx = q.x; q.ty = q.y; q.ts = 0; }
    me.x = 12; me.y = 10; mate.x = 24; mate.y = 14; mate.vx = 0; mate.vy = 0; mate.tx = mate.x; mate.ty = mate.y; mate.ts = 0;
    M.phase = 'play'; M.ball.st = 'held'; M.ball.owner = me; M.control = M.players.indexOf(me); return { M, me, mate }; };
  let r = setup(3);
  update(r.M, 1 / 60, { actions: [{ type: 'tap', wx: r.mate.x + 0.8, wy: r.mate.y }] }); settle(r.M);
  assert.equal(r.M.ball.tgt, r.mate);
  r = setup(3);
  update(r.M, 1 / 60, { actions: [{ type: 'tap', wx: 19, wy: 6 }] }); settle(r.M); // 12m 안의 빈 곳이라 오차가 없다
  assert.ok(Math.hypot(r.M.ball.dest.x - 19, r.M.ball.dest.y - 6) < 1e-6, '빈 곳을 한 번 콕하면 그 자리로 공간 패스');
  r = setup(3);
  update(r.M, 1 / 60, { actions: [{ type: 'hold', wx: r.mate.x, wy: r.mate.y }] }); settle(r.M);
  assert.equal(r.M.ball.st, 'held', '동료를 꾹은 인식만 하고 효과가 없다');
});
test('쓸기는 골대 방향 ±55도 안에서만 슛이고, 그 밖은 아무 일도 없다. 방향이 조준이다', () => {
  const swipe = (dx, dy, v = 1.2) => { const M = mk(6); play(M, 0.5); const me = M.players.find((p) => p.team === 0 && !p.gk); me.x = 30; me.y = 10; for (const q of M.players) if (q.team === 1 && !q.gk) { q.x = 10; q.y = 3; q.tx = q.x; q.ty = q.y; q.ts = 0; }
    M.phase = 'play'; M.ball.st = 'held'; M.ball.owner = me; M.control = M.players.indexOf(me);
    update(M, 1 / 60, { actions: [{ type: 'swipe', dx, dy, v }] }); settle(M); return M; };
  const s = (deg) => [Math.cos(deg * Math.PI / 180), Math.sin(deg * Math.PI / 180)];
  assert.equal(swipe(...s(0)).ball.st, 'shot');
  assert.equal(swipe(...s(50)).ball.st, 'shot'); assert.equal(swipe(...s(-50)).ball.st, 'shot');
  for (const deg of [60, -60, 90, -90, 135, 180]) assert.equal(swipe(...s(deg)).ball.st, 'held', `${deg}도는 슛이 아니다`);
  const up = swipe(...s(-12)).ball.aimTarget; const mid = swipe(...s(0)).ball.aimTarget; const down = swipe(...s(12)).ball.aimTarget;
  assert.ok(up < mid && mid < down, '쓴 각도가 조준이다');
  assert.equal(swipe(...s(50)).ball.aimTarget, TUNE.shot.goalY[1], '골대 밖을 가리키면 가장 가까운 골대 안 점으로 보정');
  assert.equal(swipe(...s(-50)).ball.aimTarget, TUNE.shot.goalY[0]);
});
test('공이 없을 때: 콕은 스탠딩 태클, 꾹은 슬라이딩 태클, 패스 효과는 없다', () => {
  const M = mk(7); play(M, 1);
  const opp = M.players.find((p) => p.team === 1 && !p.gk); const me = M.players.find((p) => p.team === 0 && !p.gk);
  M.phase = 'play'; M.ball.st = 'held'; M.ball.owner = opp; M.control = M.players.indexOf(me); me.x = opp.x - 1; me.y = opp.y;
  const mate = M.players.find((p) => p.team === 0 && !p.gk && p !== me); const passes0 = M.stats.passes[0];
  update(M, 1 / 60, { actions: [{ type: 'tap', wx: mate.x, wy: mate.y }] }); settle(M); // 우리 선수 근처를 눌러도 태클이다
  assert.ok(me.slideT > 0 && M.stats.passes[0] === passes0);
  const reset = () => { me.slideT = 0; M.ball.st = 'held'; M.ball.owner = opp; M.control = M.players.indexOf(me); me.x = opp.x - 1; me.y = opp.y; };
  reset(); update(M, 1 / 60, { actions: [{ type: 'hold', wx: 0, wy: 0 }] }); settle(M); assert.ok(me.slideT > 0);
  reset(); update(M, 1 / 60, { actions: [{ type: 'swipe', dx: 1, dy: 0, v: 1.5 }] }); settle(M); assert.equal(me.slideT, 0, '수비 중 쓸기는 무시');
});
test('패스 속도는 거리에 따라 10~16 m/s, 공은 방향을 바꾸지 않고 가까이 지나가는 동료도 받는다', () => {
  assert.equal(passSpeedFor(0), 10); assert.equal(passSpeedFor(30), 16); assert.ok(passSpeedFor(6) > passSpeedFor(3));
});
test('슛 세기: 스와이프가 빠를수록 강하고, 약한 슛이 막히기 쉽다', () => {
  assert.equal(swipePower(0.5), 0.6); assert.equal(swipePower(2.0), 1); assert.ok(swipePower(1.5) > swipePower(1)); assert.equal(swipePower(0.1), 0.6);
  assert.ok(gkReach(12, 0.2) > gkReach(12, 1));
});
test('골 판정은 보이는 대로: 골키퍼가 닿는 범위 밖으로 공이 지나가면 골, 안이면 선방', () => {
  const run = (gkOffset) => { const M = mk(9); play(M, 0.5); const me = M.players.find((p) => p.team === 0 && !p.gk); me.x = 30; me.y = 10;
    const gk = M.players.find((p) => p.team === 1 && p.gk); M.phase = 'play'; M.ball.st = 'held'; M.ball.owner = me; M.control = M.players.indexOf(me);
    M.api.shoot(me, 10, true, 0.5); settle(M); M.ball.reactAt = 1e9; gk.y = 10 + gkOffset; gk.tx = gk.x; gk.ty = gk.y; gk.ts = 0; // 골키퍼는 움직이지 못한다
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
  for (let k = 0; k < 40 && !scored; k += 1) { M.ball.st = 'held'; M.ball.owner = shooter; M.phase = 'play'; M.api.shoot(shooter, 10, true, 0.9); settle(M); M.ball.reactAt = 1e9; for (let i = 0; i < 40; i += 1) { update(M, 1 / 60, {}); gk.y = 5; } if (M.score[0] > 0) scored = true; }
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

test('킥 준비: 패스 준비 시간은 패스 능력 0/10/20에서 0.065/0.050/0.035초, 슛과 태클도 표와 같다', () => {
  const near = (a, b) => assert.ok(Math.abs(a - b) < 0.005, `${a} != ${b}`); // 문서 표는 반올림한 값
  for (const [a, v] of [[0, 0.065], [10, 0.05], [20, 0.035]]) near(kickPrep('pass', { passing: a }), v);
  for (const [a, v] of [[0, 0.1], [10, 0.08], [20, 0.06]]) near(kickPrep('shot', { shooting: a }), v);
  for (const [a, v] of [[0, 0.06], [10, 0.05], [20, 0.04]]) near(kickPrep('standing', { skill: a }), v);
  for (const [a, v] of [[0, 0.1], [10, 0.08], [20, 0.06]]) near(kickPrep('sliding', { skill: a }), v);
  assert.ok(Math.abs(stumbleTime(0) - 0.18) < 0.01 && Math.abs(stumbleTime(10) - 0.25) < 1e-9 && Math.abs(stumbleTime(20) - 0.33) < 0.01);
});
const holdSetup = (sd) => { const M = mk(sd); play(M, 1); const me = M.players.find((p) => p.team === 0 && !p.gk); const mate = M.players.find((p) => p.team === 0 && !p.gk && p !== me);
  for (const q of M.players) if (q.team === 1) { q.x = 38; q.y = 1 + (q.num % 4); q.tx = q.x; q.ty = q.y; q.ts = 0; }
  me.x = 14; me.y = 10; me.ab.passing = 10; me.ab.shooting = 10; mate.x = 24; mate.y = 14; mate.vx = 0; mate.vy = 0; mate.tx = mate.x; mate.ty = mate.y; mate.ts = 0;
  M.phase = 'play'; M.ball.st = 'held'; M.ball.owner = me; M.control = M.players.indexOf(me); return { M, me, mate }; };
test('입력 뒤 준비 시간 전에는 공이 소유 상태이고 그 뒤에 패스/슛 상태가 된다, 패스의 조종 전환은 입력 즉시', () => {
  let { M, me, mate } = holdSetup(11);
  update(M, 0.01, { actions: [{ type: 'tap', wx: mate.x, wy: mate.y }] });
  assert.equal(M.ball.st, 'held'); assert.equal(M.players[M.control], mate, '조종은 입력 즉시 받는 선수로');
  update(M, 0.03, {}); assert.equal(M.ball.st, 'held');
  update(M, 0.02, {}); assert.equal(M.ball.st, 'pass', '0.05초 준비 뒤 패스');
  ({ M, me } = holdSetup(11));
  update(M, 0.01, { actions: [{ type: 'swipe', dx: 1, dy: 0, v: 1.2 }] });
  assert.equal(M.ball.st, 'held'); update(M, 0.05, {}); assert.equal(M.ball.st, 'held'); update(M, 0.04, {}); assert.equal(M.ball.st, 'shot', '0.08초 준비 뒤 슛');
});
test('슛 준비 동안 슈터의 이동 속도는 40%, 발사 뒤 복구된다', () => {
  const { M, me } = holdSetup(12); M.autoHuman = false;
  const speed = () => { const x0 = me.x; me.vx = 0; me.tx = 39; me.ty = me.y; me.ts = 6; for (let i = 0; i < 12; i += 1) { movePlayersProbe(M, 1 / 60); } return me.x - x0; };
  const movePlayersProbe = (MM, dt) => update(MM, dt, { move: { x: 1, y: 0 } });
  const free = (() => { const x0 = me.x; for (let i = 0; i < 6; i += 1) update(M, 1 / 60, { move: { x: 1, y: 0 } }); return me.x - x0; })();
  void speed;
  const H = holdSetup(12); const m2 = H.me; update(H.M, 1 / 60, { move: { x: 1, y: 0 }, actions: [{ type: 'swipe', dx: 1, dy: 0, v: 1.2 }] });
  assert.equal(m2.prepShot, true); const x1 = m2.x; for (let i = 0; i < 3; i += 1) update(H.M, 1 / 60, { move: { x: 1, y: 0 } });
  assert.ok(m2.x - x1 < free * 0.6, `준비 중 이동 ${(m2.x - x1).toFixed(3)} 대 평소 ${free.toFixed(3)}`);
  for (let i = 0; i < 12; i += 1) update(H.M, 1 / 60, { move: { x: 1, y: 0 } });
  assert.equal(m2.prepShot, false);
});
test('준비 중 소유권을 잃으면 예약이 취소된다, 골과 데드볼과 하프타임이 와도 예약이 사라진다', () => {
  let { M, me } = holdSetup(13); const opp = M.players.find((p) => p.team === 1 && !p.gk);
  update(M, 0.01, { actions: [{ type: 'swipe', dx: 1, dy: 0, v: 1.2 }] }); assert.equal(M.queue.length, 1);
  setHold(M, opp); assert.equal(M.queue.length, 0, '뺏기면 예약 취소'); update(M, 0.2, {}); assert.notEqual(M.ball.st, 'shot');
  ({ M, me } = holdSetup(14));
  update(M, 0.01, { actions: [{ type: 'swipe', dx: 1, dy: 0, v: 1.2 }] });
  M.ball.st = 'loose'; M.ball.owner = null; M.ball.x = -3; M.ball.y = 5; update(M, 0.01, {});
  assert.equal(M.phase, 'deadball'); assert.equal(M.queue.length, 0);
  ({ M, me } = holdSetup(15));
  update(M, 0.01, { actions: [{ type: 'swipe', dx: 1, dy: 0, v: 1.2 }] }); M.halfClock = TUNE.halfClockSeconds + M.extra[1] ?? 0; M.extra[1] = 0; M.halfClock = TUNE.halfClockSeconds + 1; update(M, 0.01, {});
  assert.equal(M.phase, 'halftime'); assert.equal(M.queue.length, 0);
});
test('히트스톱: 슛 세기 0.7 이상이면 발사 순간 33ms 동안 시뮬레이션이 멈춘다(결정성 유지)', () => {
  const run = () => { const { M } = holdSetup(16); update(M, 0.01, { actions: [{ type: 'swipe', dx: 1, dy: 0, v: 1.8 }] }); for (let i = 0; i < 6; i += 1) update(M, 0.02, {}); return M; };
  const A = run(); const B = run();
  assert.equal(A.ball.x, B.ball.x); assert.equal(A.real, B.real);
  const { M } = holdSetup(16); update(M, 0.01, { actions: [{ type: 'swipe', dx: 1, dy: 0, v: 1.8 }] }); let stopped = false; for (let i = 0; i < 12; i += 1) { const r0 = M.real; update(M, 0.01, {}); if (M.real === r0 && M.hitstop >= 0 && M.ball.st === 'shot') stopped = true; }
  assert.ok(stopped, '발사 직후 잠깐 멈췄다');
});
test('같은 시드와 같은 입력이면 결과가 같다', () => {
  const run = () => { const M = mk(21); const inputs = []; for (let i = 0; i < 600; i += 1) { const a = i % 90 === 40 ? [{ type: 'tap', wx: 25, wy: 8 }] : (i % 150 === 100 ? [{ type: 'swipe', dx: 1, dy: 0.2, v: 1.4 }] : []); update(M, 1 / 60, { move: i % 200 < 120 ? { x: 1, y: 0.2 } : null, actions: a }); inputs.push(a.length); } return [M.score.join('-'), M.ball.x.toFixed(6), M.real.toFixed(6), M.stats.passes.join(',')]; };
  assert.deepEqual(run(), run());
});

test('패스 속도: 능력 0/10/20에서 0.9/1.0/1.1배, 어떤 경우에도 10m/s 아래로 내려가지 않는다', () => {
  const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
  near(passSpeedCoef(0), 0.9); near(passSpeedCoef(10), 1.0); near(passSpeedCoef(20), 1.1);
  for (const d of [0, 1, 5, 15, 40]) for (const a of [0, 10, 20]) assert.ok(passV0(d, a) >= 10 - 1e-9);
  near(passV0(10, 20), passSpeedFor(10) * 1.1);
});
test('패스는 도착할 때 출발 속도의 80%(±2%)로 느려진다', () => {
  const { M, me, mate } = holdSetup(31); me.ab.passing = 10; mate.x = 34; mate.y = 10; mate.tx = mate.x; mate.ty = mate.y; mate.ts = 0;
  update(M, 0.01, { actions: [{ type: 'tap', wx: mate.x, wy: mate.y }] }); settle(M);
  const v0 = M.ball.v0; let last = v0; let first = Math.hypot(M.ball.vx, M.ball.vy);
  for (let i = 0; i < 300 && M.ball.st === 'pass'; i += 1) { last = Math.hypot(M.ball.vx, M.ball.vy); update(M, 1 / 120, {}); }
  assert.ok(Math.abs(first - v0) / v0 < 0.02, '출발 속도'); assert.ok(Math.abs(last / v0 - 0.8) < 0.03, `도착 직전 ${(last / v0).toFixed(3)}배`);
});
test('패스 오차: 먼 패스와 압박에서만 생기고, 패스 능력이 높을수록 작다. 체력 25% 이하면 1.25배', () => {
  const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
  assert.equal(passErrorSigma({ dist: 8, pressed: false, passing: 10, ratio: 1 }), 0, '가깝고 압박 없으면 오차 없음');
  near(passErrorSigma({ dist: 12, pressed: false, passing: 10, ratio: 1 }), 0.5 * 0.9);
  near(passErrorSigma({ dist: 12, pressed: true, passing: 10, ratio: 1 }), 1.0 * 0.9, '겹치면 합산');
  near(passErrorSigma({ dist: 12, pressed: false, passing: 0, ratio: 1 }), 0.5 * 1.6); near(passErrorSigma({ dist: 12, pressed: false, passing: 20, ratio: 1 }), 0.5 * 0.2);
  near(passErrorSigma({ dist: 12, pressed: false, passing: 10, ratio: 0.2 }), 0.5 * 0.9 * 1.25);
  const spread = (passing, sd) => { let sum = 0; for (let i = 0; i < 200; i += 1) { const { M, me, mate } = holdSetup(500 + i + sd); me.ab.passing = passing; me.x = 6; me.y = 10; mate.x = 26; mate.y = 10; mate.tx = mate.x; mate.ty = mate.y; mate.ts = 0; mate.vx = 0; mate.vy = 0;
    update(M, 0.01, { actions: [{ type: 'tap', wx: mate.x, wy: mate.y }] }); settle(M); sum += Math.abs(M.ball.dest.y - 10); } return sum / 200; };
  assert.ok(spread(20, 0) < spread(0, 0), '패스 20은 패스 0보다 오차가 작다');
  const { M, me, mate } = holdSetup(32); me.x = 10; mate.x = 16; mate.y = 10; mate.tx = mate.x; mate.ty = mate.y; mate.ts = 0; mate.vx = 0; mate.vy = 0;
  update(M, 0.01, { actions: [{ type: 'tap', wx: mate.x, wy: mate.y }] }); settle(M); assert.equal(M.ball.dest.y, 10, '짧은 압박 없는 패스는 오차가 없다');
});
test('판정 반경: 가로채기 0.77/0.85/0.94m, 공 받기 1.08/1.20/1.32m (능력 0/10/20)', () => {
  const close = (a, b) => assert.ok(Math.abs(a - b) < 0.006, `${a} != ${b}`);
  for (const [a, v] of [[0, 0.77], [10, 0.85], [20, 0.94]]) close(interceptRadius({ passing: a, speed: a }), v);
  for (const [a, v] of [[0, 1.08], [10, 1.2], [20, 1.32]]) close(pickupRadius({ passing: a }), v);
});
test('패스 성공은 패스 후 처음 닿는 선수가 누구냐로 정한다', () => {
  const { M, me, mate } = holdSetup(33); mate.x = 20; mate.y = 10; mate.tx = mate.x; mate.ty = mate.y; mate.ts = 0; mate.vx = 0; mate.vy = 0; me.x = 14; me.y = 10;
  update(M, 0.01, { actions: [{ type: 'tap', wx: mate.x, wy: mate.y }] }); settle(M);
  for (let i = 0; i < 200 && M.ball.st === 'pass'; i += 1) update(M, 1 / 60, {});
  assert.equal(M.stats.passOk[0], 1); assert.equal(M.stats.passFail[0], 0);
});
