// 9장 시뮬레이션 검증(사람 없이). node tests/futsalVerify.mjs [동급경기수=1000] [능력경기수=200] [평균경기수=400]
// 결과를 표로 출력한다. 자동 테스트(node --test)에는 넣지 않는다(오래 걸린다).
import { createMatch, update, demoTeam, startSecondHalf } from '../proto/futsalSim.mjs';
import { TUNE, tackleChance, classifyGesture } from '../proto/futsalRules.mjs';
import { createRng, gauss } from '../engine/rng.mjs';
import { createInput } from '../proto/futsalInput.mjs';

// 환경변수 TUNE_OVR='{"minRunSpeed":6.5}' 로 TUNE 값을 덮어쓰고(보정 후보 비교용), ONLY='2,3' 으로 구간을 고른다
for (const [path, v] of Object.entries(JSON.parse(process.env.TUNE_OVR ?? '{}'))) { const ks = path.split('.'); let o = TUNE; for (const k of ks.slice(0, -1)) o = o[k]; o[ks.at(-1)] = v; }
const only = (process.env.ONLY ?? '1,1b,2,3,4,5').split(',');
const [N1 = 1000, N2 = 200, N3 = 400] = process.argv.slice(2).map(Number);
const FIELD = ['speed', 'stamina', 'strength', 'passing', 'shooting', 'skill'];
const flat = (name, v = 10) => ({ name, players: Array.from({ length: 8 }, (_, i) => ({ id: `${name}${i}`, name: `${name}${i}`, gk: i === 0, cond: 1, ab: i === 0 ? { speed: v, stamina: v, strength: v, reaction: 10, handling: 10 } : Object.fromEntries(FIELD.map((k) => [k, v])) })) });
const withAb = (name, over) => { const t = flat(name); for (const p of t.players) if (!p.gk) Object.assign(p.ab, over); return t; };
const run = (seed, home, away, hook, setup) => { const M = createMatch({ seed, home, away }); M.autoHuman = true; setup?.(M); let k = 0; while (M.phase !== 'end' && k < 60 * 900) { if (M.phase === 'halftime') startSecondHalf(M); update(M, 1 / 60, {}); hook?.(M); k += 1; } return M; };
const pct = (a, b) => (b ? (100 * a / b).toFixed(1) + '%' : '-');
const f1 = (x) => x.toFixed(1);

// 패스 난이도 점수 = 거리(m) / 5 + max(0, 2 - 패스 선 여유(m)). 거리가 길수록, 패스 선 가까이 수비수가 있을수록 높다(어려움).
// 패스 선 여유 = 패스 선(출발점~도착점)에서 가장 가까운 상대 필드 선수까지 거리. 전 경기 패스를 점수로 줄 세워 쉬움 30% / 보통 40% / 어려움 30%로 나눈다.
const segD = (px, py, ax, ay, bx, by) => { const dx = bx - ax; const dy = by - ay; const l = dx * dx + dy * dy || 1; const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l)); return Math.hypot(px - (ax + dx * t), py - (ay + dy * t)); };
const recs = [];
function trackPasses(M) {
  const st = M.stats; let cur = null;
  st.passes = new Proxy([0, 0], { set(a, i, v) { if (i === '0' || i === '1') { const t = Number(i); const b = M.ball; const clr = Math.min(...M.players.filter((p) => p.team !== t && !p.gk).map((p) => segD(p.x, p.y, b.from.x, b.from.y, b.dest.x, b.dest.y))); cur = { t, dist: b.total, clr, score: b.total / 5 + Math.max(0, 2 - clr), ic: st.intercepts[1 - t], ok: st.passOk[t], f: st.passFail[t] }; } a[i] = v; return true; } });
  return () => { if (!cur) return; const t = cur.t; if (st.intercepts[1 - t] > cur.ic || st.passFail[t] > cur.f) { recs.push({ ...cur, ok: false }); cur = null; } else if (st.passOk[t] > cur.ok) { recs.push({ ...cur, ok: true }); cur = null; } };
}
function passReport(N) {
  recs.sort((x, y) => x.score - y.score); const n = recs.length; const cuts = [Math.floor(n * 0.3), Math.floor(n * 0.7), n]; const names = ['쉬움(하위 30%)', '보통(40%)', '어려움(상위 30%)']; const goal = ['90%+', '75~85%', '45~60%']; let from = 0; const out = [];
  cuts.forEach((to, k) => { const g = recs.slice(from, to); from = to; const m = (f) => g.reduce((a, r) => a + f(r), 0) / Math.max(1, g.length); out.push(`${names[k]} 패스 ${f1(g.length / N / 2)}개/팀, 점수 ${m((r) => r.score).toFixed(2)}, 평균 거리 ${m((r) => r.dist).toFixed(1)}m, 평균 패스 선 여유 ${m((r) => r.clr).toFixed(2)}m, 성공 ${pct(g.filter((r) => r.ok).length, g.length)} (목표 ${goal[k]})`); });
  console.log(`[1a] 패스 난이도(점수 = 거리/5 + max(0, 2 - 여유)):\n     ${out.join('\n     ')}\n     전체 성공 ${pct(recs.filter((r) => r.ok).length, n)} (목표 70~78%)`);
}
// 1. 동급 팀(능력 10 전원) 경기당 팀 기준 지표
if (only.includes('1')) {
  const s = { passes: 0, ok: 0, att: 0, tok: 0, shots: 0, goals: 0, games: N1 };
  for (let i = 1; i <= N1; i += 1) { let tick = null; const M = run(i, flat('H'), flat('A'), () => tick(), (m) => { tick = trackPasses(m); }); for (const t of [0, 1]) { s.passes += M.stats.passes[t]; s.ok += M.stats.passOk[t]; s.att += M.stats.tackleOk[t] + M.stats.tackleFails[t]; s.tok += M.stats.tackleOk[t]; s.shots += M.stats.shots[t]; s.goals += M.score[t]; } }
  const per = (x) => f1(x / N1 / 2);
  passReport(N1);
  console.log(`[1] 동급 ${N1}경기, 팀당: 패스 ${per(s.passes)}개 성공 ${pct(s.ok, s.passes)} | 태클 시도 ${per(s.att)}회 성공 ${pct(s.tok, s.att)} | 슛 ${per(s.shots)}회 슛당 득점 ${pct(s.goals, s.shots)} | 합계 골 ${f1(s.goals / N1)}`);
}
if (only.includes('1b')) {
  let reached = 0; let stopped = 0;
  for (let i = 1; i <= Math.min(N1, 300); i += 1) {
    const M = createMatch({ seed: i, home: flat('H'), away: flat('A') }); let inAtk = false; let shot = false; let k = 0;
    while (M.phase !== 'end' && k < 60 * 900) { if (M.phase === 'halftime') startSecondHalf(M); const kw = M.phase === 'deadball' && M.restart?.wait; const m0 = kw ? M.players.find((p) => p.team === 0 && !p.gk && p !== M.ball.owner) : null; update(M, 1 / 60, kw ? { actions: [{ type: 'tap', wx: m0.x, wy: m0.y }] } : {}); k += 1; const b = M.ball; // 사람 팀은 조이스틱을 안 잡는다. 킥오프 대기만 콕 한 번으로 시작한다
      if (M.phase !== 'play') { if (inAtk && !shot) stopped += 0; inAtk = false; continue; }
      const own = b.owner?.team; const sh = b.st === 'shot' && b.shooter?.team === 1;
      if (sh) shot = true;
      if (own === 1 && b.x < 14 && !inAtk) { inAtk = true; shot = false; reached += 1; }
      if (inAtk && (own === 0 || b.st === 'loose') && !shot) { stopped += 1; inAtk = false; } else if (inAtk && shot && own !== 1) inAtk = false; }
  }
  console.log(`[1b] 자동 수비만(사람 입력 없음 + 사람 팀 조종은 AI 수비): 상대 공격 ${reached}번 중 막힘 ${stopped}번 = 10번 중 ${(10 * stopped / Math.max(1, reached)).toFixed(1)}번`);
}
if (only.includes('2')) {
  console.log(`[2] 능력치 하나를 바꾼 팀(홈) vs 전원 10 (각 ${N2}경기, 홈/원정 번갈아): 승률(무승부 0.5) / 경기당 골 차이`);
  for (const k of (process.env.ABS ?? FIELD.join(',')).split(',')) { const row = []; for (const v of (process.env.VALS ?? '0,20').split(',').map(Number)) { let w = 0; let gd = 0; for (let i = 1; i <= N2; i += 1) { const swap = i % 2; const T = withAb('T', { [k]: v }); const B = flat('B'); const M = swap ? run(i, B, T) : run(i, T, B); const a = swap ? M.score[1] : M.score[0]; const b = swap ? M.score[0] : M.score[1]; w += a > b ? 1 : (a === b ? 0.5 : 0); gd += a - b; } row.push(`${v}: ${pct(w, N2)} (${(gd / N2 >= 0 ? '+' : '') + (gd / N2).toFixed(2)})`); } console.log(`   ${k.padEnd(9)} ${row.join(' | ')}`); }
}
if (only.includes('3')) {
  for (const d of [2, 4]) { let w = 0; let gd = 0; for (let i = 1; i <= N3; i += 1) { const swap = i % 2; const T = flat('T', 10 + d); const B = flat('B'); const M = swap ? run(i, B, T) : run(i, T, B); const a = swap ? M.score[1] : M.score[0]; const b = swap ? M.score[0] : M.score[1]; w += a > b ? 1 : (a === b ? 0.5 : 0); gd += a - b; } console.log(`[3] 전원 +${d} 팀 승률(무승부 0.5) ${pct(w, N3)}, 골 차이 ${(gd / N3).toFixed(2)} (${N3}경기)`); }
}
if (only.includes('4')) {
  const r = createRng(11); let bad = 0; const n = 5000; const C = { tap: 0, hold: 0, swipe: 0 };
  for (let i = 0; i < n; i += 1) {
    if (classifyGesture({ m: Math.abs(gauss(r) * 8), ms: Math.max(40, 120 + gauss(r) * 40) }) !== 'tap') { bad += 1; C.tap += 1; }
    if (classifyGesture({ m: Math.max(40, 90 + gauss(r) * 25), ms: Math.max(40, 110 + gauss(r) * 30) }) !== 'swipe') { bad += 1; C.swipe += 1; }
    const inp = createInput(); inp.down(1, 500, 100, 0, 640); inp.move(1, 500 + gauss(r) * 6, 100 + gauss(r) * 6, 100); if (inp.poll(260).actions[0]?.type !== 'hold') { bad += 1; C.hold += 1; }
  }
  console.log(`[4] 입력 모사 ${n * 3}회 인식 오류 ${pct(bad, n * 3)} (콕 ${C.tap}, 꾹 ${C.hold}, 쓸기 ${C.swipe}건)`);
  const eq = { strength: 10, speed: 10, skill: 10 }; const q = createRng(3); const m = 20000; const hit = (o) => { let c = 0; for (let i = 0; i < m; i += 1) if (q() < tackleChance(eq, eq, o)) c += 1; return pct(c, m); };
  console.log(`    태클 성공(동급): 스탠딩 ${hit({})} → 신호 ${hit({ signal: true })} | 슬라이딩 ${hit({ slide: true })} → 신호 ${hit({ slide: true, signal: true })} (목표 55% / 39% ±3%p)`);
}
// 5. 슛 각도: 쓴 각도 대비 실제 공 궤적 각도 오차(거리별, 슛 능력별), 그리고 쓸기 각도를 끝 10px로 구하는 방법의 비교
if (only.includes('5')) {
  const r = createRng(9); console.log('[5] 쓴 각도와 공 궤적 각도의 오차(도), 평균 / 최대 (슛 능력 0 | 10 | 20)');
  for (const dist of [6, 12, 20, 28]) { const row = [];
    for (const sh of [0, 10, 20]) { const errs = [];
      for (let i = 0; i < 300; i += 1) { const M = createMatch({ seed: 100 + i, home: flat('H'), away: flat('A') }); for (let k = 0; k < 30; k += 1) update(M, 1 / 60, {});
        const me = M.players.find((p) => p.team === 0 && !p.gk); me.x = 40 - dist; me.y = 10 + (r() - 0.5) * 8; me.ab.shooting = sh; for (const q of M.players) if (q.team === 1 && !q.gk) { q.x = 10; q.y = 3; q.tx = q.x; q.ty = q.y; q.ts = 0; }
        M.phase = 'play'; M.ball.st = 'held'; M.ball.owner = me; M.control = M.players.indexOf(me); const a = (r() - 0.5) * 60 * Math.PI / 180; const n0 = M.events.length;
        update(M, 1 / 60, { actions: [{ type: 'swipe', dx: Math.cos(a), dy: Math.sin(a), v: 1.2 }] }); for (let k = 0; k < 60 && M.ball.st !== 'shot'; k += 1) update(M, 1 / 60, {});
        const e = M.events.slice(n0).find((x) => x.kind === 'kick' && x.type === 'shot'); if (e && e.ang != null) errs.push(Math.abs(e.real - e.ang)); }
      row.push(`${f1(errs.reduce((a, b) => a + b, 0) / errs.length)} / ${f1(Math.max(...errs))}`); }
    console.log(`    ${String(dist).padStart(2)}m: ${row.join(' | ')}`); }
  // 손가락 궤적: 처음 20px는 의도 방향에서 N(0, 12도)만큼 빗나갔다가 곧게 간다(사람이 쓸 때의 시작 흔들림 모사). 의도 방향 = 마지막 구간 방향.
  const trial = (endPx) => { TUNE.input.swipeEndPx = endPx; const errs = []; const q = createRng(4);
    for (let i = 0; i < 2000; i += 1) { const want = (q() - 0.5) * 2 * Math.PI * 0.3; const lead = want + gauss(q) * 12 * Math.PI / 180; const inp = createInput(); inp.down(1, 500, 100, 0, 640); let x = 500; let y = 100; let t = 0;
      for (let k = 1; k <= 8; k += 1) { const ang = k <= 3 ? lead : want; x += Math.cos(ang) * 10; y += Math.sin(ang) * 10; t += 10; inp.move(1, x, y, t); } inp.up(1, x, y, t);
      const a = inp.poll(t + 1).actions.find((z) => z.type === 'swipe'); if (!a) continue; let d = Math.abs(Math.atan2(a.dy, a.dx) - want); if (d > Math.PI) d = 2 * Math.PI - d; errs.push(d * 180 / Math.PI); }
    TUNE.input.swipeEndPx = 0; return `${f1(errs.reduce((a, b) => a + b, 0) / errs.length)} / ${f1(Math.max(...errs))}`; };
  console.log(`    쓸기 방향 오차(도, 평균 / 최대): 시작~끝 전체 ${trial(0)} | 끝 10px ${trial(10)}`);
}
void TUNE;
