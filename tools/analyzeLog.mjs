#!/usr/bin/env node
// 플레이 기록(JSON) 분석: 로그를 재생하면서 텍스트 보고서를 출력한다. 사용법: node tools/analyzeLog.mjs <로그.json>
import { readFileSync } from 'node:fs';
import { replayLog, controlState, BUILD } from '../next/proto/futsalLog.mjs';

const file = process.argv[2];
if (!file) { console.error('사용법: node tools/analyzeLog.mjs <futsal-log-....json>'); process.exit(1); }
const log = JSON.parse(readFileSync(file, 'utf8'));
const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : '-'); const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : '-'); const pct = (a, b) => (b ? `${(100 * a / b).toFixed(0)}%` : '-');
const W = 40; const H = 20;

// 재생하면서 프레임 단위 지표를 모은다: 입력이 있는데 조종 선수가 못 움직인 구간, 체력 곡선
const blocked = []; let seg = null; const stamina = []; let nextSample = 0; let elapsed = 0;
const res = replayLog(log, {
  onFrame(M, dt, input) {
    elapsed += dt; const me = M.players[M.control]; const mv = input.move; const mag = mv ? Math.hypot(mv.x, mv.y) : 0;
    if (M.real >= nextSample && M.phase === 'play') { stamina.push({ clock: Math.round(M.clock), me: me ? me.ratio : null, team: M.players.filter((p) => p.team === 0 && !p.gk).reduce((a, p) => a + p.ratio, 0) / 4 }); nextSample += 30; }
    let reason = null;
    if (mag > 0.3 && me) {
      const sp = Math.hypot(me.vx, me.vy); const atWall = (me.x < 0.6 && mv.x < 0) || (me.x > W - 0.6 && mv.x > 0) || (me.y < 0.6 && mv.y < 0) || (me.y > H - 0.6 && mv.y > 0);
      if (M.phase === 'deadball' && M.restart?.team === 0) reason = M.restart.kind === 'kickoff' && M.restart.wait ? '킥오프 대기(받을 동료 고르는 중, 정상)' : '재개 대기(받을 동료 고르는 중, 정상)';
      else if (M.phase === 'play' && M.follow?.on && M.ball.st === 'pass') reason = '이어받기 자동 이동(같은 방향 입력 무시, 정상)';
      else if (M.phase === 'play' && sp < 0.5 && !atWall) { const cs = controlState(M); reason = cs.length ? cs.join('+') : (M.autoCtl ? 'AI 전환' : '이유 불명(몸싸움이나 막힘?)'); }
    }
    if (reason) { if (seg && seg.reason === reason) seg.sec += dt; else { if (seg) blocked.push(seg); seg = { reason, sec: dt, at: elapsed, clock: Math.round(M.clock), who: me?.id }; } } else if (seg) { blocked.push(seg); seg = null; }
  },
});
if (seg) blocked.push(seg);
const ev = res.events; const by = (k) => ev.filter((e) => e.kind === k);
const out = []; const P = (s = '') => out.push(s);

P(`=== 풋살 플레이 기록 분석 ===`);
P(`파일 ${file}`); P(`build ${log.build}${log.build !== BUILD ? ` (이 스크립트의 build는 ${BUILD}: 규칙이 다를 수 있음)` : ''}, seed ${log.seed}, 기기 ${log.device?.w ?? '?'}x${log.device?.h ?? '?'}, 입력 민감도 ${log.device?.sens ?? '?'}`);
const same = JSON.stringify(res.summary) === JSON.stringify(log.summary); P(`재생 일치 검사: ${same ? '요약 통계 일치(재생 신뢰 가능)' : '불일치! build나 tune이 다르거나 기록이 손상됨'}`);
const s = res.summary; P(`결과 ${s.score[0]}:${s.score[1]}  슛 ${s.shots.join('/')}  패스 ${s.passes.join('/')}(성공 ${s.passOk.join('/')})  가로채기 ${s.intercepts.join('/')}  태클 성공 ${s.tackleOk.join('/')} 실패 ${s.tackleFails.join('/')}  선방 ${s.saves.join('/')}`);

P(); P('--- 쓸기 각도와 공 궤적 각도의 오차(내 슛) ---');
const sh = by('shot').filter((e) => e.team === 0 && e.ang != null); const errs = sh.map((e) => Math.abs(e.real - e.ang));
P(errs.length ? `슛 ${errs.length}개: 평균 ${f2(errs.reduce((a, b) => a + b, 0) / errs.length)}도, 최대 ${f2(Math.max(...errs))}도 (목표 평균 5도 이하)` : '쓸기로 찬 슛이 없다');

P(); P('--- 조이스틱 입력이 있는데 조종 선수가 움직이지 못한 구간 ---');
const byReason = {}; for (const b of blocked) { (byReason[b.reason] ??= { n: 0, sec: 0, max: 0 }); byReason[b.reason].n += 1; byReason[b.reason].sec += b.sec; byReason[b.reason].max = Math.max(byReason[b.reason].max, b.sec); }
if (!Object.keys(byReason).length) P('없다'); for (const [r, v] of Object.entries(byReason)) P(`${r}: ${v.n}번, 합계 ${f1(v.sec)}초, 최장 ${f2(v.max)}초`);

P(); P('--- 조종 선수 전환 ---');
const ctl = by('control'); const cr = {}; for (const e of ctl) cr[e.reason] = (cr[e.reason] ?? 0) + 1; P(`전환 ${ctl.length}번 (${Object.entries(cr).map(([k, v]) => `${k} ${v}`).join(', ') || '-'})`);

P(); P('--- 패스 (내 팀) ---');
const ps = by('pass').filter((e) => e.team === 0); const bin = (e) => (e.score < 2.2 ? '쉬움' : (e.score < 3.3 ? '보통' : '어려움'));
for (const k of ['쉬움', '보통', '어려움']) { const g = ps.filter((e) => bin(e) === k); const ok = g.filter((e) => e.result === 'ok').length; P(`${k}(점수 ${k === '쉬움' ? '<2.2' : (k === '보통' ? '2.2~3.3' : '>3.3')}): ${g.length}개, 성공 ${pct(ok, g.length)}, 가로채기 ${g.filter((e) => e.result === 'intercept').length}, 받는 선수가 못 옴 ${g.filter((e) => e.result === 'late').length}, 밖 ${g.filter((e) => e.result === 'out').length}`); }
const late = ps.filter((e) => e.result === 'late'); if (late.length) P(`못 온 패스의 평균 받는 선수-도착 자리 거리 ${f2(late.reduce((a, e) => a + (e.lateDist ?? 0), 0) / late.length)}m`);
P(`평균 거리 ${f1(ps.reduce((a, e) => a + e.dist, 0) / Math.max(1, ps.length))}m, 평균 패스 선 여유 ${f2(ps.reduce((a, e) => a + e.clr, 0) / Math.max(1, ps.length))}m`);

P(); P('--- 태클 (내 팀) ---');
const tk = by('tackle').filter((e) => e.team === 0);
for (const inp of ['tap', 'hold']) for (const sg of [true, false]) { const g = tk.filter((e) => e.input === inp && e.signal === sg); if (g.length) P(`${inp === 'tap' ? '콕(스탠딩)' : '꾹(슬라이딩)'} ${sg ? '신호 있음' : '신호 없음'}: ${g.length}번, 성공 ${pct(g.filter((e) => e.ok).length, g.length)}`); }
if (!tk.length) P('시도 없음');

P(); P('--- 슛 (내 팀) ---');
const shots = by('shot').filter((e) => e.team === 0); const grades = {}; for (const e of shots) { grades[e.chance] ??= {}; grades[e.chance][e.result] = (grades[e.chance][e.result] ?? 0) + 1; }
P(shots.length ? Object.entries(grades).map(([g, r]) => `${g}: ${Object.entries(r).map(([k, v]) => `${k} ${v}`).join(', ')}`).join(' | ') : '슛 없음');

P(); P('--- 재개와 킥오프 선택 시간(내 팀) ---');
const rs = ev.filter((e) => (e.kind === 'restart' || e.kind === 'kickoffWait') && e.team === 0);
if (!rs.length) P('없음'); else { const how = {}; for (const e of rs) how[e.how] = (how[e.how] ?? 0) + 1; P(`${rs.length}번, 평균 ${f2(rs.reduce((a, e) => a + e.sec, 0) / rs.length)}초, 최장 ${f2(Math.max(...rs.map((e) => e.sec)))}초, 방식 ${Object.entries(how).map(([k, v]) => `${k} ${v}`).join(', ')}`); const kw = rs.filter((e) => e.kind === 'kickoffWait'); if (kw.length) P(`킥오프 대기 ${kw.length}번, 평균 ${f2(kw.reduce((a, e) => a + e.sec, 0) / kw.length)}초`); }

P(); P('--- 체력 곡선(30초 간격, 조종 선수 / 우리 팀 평균) ---');
P(stamina.map((x) => `${Math.floor(x.clock / 60)}:${String(x.clock % 60).padStart(2, '0')} ${pct(x.me, 1)}/${pct(x.team, 1)}`).join('  ') || '-');

P(); P('--- 이상 징후 (종류별 개수와 처음 5개) ---');
const bad = { '입력 무시(0.3초 이상, 이유 있는 비정상)': [], '조종 전환 0.5초 안 반복': [], '패스 받는 선수가 도착 자리에서 3m 넘게 떨어짐': [], '재개/킥오프 선택 12초 초과': [], '슛 각도 오차 15도 초과': [] };
for (const b of blocked) if (b.sec >= 0.3 && !/정상/.test(b.reason)) bad['입력 무시(0.3초 이상, 이유 있는 비정상)'].push(`${f2(b.sec)}초 (${b.reason}), 경기 ${Math.floor(b.clock / 60)}:${String(b.clock % 60).padStart(2, '0')}, 선수 ${b.who}`);
for (let i = 1; i < ctl.length; i += 1) if (ctl[i].t - ctl[i - 1].t < 0.5 && ctl[i].reason === 'nearest-ball') bad['조종 전환 0.5초 안 반복'].push(`${ctl[i - 1].from}→${ctl[i - 1].to}→${ctl[i].to} t=${f1(ctl[i].t)}`);
for (const e of late) if ((e.lateDist ?? 0) > 3) bad['패스 받는 선수가 도착 자리에서 3m 넘게 떨어짐'].push(`${f1(e.lateDist)}m t=${f1(e.t)}`);
for (const e of rs) if (e.sec > 12) bad['재개/킥오프 선택 12초 초과'].push(`${f1(e.sec)}초 t=${f1(e.t)}`);
for (const e of shots) if (e.ang != null && Math.abs(e.real - e.ang) > 15) bad['슛 각도 오차 15도 초과'].push(`${f1(Math.abs(e.real - e.ang))}도 (쓴 ${f1(e.ang)}, 공 ${f1(e.real)}, ${e.chance}) t=${f1(e.t)}`);
const any = Object.entries(bad).filter(([, v]) => v.length); if (!any.length) P('없다'); for (const [k, v] of any) { P(`${k}: ${v.length}건`); for (const x of v.slice(0, 5)) P(`  - ${x}`); }
console.log(out.join('\n'));
