// 플레이 기록(블랙박스): 경기마다 JSON 하나. 같은 build, tune, seed, frames로 update 루프를 다시 돌리면 같은 결과가 나온다.
// 서버로 보내지 않는다. 개인정보는 넣지 않는다(화면 크기와 입력 민감도만). 형식은 docs/futsal-log-format.md.
import { TUNE } from './futsalRules.mjs';
import { createMatch, update, startSecondHalf, controlState } from './futsalSim.mjs';

export const BUILD = 'P1-20261028-1'; // 규칙이나 기록 형식을 바꿀 때 올린다
export const LOG_VERSION = 1;
const hyp = Math.hypot;
const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;

// 기록과 재생이 똑같이 읽도록 입력을 먼저 양자화한다: dt는 ms, 조이스틱은 소수 2자리, 행동의 숫자는 소수 3자리 이하.
export function quantizeInput(dt, input = {}) {
  const ms = Math.max(1, Math.round(dt * 1000));
  const move = input.move ? { x: r2(input.move.x), y: r2(input.move.y) } : null;
  const actions = (input.actions ?? []).map((a) => { const o = {}; for (const [k, v] of Object.entries(a)) o[k] = typeof v === 'number' ? r3(v) : v; return o; });
  return { ms, input: { move: move && (move.x !== 0 || move.y !== 0) ? move : undefined, actions } };
}
const segD = (px, py, ax, ay, bx, by) => { const dx = bx - ax; const dy = by - ay; const l = dx * dx + dy * dy || 1; const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l)); return hyp(px - (ax + dx * t), py - (ay + dy * t)); };
export const passScore = (dist, clr) => dist / 5 + Math.max(0, 2 - clr); // 패스 난이도 점수(검증 스크립트와 같은 식)

// 이벤트 관찰자: update를 한 번 부를 때마다 after()를 부른다. 기록 중과 재생 중이 같은 코드를 쓴다.
export function createObserver(M, events) {
  let ev = 0; let elapsed = 0; let prevControl = M.control; let pass = null; let shot = null; let track = null; let deadSec = 0;
  const id = (i) => M.players[i]?.id;
  const push = (o) => events.push({ t: r3(elapsed), clock: Math.round(M.clock), ...o });
  return {
    after(dt) {
      elapsed += dt; const S = M.stats; const b = M.ball;
      const fresh = M.events.slice(ev); ev = M.events.length; let passedNow = false;
      for (const e of fresh) {
        if (e.kind === 'kick' && (e.type === 'pass' || e.type === 'spot')) {
          passedNow = passedNow || e.team === 0;
          const t = e.team; const opp = M.players.filter((p) => p.team !== t && !p.gk); const clr = b.from && b.dest ? Math.min(...opp.map((p) => segD(p.x, p.y, b.from.x, b.from.y, b.dest.x, b.dest.y))) : 99;
          pass = { team: t, id: e.id, type: e.type, dist: r2(e.dist), clr: r2(clr), score: r2(passScore(e.dist, clr)), tgt: b.tgt, dest: b.dest ? { x: b.dest.x, y: b.dest.y } : null, ok: S.passOk[t], f: S.passFail[t], ic: S.intercepts[1 - t], late: null, t0: elapsed };
        } else if (e.kind === 'kick' && e.type === 'shot') shot = { team: e.team, id: e.id, ang: e.ang != null ? r2(e.ang) : null, real: r2(e.real), chance: e.chance, power: r2(e.power) };
        else if (['goal', 'save', 'post', 'miss', 'block'].includes(e.kind) && shot) { push({ kind: 'shot', ...shot, result: e.kind }); if (e.kind === 'goal') push({ kind: 'goal', team: e.team, id: e.id }); shot = null; }
        else if (e.kind === 'goal') push({ kind: 'goal', team: e.team, id: e.id });
        else if (e.kind === 'tackle' && e.ok) push({ kind: 'tackle', team: e.team, id: e.id, input: e.slide ? 'hold' : 'tap', signal: !!e.signal, ok: true, victim: e.victim });
        else if (e.kind === 'tackleFail') push({ kind: 'tackle', team: e.team, id: e.id, input: e.slide ? 'hold' : 'tap', signal: !!e.signal, ok: false });
      }
      if (pass) { // 패스 결과: 성공 / 가로채기 / 받는 선수가 도착 자리에 못 옴(late) / 밖으로
        if (pass.late == null && b.st === 'loose' && pass.tgt) pass.late = r2(hyp(pass.tgt.x - pass.dest.x, pass.tgt.y - pass.dest.y));
        const t = pass.team; let res = null;
        if (S.intercepts[1 - t] > pass.ic) res = 'intercept'; else if (S.passOk[t] > pass.ok) res = 'ok'; else if (S.passFail[t] > pass.f) res = pass.late != null && pass.late > 1.2 ? 'late' : 'out';
        if (res) { push({ kind: 'pass', team: t, id: pass.id, type: pass.type, dist: pass.dist, clr: pass.clr, score: pass.score, result: res, recvToDest: pass.tgt ? r2(hyp(pass.tgt.x - pass.dest.x, pass.tgt.y - pass.dest.y)) : null, lateDist: pass.late, sec: r2(elapsed - pass.t0) }); pass = null; }
      }
      if (M.control !== prevControl) { // 조종 선수 전환과 이유
        const reason = passedNow ? 'pass' : (M.phase === 'deadball' ? 'restart' : (b.owner === M.players[M.control] ? 'possession' : 'nearest-ball'));
        push({ kind: 'control', from: id(prevControl), to: id(M.control), reason }); prevControl = M.control;
      }
      if (M.phase === 'deadball' && M.restart) { if (!track) { track = { r: M.restart, kind: M.restart.kind, team: M.restart.team, wait: !!M.restart.wait }; deadSec = 0; } deadSec += dt; }
      else if (track) { push({ kind: track.kind === 'kickoff' && track.wait ? 'kickoffWait' : 'restart', restartKind: track.kind, team: track.team, how: track.r.how ?? 'auto', sec: r2(deadSec) }); track = null; }
    },
  };
}

// 녹화: step(dt, input)이 update를 대신 부른다. frames는 [반복 수, dt(ms), 조이스틱 x, y(없으면 null), 행동 배열(있을 때만)] 또는 마커 객체({k:'half'|'auto'|'gk'|'stance', ...}).
export function createRecorder({ M, seed, home, away, stance = 'balanced', awayStance = 'balanced', device = {} }) {
  const frames = []; const events = []; const obs = createObserver(M, events);
  const log = { version: LOG_VERSION, build: BUILD, tune: JSON.parse(JSON.stringify(TUNE)), seed, stance, awayStance, device, teams: { home: JSON.parse(JSON.stringify(home)), away: JSON.parse(JSON.stringify(away)) }, frames, events, summary: null };
  return {
    log,
    step(dt, input = {}) {
      const q = quantizeInput(dt, input); const mv = q.input.move; const acts = q.input.actions; const mx = mv ? mv.x : null; const my = mv ? mv.y : null; const last = frames[frames.length - 1];
      if (!acts.length && Array.isArray(last) && last.length === 4 && last[1] === q.ms && last[2] === mx && last[3] === my) last[0] += 1;
      else frames.push(acts.length ? [1, q.ms, mx, my, acts] : [1, q.ms, mx, my]);
      update(M, q.ms / 1000, q.input); obs.after(q.ms / 1000);
    },
    marker(m) { frames.push(m); },
    finish() { log.summary = summarize(M); return log; },
  };
}
export function summarize(M) {
  const S = M.stats; return { score: [...M.score], real: r2(M.real), phase: M.phase, half: M.half, shots: [...S.shots], passes: [...S.passes], passOk: [...S.passOk], passFail: [...S.passFail], intercepts: [...S.intercepts], tackleOk: [...(S.tackleOk ?? [0, 0])], tackleFails: [...(S.tackleFails ?? [0, 0])], saves: [...S.saves], goals: S.goals.map((g) => ({ team: g.team, id: g.id, half: g.half, clock: Math.round(g.clock) })) };
}

// 재생: log의 tune을 TUNE에 얹고 같은 순서로 update를 돌린다. onFrame(M, dtSec, input)은 update 직후마다 불린다.
export function replayLog(log, { onFrame } = {}) {
  const saved = JSON.parse(JSON.stringify(TUNE)); const apply = (dst, src) => { for (const [k, v] of Object.entries(src)) { if (v && typeof v === 'object' && !Array.isArray(v) && dst[k] && typeof dst[k] === 'object') apply(dst[k], v); else dst[k] = JSON.parse(JSON.stringify(v)); } };
  const restore = () => apply(TUNE, saved);
  apply(TUNE, log.tune);
  try {
    const M = createMatch({ seed: log.seed, home: log.teams.home, away: log.teams.away, stance: log.stance, awayStance: log.awayStance });
    const events = []; const obs = createObserver(M, events);
    for (const f of log.frames) {
      if (!Array.isArray(f)) { applyMarker(M, f); continue; }
      const [n, ms, mx, my, acts] = f; const input = { move: mx == null ? undefined : { x: mx, y: my }, actions: acts ?? [] };
      for (let i = 0; i < n; i += 1) { update(M, ms / 1000, input); obs.after(ms / 1000); onFrame?.(M, ms / 1000, input); }
    }
    return { M, events, summary: summarize(M) };
  } finally { restore(); }
}
export function applyMarker(M, m) {
  if (m.k === 'half') startSecondHalf(M, m.stance);
  else if (m.k === 'auto') M.autoHuman = !!m.on;
  else if (m.k === 'gk') M.opts.gkAdvance[0] = true;
  else if (m.k === 'stance') M.stance[0] = m.stance;
}
export { controlState };
