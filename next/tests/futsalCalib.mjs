// 슛 찬스 등급 보정용 장면 생성기: 등급별로 같은 상황을 반복해 득점 확률을 잰다(헤드리스 테스트와 보정 스크립트가 함께 쓴다).
import { createMatch, update, demoTeam, chanceGrade } from '../proto/futsalSim.mjs';
import { createRng } from '../engine/rng.mjs';
function scenario(grade, s, seed) {
  const rr = createRng(seed * 7 + 3); const U = (a, b) => a + (b - a) * rr();
  const M = createMatch({ seed, home: demoTeam('H', seed), away: demoTeam('A', seed + 50) });
  for (let i = 0; i < 20; i += 1) update(M, 1 / 60, {});
  const me = M.players.find((p) => p.team === 0 && !p.gk); me.ab.shooting = s; me.ab.strength = 10; me.ratio = 1;
  const gk = M.players.find((p) => p.team === 1 && p.gk); gk.ab.reaction = 10; gk.ab.handling = 10; gk.ratio = 1;
  for (const q of M.players) if (q.team === 1 && !q.gk) { q.x = U(8, 18); q.y = U(2, 18); q.tx = q.x; q.ty = q.y; q.ts = 0; q.vx = 0; q.vy = 0; }
  for (const q of M.players) if (q.team === 0 && q !== me && !q.gk) { q.x = 10; q.y = 3 + 4 * (q.num % 4); q.tx = q.x; q.ty = q.y; q.ts = 0; }
  const side = rr() < 0.5 ? -1 : 1; let aim = 10 + side * 1.1;
  if (grade === 'sure') { me.x = U(34, 35); me.y = U(8.5, 11.5); gk.y = 10 - side * 1.3; }
  else if (grade === 'good') { me.x = U(30, 31.5); me.y = U(7, 13); gk.y = 10; }
  else if (grade === 'normal') { me.x = U(27, 29); me.y = U(6, 14); gk.y = 10; const d = M.players.find((p) => p.team === 1 && !p.gk); d.x = me.x - 1.5; d.y = me.y + 1.4; d.tx = d.x; d.ty = d.y; }
  else { if (rr() < 0.5) { me.x = U(22, 25); me.y = U(6, 14); gk.y = 10; } else { me.x = U(30, 32); me.y = U(7, 13); gk.y = 10; const d = M.players.find((p) => p.team === 1 && !p.gk); d.x = me.x - 0.7; d.y = me.y + 0.5; d.tx = d.x; d.ty = d.y; } }
  gk.tx = gk.x; gk.ty = gk.y; gk.ts = 0; gk.vx = 0; gk.vy = 0;
  M.phase = 'play'; M.restart = null; M.ball.st = 'held'; M.ball.owner = me; M.control = M.players.indexOf(me);
  return { M, me, aim };
}
export function rate(grade, s, N = 1500, base = 1000) {
  let goals = 0, graded = 0;
  for (let i = 0; i < N; i += 1) {
    const { M, me, aim } = scenario(grade, s, base + i);
    graded += chanceGrade(M, me, aim) === grade ? 1 : 0;
    const before = M.score[0]; M.api.shoot(me, aim, false, 0.8);
    for (let k = 0; k < 200 && M.queue.length; k += 1) update(M, 1 / 60, {});
    for (let k = 0; k < 150 && (M.ball.st === 'shot'); k += 1) update(M, 1 / 60, {});
    if (M.score[0] > before) goals += 1;
  }
  return { rate: goals / N, graded: graded / N };
}
