// ---------- v4: 내 공격 화면(Attack 상태 머신을 그린다). 월드 2400 단위, 선수 1.5배, 글자 없음 ----------
const GX = FIELD.x1;
const ROLE_NUM = { MF: 8, WB: 2, WG: 7, ST: 9, GK: 1, DF: 4 };

// 필드(월드 전체): 세로 스트라이프, 흰 라인, 원형 센터서클, 박스, 골대, 위아래 관중석과 LED 광고판. 보이는 구간만 그린다.
const hash2 = (a, b) => (((a * 73856093) ^ (b * 19349663)) >>> 0) % 997;
function drawPitch() {
  const { x0, x1, y0, y1, gy, w, h } = FIELD;
  const L = cam.x - W / (2 * cam.z) - 24; const R = cam.x + W / (2 * cam.z) + 24;
  ctx.fillStyle = C.turf; ctx.fillRect(Math.max(0, L), 0, Math.min(w, R) - Math.max(0, L), h);
  const n = 48; const sw = (x1 - x0) / n;
  for (let i = Math.max(0, Math.floor((L - x0) / sw)); i < Math.min(n, Math.ceil((R - x0) / sw)); i += 1) { ctx.fillStyle = i % 2 ? C.stripe : C.grass; ctx.fillRect(x0 + i * sw, y0, sw + 0.6, y1 - y0); }
  const LC = 'rgba(255,255,255,0.85)'; ctx.strokeStyle = LC; ctx.lineWidth = 2.4;
  ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
  const mid = (x0 + x1) / 2;
  line(mid, y0, mid, y1, LC, 2.4);
  ctx.beginPath(); ctx.arc(mid, gy, 52, 0, 7); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(mid, gy, 3, 0, 7); ctx.fill();
  for (const right of [false, true]) {
    const gx = right ? x1 : x0; const dir = right ? -1 : 1;
    ctx.strokeStyle = LC; ctx.lineWidth = 2.4;
    ctx.strokeRect(right ? gx - 190 : gx, gy - 100, 190, 200); // 페널티 에어리어
    ctx.strokeRect(right ? gx - 66 : gx, gy - 50, 66, 100); // 골 에어리어
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(gx + dir * 130, gy, 2.6, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(gx + dir * 130, gy, 52, right ? Math.PI * 0.66 : -Math.PI * 0.34, right ? Math.PI * 1.34 : Math.PI * 0.34); ctx.stroke(); // D박스
    // 골대: 골라인 뒤로 뻗은 그물과 흰 포스트
    const nx = right ? gx : gx - 28;
    ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fillRect(nx, gy - GOAL_HALF, 28, GOAL_HALF * 2);
    for (let i = 0; i <= 6; i += 1) line(nx, gy - GOAL_HALF + i * (GOAL_HALF / 3), nx + 28, gy - GOAL_HALF + i * (GOAL_HALF / 3), 'rgba(255,255,255,0.35)', 1);
    for (let i = 0; i <= 5; i += 1) line(nx + i * 5.6, gy - GOAL_HALF, nx + i * 5.6, gy + GOAL_HALF, 'rgba(255,255,255,0.35)', 1);
    ctx.fillStyle = '#fff'; ctx.fillRect(gx - 3, gy - GOAL_HALF - 3, 6, 6); ctx.fillRect(gx - 3, gy + GOAL_HALF - 3, 6, 6); ctx.fillRect(nx + (right ? 27 : 0), gy - GOAL_HALF, 2, GOAL_HALF * 2);
  }
  ctx.strokeStyle = LC; ctx.lineWidth = 2.4;
  for (const [cx, cy, a] of [[x0, y0, 0], [x1, y0, Math.PI / 2], [x1, y1, Math.PI], [x0, y1, Math.PI * 1.5]]) { ctx.beginPath(); ctx.arc(cx, cy, 12, a, a + Math.PI / 2); ctx.stroke(); }
  // 관중석(도트)과 LED 광고판: 위 0~56, 아래 370~424
  const crowdRows = (ya, yb) => {
    ctx.fillStyle = C.crowdBg; ctx.fillRect(Math.max(0, L), ya, Math.min(w, R) - Math.max(0, L), yb - ya);
    const pal = ['#38bdf8', '#ef4444', '#f8fafc', '#f59e0b', '#1e293b'];
    for (let iy = 0; iy < Math.floor((yb - ya) / 6); iy += 1) for (let ix = Math.floor(L / 6); ix < Math.ceil(R / 6); ix += 1) { const k = hash2(ix, iy + ya); if (k % 5 === 4) continue; ctx.globalAlpha = 0.85; ctx.fillStyle = pal[k % 5]; ctx.fillRect(ix * 6 + (k % 3), ya + iy * 6 + (k % 2), 3, 3); }
    ctx.globalAlpha = 1;
  };
  crowdRows(0, 32); crowdRows(y1 + 54, h);
  for (const ay of [32, y1 + 6]) {
    ctx.fillStyle = C.aboard; ctx.fillRect(Math.max(0, L), ay, Math.min(w, R) - Math.max(0, L), 18); ctx.fillStyle = '#881337'; ctx.fillRect(Math.max(0, L), ay, Math.min(w, R) - Math.max(0, L), 1.5); ctx.fillRect(Math.max(0, L), ay + 16.5, Math.min(w, R) - Math.max(0, L), 1.5);
    ctx.save(); ctx.beginPath(); ctx.rect(Math.max(0, L), ay, Math.min(w, R) - Math.max(0, L), 18); ctx.clip();
    ctx.font = '700 11px "Silkscreen","Barlow Condensed",monospace'; ctx.fillStyle = C.led; ctx.textAlign = 'left';
    const msg = 'FM-LITE STADIUM   •   LEAGUE 2026/27   •   MATCH DAY   •   TICKETS & HOSPITALITY   •   '; const mw = 700; const off = (performance.now() / 30) % mw;
    for (let k = Math.floor(L / mw) - 1; k < Math.ceil(R / mw) + 1; k += 1) ctx.fillText(msg, k * mw - off, ay + 13);
    ctx.restore();
  }
}

function drawPlayer(A, p) {
  const mine = p.team === 'me';
  const gk = p.role === 'GK';
  const kit = gk ? (mine ? C.gkHome : C.gkAway) : (mine ? C.home : C.away);
  const num = ROLE_NUM[p.role] ?? '';
  let lay = p.lay ? Math.min(1.4, p.lay) : 0;
  if (gk && p.dive && (A.phase === 'shotFlight' || A.phase === 'result' || A.phase === 'rebound')) lay = 1.1 * p.dive;
  sprite(p.x, p.y, kit, { num, anim: lay ? null : p.anim, lay, kick: p.kick > 0, skin: (p.id.charCodeAt(0) + p.id.length) % 2, ring: null });
  if (A.ball.holder === p && !A.result) marker(p.x, p.y);
}
const foot = (y) => y + 13 * SPR;
function ringAt(x, y, color, w = 2.2, rx = 17, ry = 6.5, alpha = 1) {
  ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = w; ctx.beginPath(); ctx.ellipse(x, foot(y), rx * (SPR / 1.5) * 1.5, ry * (SPR / 1.5) * 1.5, 0, 0, 7); ctx.stroke(); ctx.globalAlpha = 1;
}
// 정밀 슛의 두 게이지: 슈터 머리 위(월드 좌표). 위 = 세기(또는 휘는 정도), 아래 = 방향. 글자 없음.
function drawShotGauges(A) {
  const g = A.gauge; const sh = A.shooter ?? A.st; const gw = 130; const x0 = sh.x - gw / 2; const yTop = sh.y - 13 * SPR - 44;
  const bar = (y, active, done, val, draw) => {
    ctx.fillStyle = 'rgba(8,12,20,0.8)'; ctx.fillRect(x0 - 4, y - 4, gw + 8, 15);
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(x0, y, gw, 7);
    draw(x0, y);
    ctx.fillStyle = done ? '#94a3b8' : '#fff'; ctx.fillRect(x0 + val * gw - 1.5, y - 3, 3, 13);
    if (active) { ctx.strokeStyle = '#fde047'; ctx.lineWidth = 1.5; ctx.strokeRect(x0 - 4, y - 4, gw + 8, 15); }
  };
  const seg = (x, y, a, b, c) => { ctx.fillStyle = c; ctx.fillRect(x + a * gw, y, (b - a) * gw, 7); };
  const powerActive = A.phase === 'pow';
  const [lo, hi] = powerWindow(stats.shooting, { curl: g.curl, mul: g.mul });
  bar(yTop, powerActive, !powerActive, powerActive ? A.gaugeNow() : g.power, (x, y) => seg(x, y, lo, hi, '#22c55e'));
  const dirActive = A.phase === 'dir' || A.phase === 'rebound';
  if (dirActive || A.phase === 'pow') bar(yTop + 17, dirActive, false, dirActive ? A.gaugeNow() : 0, (x, y) => { seg(x, y, 0, 0.0625, '#ef4444'); seg(x, y, 0.0625, 0.104, '#fde047'); seg(x, y, 0.104, 0.3125, '#22c55e'); seg(x, y, 0.3125, 0.6875, '#64748b'); seg(x, y, 0.6875, 0.896, '#22c55e'); seg(x, y, 0.896, 0.9375, '#fde047'); seg(x, y, 0.9375, 1, '#ef4444'); });
  const left = clamp(1 - (g.t ?? 0) / g.limit, 0, 1); ctx.fillStyle = left < 0.25 ? '#ef4444' : '#e2e8f0'; ctx.fillRect(x0, yTop + 36, gw * left, 2);
}
// 처음 3번의 내 공격에만 보이는 손가락 안내(선수 옆, 번호를 가리지 않는 위치, 글자 없음)
function drawHints(A) {
  if (A.easy <= 1) return;
  const at = (x, y) => toScreen(x, y);
  if (A.phase === 'first') { const c = Object.values(A.cands).find((q) => q.state === 'open'); if (c) { const s = at(c.me.x + 46, c.me.y + 6); pulse(s.x, s.y, 10); ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.arc(s.x, s.y, 6, 0, 7); ctx.fill(); } }
  else if (A.phase === 'aim') { const h = A.aim.holder; const s = at(h.x + 40, h.y + 18); finger(s.x, s.y, -46, 14); }
  else if (A.phase === 'run') { const r = A.runner; const s = at(r.x + 60, r.y); if (A.inRange) finger(s.x, s.y, r.role === 'WG' ? 58 : -58, 0); else finger(s.x, s.y - 26, 0, 52); }
  else if (A.phase === 'loose') { const s = at(A.ball.x + 34, A.ball.y - 10); pulse(s.x, s.y, 10); }
  else if (A.phase === 'header') { const s = at(A.st.x + 40, A.st.y - 20); pulse(s.x, s.y, 10); }
  else if (A.phase === 'pow' || A.phase === 'dir') { const sh = A.shooter; const s = at(sh.x + 78, sh.y - 46); pulse(s.x, s.y, 10); }
}
function drawPlay(A) {
  SPR = 1.5;
  world(() => {
    drawPitch();
    if (A.phase === 'first' || A.phase === 'aim') { // 스트라이커의 침투 경로(점선)
      const st = A.st; const ex = Math.min(st.x + 360, GX - 200);
      ctx.strokeStyle = 'rgba(253,224,71,0.6)'; ctx.lineWidth = 2.4; ctx.setLineDash([7, 8]); ctx.beginPath(); ctx.moveTo(st.x, foot(st.y)); ctx.lineTo(ex, foot(st.y)); ctx.stroke(); ctx.setLineDash([]);
    }
    if (A.phase === 'run' || A.phase === 'loose') { // 슛 사거리(골문에서의 거리)
      ctx.strokeStyle = A.inRange ? 'rgba(253,224,71,0.9)' : 'rgba(255,255,255,0.3)'; ctx.lineWidth = A.inRange ? 3 : 2; ctx.setLineDash([9, 10]);
      ctx.beginPath(); ctx.arc(GX, FIELD.gy, A.range, Math.PI * 0.5, Math.PI * 1.5); ctx.stroke(); ctx.setLineDash([]);
    }
    for (const p of [...A.players].sort((a, b) => a.y - b.y)) drawPlayer(A, p);
    if (A.phase === 'run') { // 위협 예고(1.0초 전): 접촉 지점 링과 수비수 발밑 링
      for (const th of A.threats) {
        if (th.state !== 'warn' && th.state !== 'windup') continue;
        const k = clamp(1 - (th.tc - A.runClock) / TUNE.warnLead, 0, 1);
        ctx.strokeStyle = th.state === 'windup' ? '#ef4444' : 'rgba(239,68,68,0.7)'; ctx.lineWidth = th.state === 'windup' ? 3.4 : 2.2; ctx.beginPath(); ctx.arc(th.P.x, foot(th.P.y), 40 - k * 14, 0, 7); ctx.stroke();
        if (th.state === 'windup') { ctx.fillStyle = 'rgba(239,68,68,0.22)'; ctx.beginPath(); ctx.arc(th.P.x, foot(th.P.y), 26, 0, 7); ctx.fill(); }
        for (const q of th.defs) ringAt(q.p.x, q.p.y, '#ef4444', 2.6, 20, 8, 0.6 + 0.4 * k);
      }
      const r = A.runner;
      if (A.runClock < A.skill.until) ringAt(r.x, r.y, '#38bdf8', 3, 24, 10);
      else if (A.skill.cd > 0) arcRing(r.x, foot(r.y), 22, 1 - A.skill.cd / TUNE.skillCD, 'rgba(255,255,255,0.5)');
      if (A.inRange) { ringAt(r.x, r.y, C.yellow, 2.6, 24, 9.5); arcRing(r.x, r.y - 13 * SPR - 24, 8, 1 - A.rangeT / TUNE.rangeWindow, C.yellow); }
    }
    if (A.phase === 'first') {
      for (const c of Object.values(A.cands)) {
        const m = c.me; const pls = 0.5 + 0.5 * Math.sin(performance.now() / 110);
        if (c.state === 'closed') ringAt(m.x, m.y, '#ef4444', 2.2, 20, 8, 0.5);
        else if (c.state === 'warn') ringAt(m.x, m.y, '#fde047', 2.8, 21, 8.5, 0.6 + 0.4 * pls);
        else if (c.state === 'open') { ringAt(m.x, m.y, '#22c55e', 4, 22, 9.5, 0.7 + 0.3 * pls); arcRing(m.x, foot(m.y), 19, (c.close - A.pt) / (c.close - c.open), '#22c55e'); }
        else ringAt(m.x, m.y, '#ef4444', 1.6, 20, 8, 0.25);
      }
      arcRing(A.mf.x, foot(A.mf.y), 24, clamp((A.arrival - A.pt) / A.arrival, 0, 1), '#ef4444'); // 압박 도달까지 남은 시간: 미드 주변 링
    }
    if (A.phase === 'aim') {
      const h = A.aim.holder; const pl = A.aim.pull;
      arcRing(h.x, foot(h.y), 25, 1 - A.prt / TUNE.aimMax, '#38bdf8');
      if (pl && Math.hypot(pl.dx, pl.dy) >= TUNE.aimMinPull) {
        const len = Math.hypot(pl.dx, pl.dy); const loft = len < TUNE.aimLowPull; const a = Math.atan2(-pl.dy, -pl.dx);
        const Lr = loft ? 280 : 520; const ex = h.x + Math.cos(a) * Lr; const ey = h.y + Math.sin(a) * Lr;
        ctx.strokeStyle = loft ? '#67e8f9' : '#ffffff'; ctx.lineWidth = 3; ctx.setLineDash([8, 8]); ctx.beginPath(); ctx.moveTo(h.x, h.y);
        if (loft) ctx.quadraticCurveTo((h.x + ex) / 2, Math.min(h.y, ey) - 70, ex, ey); else ctx.lineTo(ex, ey);
        ctx.stroke(); ctx.setLineDash([]);
        ctx.beginPath(); ctx.arc(ex, ey, 8, 0, 7); ctx.stroke();
      }
    }
    if (A.phase === 'loose') { // 루즈볼 확보: 공 주변의 수축 링 하나
      const b = A.ball; const k = A.prt / TUNE.looseTarget; const w = looseWindow(stats.dribble, A.easy);
      const okNow = Math.abs(A.prt - TUNE.looseTarget) <= w;
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.arc(b.x, b.y, 14, 0, 7); ctx.stroke();
      ctx.strokeStyle = okNow ? '#22c55e' : '#fde047'; ctx.lineWidth = okNow ? 5 : 3.4; ctx.beginPath(); ctx.arc(b.x, b.y, Math.max(14, lerp(60, 14, Math.min(1, k))), 0, 7); ctx.stroke();
    }
    if (A.phase === 'header') { // 헤더: 슈터 머리 주변의 수축 링
      const st = A.st; const k = A.prt / TUNE.headerPeak; const w = headerWindow(stats.finishing, A.header.mul) * A.easy;
      const okNow = Math.abs(A.prt - TUNE.headerPeak) <= w; const cy = st.y - 13 * SPR;
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.arc(st.x, cy, 18, 0, 7); ctx.stroke();
      ctx.strokeStyle = okNow ? '#22c55e' : '#fde047'; ctx.lineWidth = okNow ? 5 : 3.4; ctx.beginPath(); ctx.arc(st.x, cy, Math.max(18, lerp(80, 18, Math.min(1, k))), 0, 7); ctx.stroke();
    }
    if (A.phase === 'pow' || A.phase === 'dir' || A.phase === 'rebound') drawShotGauges(A);
    ball(A.ball.x, A.ball.y, A.ball.z);
  });
  drawHints(A);
  // 조준·슛 슬로우 때 가장자리를 살짝 어둡게
  if (A.slow < 1 || A.phase === 'aim') { const gr = ctx.createRadialGradient(W / 2, H / 2, 120, W / 2, H / 2, 360); gr.addColorStop(0, 'rgba(8,12,20,0)'); gr.addColorStop(1, 'rgba(8,12,20,0.5)'); ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H); }
  // 뒤 추격이 0.14초 이하로 붙으면 가장자리 비네팅, 니어미스는 가장자리 펄스
  if (A.phase === 'run' && A.presserGap <= TUNE.vignetteGap) { const gr = ctx.createRadialGradient(W / 2, H / 2, 150, W / 2, H / 2, 380); gr.addColorStop(0, 'rgba(239,68,68,0)'); gr.addColorStop(1, `rgba(239,68,68,${0.38 + 0.12 * Math.sin(performance.now() / 70)})`); ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H); }
  if (fx.edge > 0) { ctx.strokeStyle = `rgba(255,255,255,${fx.edge})`; ctx.lineWidth = 8; ctx.strokeRect(0, 0, W, H); }
  SPR = 1;
}
// Attack 이벤트 → 소리, 정지, 흔들림, 파티클
function onPlayEvent(name, d) {
  const A = play;
  if (name === 'pass') sfx.ok();
  else if (name === 'tap') sfx.tap();
  else if (name === 'skill') { sfx.sprint(); }
  else if (name === 'skillOK') { sfx.perfect(); fx.freeze = TUNE.skillHitstop; fx.shake = 5; fx.edge = 0.5; burst(d.by.x, d.by.y, C.home, 14, 160); }
  else if (name === 'warn') tone(240, 0.06, 'square', 0.025);
  else if (name === 'nearMiss') { tone(900, 0.07, 'square', 0.04, 400); fx.edge = 0.7; A.slowTo(0.5, 0.08); }
  else if (name === 'loose') { sfx.bad(); fx.shake = 5; fx.freeze = 0.04; }
  else if (name === 'secured') { sfx.ok(); burst(A.runner.x, A.runner.y, C.home, 10, 120); }
  else if (name === 'kick' || name === 'instant') sfx.tap();
  else if (name === 'rebound') { sfx.save(); fx.shake = 3; }
  else if (name === 'result') onPlayResult(d);
}
function onPlayResult({ kind }) {
  const A = play;
  if (kind === 'goal') { if (match.on) { hud.me += 1; match.seq[match.n - 1] = 'goal'; } sfx.goal(); fx.flash = 0.9; fx.shake = 12; fx.freeze = 0.1; burst(GX - 40, FIELD.gy, TEAM, 40, 260); burst(GX - 40, FIELD.gy, WHITE, 16, 200); }
  else if (kind === 'save' || kind === 'post') { sfx.save(); fx.shake = 5; fx.freeze = 0.05; burst(GX - 40, FIELD.gy, WHITE, 14, 150); }
  else { sfx.bad(); fx.shake = 3; if (A.result.why === 'tackle' || A.result.why === 'loose') burst(A.runner.x, A.runner.y, '#c94b4b', 12, 140); }
}
