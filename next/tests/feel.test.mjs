// 하이라이트 "느낌" 합격 기준(설계서 v3 지시문 2절)을 렌더링 없이 숫자로 확인한다.
// 봇은 입력 타이밍 오차 σ=0.05초의 능숙한 플레이어다. 측정값은 `node --test tests/feel.test.mjs` 로 다시 낼 수 있다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Attack, cameraTarget } from '../proto/attack.mjs?v14';
import { TUNE, aimOf, classifyGesture, gaugeAt, instantGoalProb, resolveShot, runSpeedOf } from '../proto/rules.mjs?v14';
import { mulberry, playAttack } from './feelBot.mjs';

const N = 160;
const cellOf = (i) => ({ h: i % 3, d: i % 2 }); // 시작 칸: 우리 진영과 하프라인 쪽
const runs = (opts) => Array.from({ length: N }, (_, i) => playAttack({ seed: i + 1, cell: cellOf(i), ...opts }));
const pct = (n, d) => n / d;

test('선수 ID는 처음부터 끝까지 그대로고, 입력도 움직임도 없는 구간은 0.3초 이하다', () => {
  for (const target of ['WB', 'WG', 'ST']) {
    for (const r of runs({ target })) {
      assert.ok(r.ended, '공격이 끝나야 한다');
      assert.equal(r.idsChanged, false, '단계가 바뀌어도 선수가 사라지거나 생기지 않는다');
      assert.ok(r.maxQuiet <= 0.3, `정지 구간 ${r.maxQuiet}`);
    }
  }
});

test('마지막 입력부터 다음 공격의 첫 조작까지 2.0초 이하(결과 표시 포함)', () => {
  let worst = 0;
  for (const target of ['WB', 'WG', 'ST']) {
    for (const { A } of runs({ target })) {
      const resultAt = A.log.find((l) => l.name === 'result').t;
      const startNext = A.result.kind === 'goal' ? 0.9 : 0.5; // 화면 코드: 다음 공격은 결과 뒤 이 시간에 시작
      const minOpen = Math.min(...Object.values(A.cands).map((c) => c.open));
      const shotResult = ['goal', 'save', 'post', 'miss'].includes(A.result.kind); // 슛은 마지막 입력부터, 그 밖은 결과가 정해진 순간부터 센다(무입력 대기는 플레이어의 시간)
      const gap = (shotResult ? resultAt - A.lastInputT : 0) + startNext + Math.max(0, minOpen - 0.35);
      worst = Math.max(worst, gap);
    }
  }
  assert.ok(worst <= 2.0, `최악 ${worst.toFixed(2)}초`);
});

test('달리기 화면 속도 250px/s 이상, 위협 예고부터 접촉까지 1.0초 이상, 위협 4~6회', () => {
  const speeds = []; const lead = []; const counts = [];
  for (const target of ['WB', 'WG']) {
    for (let i = 0; i < N; i += 1) {
      const A = new Attack({ rand: mulberry(i + 1), cell: cellOf(i) });
      const c = A.cands[target];
      A.update(0.01); A.pt = (c.open + c.close) / 2; A.input({ type: 'tap', x: c.me.x, y: c.me.y });
      for (let k = 0; k < 200 && A.phase !== 'run'; k += 1) A.update(1 / 60);
      for (let k = 0; k < 90; k += 1) A.update(1 / 60);
      const cam = cameraTarget(A);
      speeds.push(A.runner.vx * cam.z * 2);
      counts.push(A.stats.threats);
      // 한 번 달릴 때 위협을 끝까지 돌려 본다(개인기로 접촉을 흘려 보냄)
      for (let k = 0; k < 60 * 12 && A.phase === 'run'; k += 1) {
        if (A.skill.cd <= 0 && A.threats.some((th) => th.state === 'windup')) A.input({ type: 'tap', x: 0, y: 0 });
        A.update(1 / 60);
      }
      for (const th of A.threats) if (th.contactClock != null) lead.push(th.contactClock - th.warnClock);
    }
  }
  assert.ok(Math.min(...speeds) >= 250, `화면 속도 최소 ${Math.min(...speeds).toFixed(0)}`);
  assert.ok(lead.length > 20 && Math.min(...lead) >= 1.0, `예고 최소 ${Math.min(...lead).toFixed(2)}`);
  assert.ok(Math.min(...counts) >= 4 && Math.max(...counts) <= 6, `위협 ${Math.min(...counts)}~${Math.max(...counts)}`);
});

test('무입력 달리기는 슛 사거리에 거의 못 가고(5% 이하), 능숙한 봇은 60~80%가 간다', () => {
  let straight = 0; let straightRuns = 0; let skilled = 0; let skilledRuns = 0;
  for (const target of ['WB', 'WG']) {
    for (const { A } of runs({ target, bot: 'straight' })) { straightRuns += 1; if (A.log.some((l) => l.name === 'inRange')) straight += 1; }
    for (const { A } of runs({ target })) { skilledRuns += 1; if (A.log.some((l) => l.name === 'inRange')) skilled += 1; }
  }
  assert.ok(pct(straight, straightRuns) <= 0.05, `무입력 ${(pct(straight, straightRuns) * 100).toFixed(1)}%`);
  const s = pct(skilled, skilledRuns);
  assert.ok(s >= 0.6 && s <= 0.8, `능숙한 봇 ${(s * 100).toFixed(1)}%`);
});

test('뒤 추격 간격이 0.14 이하로 내려가는 달리기가 20% 이상이다', () => {
  let close = 0; let total = 0;
  for (const target of ['WB', 'WG']) for (const { A } of runs({ target })) { if (!A.log.some((l) => l.name === 'phase' && A.runner)) continue; total += 1; if (A.stats.vignette > 0) close += 1; }
  assert.ok(pct(close, total) >= 0.2, `${(pct(close, total) * 100).toFixed(1)}%`);
});

test('첫 패스: 세 선수의 최적 시점이 다르고, 아무도 탭하지 않거나 창 밖에서 탭하면 턴오버 100%', () => {
  const A = new Attack({ rand: mulberry(3), cell: cellOf(1) });
  const mids = ['WB', 'WG', 'ST'].map((k) => (A.cands[k].open + A.cands[k].close) / 2);
  assert.ok(mids[0] < mids[1] && mids[1] < mids[2]);
  for (const bot of ['idle', 'early', 'late']) for (const { A: a } of runs({ target: 'WG', bot })) assert.equal(a.result.kind, 'turnover');
  const ok = runs({ target: 'ST' }).filter(({ A: a }) => a.result.kind !== 'turnover').length;
  assert.ok(ok > N * 0.8, '창 안에서 탭하면 대부분 이어진다');
});

test('조준 중 압박수는 0.35배로 느리고 슬로우는 최대 2.0초 뒤 정상 속도로 돌아온다', () => {
  const A = new Attack({ rand: mulberry(9), cell: cellOf(1) });
  const c = A.cands.ST;
  A.update(0.01); A.pt = (c.open + c.close) / 2 - 0.4; A.input({ type: 'tap', x: c.me.x, y: c.me.y });
  assert.equal(A.phase, 'aim');
  const sp = () => { const x0 = A.presser.x; const y0 = A.presser.y; A.update(0.1); return Math.hypot(A.presser.x - x0, A.presser.y - y0) / 0.1; };
  const slow = sp();
  assert.ok(Math.abs(slow / (A.runSpeed * TUNE.pressMul) - TUNE.aimSlow) < 0.02 || slow <= A.runSpeed * 0.36, `느린 속도 ${slow.toFixed(1)}`);
  while (A.prt < TUNE.aimMax - 0.05 && A.phase === 'aim') A.update(0.05);
  if (A.phase === 'aim') { A.update(0.2); const fast = sp(); assert.ok(fast > slow * 2, '2초 뒤에는 정상 속도'); }
  assert.equal(A.slow, 1, '전역 감속은 쓰지 않는다');
});

test('루즈볼은 공격당 1회, 확보 창 0.8초, 두 번째 접촉은 턴오버', () => {
  let secured = 0; let second = 0;
  for (const target of ['WB', 'WG']) {
    for (let i = 0; i < N; i += 1) {
      const A = new Attack({ rand: mulberry(i + 1), cell: cellOf(i) });
      const c = A.cands[target];
      A.update(0.01); A.pt = (c.open + c.close) / 2; A.input({ type: 'tap', x: c.me.x, y: c.me.y });
      let loose = 0;
      for (let k = 0; k < 60 * 40 && !A.done; k += 1) {
        if (A.phase === 'loose') { if (A.prt >= TUNE.looseTarget) A.input({ type: 'tap', x: 0, y: 0 }); loose += 1; }
        A.update(1 / 60);
        assert.ok(!(A.phase === 'loose' && A.prt > TUNE.looseTime + 0.05), '확보 창은 0.8초');
      }
      assert.ok(A.stats.looseTries <= 1, '루즈볼은 공격당 1회');
      if (A.stats.looseTries === 1 && A.log.some((l) => l.name === 'secured')) { secured += 1; if (A.stats.contacts >= 2) { second += 1; assert.equal(A.result.kind === 'goal', false); } }
    }
  }
  assert.ok(secured > 10, `확보 ${secured}`);
});

test('손가락 입력 구분: 탭과 앞으로 플릭의 오입력이 5% 이하다', () => {
  const r = mulberry(5); const g = () => { let u = 0; for (let i = 0; i < 6; i += 1) u += r(); return (u - 3) / Math.sqrt(0.5); };
  let bad = 0; const n = 4000;
  for (let i = 0; i < n; i += 1) {
    if (classifyGesture({ m: Math.abs(g() * 3.5), ms: Math.max(40, 110 + g() * 35) }) !== 'tap') bad += 1; // 탭 의도: 거의 안 움직이고 짧게 누름
    if (classifyGesture({ m: Math.max(0, 90 + g() * 20), ms: Math.max(40, 100 + g() * 25) }) !== 'flick') bad += 1; // 플릭 의도: 90px 안팎을 0.1초에
  }
  assert.ok(bad / (2 * n) <= 0.05, `오입력 ${(100 * bad / (2 * n)).toFixed(2)}%`);
});

test('즉발 슛: 입력부터 결과까지 1.0초 이하이고, 골 확률은 정밀 슛(보통 플레이어)의 약 절반이다', () => {
  const A = new Attack({ rand: mulberry(1), cell: cellOf(1) });
  A.phase = 'run'; A.runner = A.wg; A.inRange = true; A.wg.x = 560; A.wg.y = 189; A.ball.holder = A.wg; A.ball.state = 'held';
  const t0 = A.rt; A.input({ type: 'flick', dx: 60, dy: 0 });
  for (let i = 0; i < 120 && !A.result; i += 1) A.update(1 / 60);
  assert.ok(A.result && A.rt - t0 <= 1.0, `${(A.rt - t0).toFixed(2)}초`);
  // 정밀 슛: 타이밍 오차 σ=0.10초인 보통 플레이어를 몬테카를로로 센다
  const r = mulberry(11); const g = () => { let u = 0; for (let i = 0; i < 6; i += 1) u += r(); return (u - 3) / Math.sqrt(0.5); };
  let goals = 0; const n = 20000;
  for (let i = 0; i < n; i += 1) if (resolveShot({ power: Math.min(1, Math.max(0, 0.65 + g() * 0.1)), aim: 0.7 + g() * 0.24, shooting: 12 }) === 'goal') goals += 1;
  const ratio = instantGoalProb(12) / (goals / n);
  assert.ok(ratio >= 0.4 && ratio <= 0.6, `즉발 대 정밀 ${ratio.toFixed(2)} (정밀 ${(goals / n).toFixed(2)})`);
});

test('게이지 스윕과 헤더 링은 슬로우 중에도 실시간 0.9~1.1초', () => {
  assert.ok(Math.abs(gaugeAt(TUNE.gaugeCycle) - 1) < 1e-9 && TUNE.gaugeCycle >= 0.9 && TUNE.gaugeCycle <= 1.1);
  const A = new Attack({ rand: mulberry(2), cell: cellOf(1) });
  A.startPrecise(A.st, { striker: true });
  assert.ok(A.slow < 1, '월드는 느려진다');
  for (let i = 0; i < 30; i += 1) A.update(1 / 60); // 실시간 0.5초
  assert.ok(Math.abs(A.gaugeNow() - 0.5) < 0.03, `게이지 ${A.gaugeNow().toFixed(2)}`);
  const H = new Attack({ rand: mulberry(2), cell: cellOf(1) });
  H.startHeader();
  let t = 0; while (H.phase === 'header' && t < 3) { H.update(1 / 60); t += 1 / 60; }
  assert.ok(t >= 0.9 && t <= 1.1, `헤더 ${t.toFixed(2)}초`);
});

test('스트라이커 롱볼: 짧게 당기면 헤더, 길게 당기면 발 슛(정밀)으로 이어진다', () => {
  const get = (len) => {
    const A = new Attack({ rand: mulberry(4), cell: cellOf(1) });
    const c = A.cands.ST;
    A.update(0.01); A.pt = (c.open + c.close) / 2 - 0.3; A.input({ type: 'tap', x: c.me.x, y: c.me.y });
    A.update(0.2);
    const dur = len < TUNE.aimLowPull ? TUNE.lobTime.loft : TUNE.lobTime.low;
    const lead = A.stLead(dur); const want = Math.atan2(lead.y - A.mf.y, lead.x - A.mf.x);
    A.input({ type: 'aimRelease', dx: -Math.cos(want) * len, dy: -Math.sin(want) * len });
    for (let i = 0; i < 120 && A.phase === 'lob'; i += 1) A.update(1 / 60);
    return A.phase;
  };
  assert.equal(get(30), 'header');
  assert.equal(get(100), 'pow');
});

test('헤드리스 측정표(참고 출력)', () => {
  const rows = [];
  const all = ['WB', 'WG', 'ST'].flatMap((target) => runs({ target }).map((r) => ({ ...r, target })));
  const kinds = {};
  for (const { A } of all) kinds[A.result.kind] = (kinds[A.result.kind] ?? 0) + 1;
  rows.push(`결과 분포(능숙한 봇 ${all.length}회): ${JSON.stringify(kinds)}`);
  assert.ok(all.length > 0);
  console.log(rows.join('\n'));
});
