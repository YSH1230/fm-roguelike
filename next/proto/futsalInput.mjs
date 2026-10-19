// 포인터 이벤트 → 이동 벡터와 행동 목록. DOM 없는 순수 코드(시간은 인자로 받는다).
// 왼쪽 반의 첫 손가락 = 이동 전용(보이지 않는 조이스틱). 이동 손가락이 있는 동안 다른 손가락은 화면 어디서든 행동.
// 행동: tap(선수를 탭 = 그 선수에게 패스), dtap(빈 공간 더블탭 = 그 자리로 공간 패스), shot(스와이프: 방향 = 슛 방향, 속도 = 세기). 입력 버퍼 150ms.
import { TUNE } from './futsalRules.mjs';

export function createInput() {
  const T = TUNE.input;
  const fingers = new Map();
  let moverId = null;
  const joy = { x: 0, y: 0 };
  const hist = []; // 조이스틱 튕기기(개인기) 판정용 최근 벡터
  let flipCool = 0;
  let lastTap = null; // 더블탭 판정용
  let queue = [];
  const push = (a) => { queue.push(a); };

  const api = {
    // w: 캔버스 표시 폭(px). 왼쪽 반 판정에 쓴다.
    down(id, x, y, t, w) {
      const left = x < w / 2;
      if (moverId == null && left) { moverId = id; fingers.set(id, { role: 'move', x0: x, y0: y, t0: t, moved: false }); joy.x = 0; joy.y = 0; hist.length = 0; }
      else fingers.set(id, { role: 'action', x0: x, y0: y, t0: t });
    },
    move(id, x, y, t) {
      const f = fingers.get(id);
      if (f && f.role === 'action') { f.x = x; f.y = y; if (f.holdAtMove == null && Math.hypot(x - f.x0, y - f.y0) > T.tapMove) f.holdAtMove = t - f.t0; return; }
      if (!f || f.role !== 'move') return;
      const dx = x - f.x0; const dy = y - f.y0;
      if (!f.moved && Math.hypot(dx, dy) < T.deadzone) { joy.x = 0; joy.y = 0; return; }
      f.moved = true;
      let jx = dx / T.joyRadius; let jy = dy / T.joyRadius; const l = Math.hypot(jx, jy);
      if (l > 1) { jx /= l; jy /= l; }
      joy.x = jx; joy.y = jy;
      hist.push({ t, x: jx, y: jy }); while (hist.length && t - hist[0].t > T.flipMs) hist.shift();
      // 개인기: 180ms 안에 한 방향 0.6 이상에서 반대 방향 0.6 이상으로 튕김
      const mag = Math.hypot(jx, jy);
      if (mag >= T.flipThreshold && t >= flipCool) {
        for (const s of hist) {
          const sm = Math.hypot(s.x, s.y);
          if (sm < T.flipThreshold) continue;
          if ((jx * s.x + jy * s.y) / sm <= -T.flipThreshold) { push({ type: 'dribble', at: t, dx: jx, dy: jy }); flipCool = t + 400; hist.length = 0; break; }
        }
      }
    },
    up(id, x, y, t) {
      const f = fingers.get(id);
      if (!f) return;
      fingers.delete(id);
      if (f.role === 'move') {
        moverId = null; joy.x = 0; joy.y = 0; hist.length = 0;
        // 이동 손가락이 거의 안 움직이고 짧게 떼어졌으면 행동 탭(패스 또는 태클)
        if (!f.moved && Math.hypot(x - f.x0, y - f.y0) <= T.leftTapMove && t - f.t0 <= T.tapMs) push({ type: 'tap', x: f.x0, y: f.y0, at: t });
        return;
      }
      const dx = x - f.x0; const dy = y - f.y0; const m = Math.hypot(dx, dy); const ms = Math.max(1, t - f.t0);
      // 행동 손가락: 탭 = 패스(선수를 탭하면 그 선수, 빈 공간은 더블탭으로 그 자리), 스와이프 = 슛(방향 = 스와이프 방향, 빠를수록 강함)
      if (m <= T.tapMove) {
        if (ms > T.tapMs) return;
        const dbl = lastTap && t - lastTap.t <= T.dtapMs && Math.hypot(x - lastTap.x, y - lastTap.y) <= T.dtapPx;
        push({ type: dbl ? 'dtap' : 'tap', x: f.x0, y: f.y0, at: t });
        lastTap = dbl ? null : { x: f.x0, y: f.y0, t };
        return;
      }
      if (m >= T.flickPx && m / ms >= T.flickSpeed) push({ type: 'shot', v: m / ms, jx: dx / m, jy: dy / m, at: t });
    },
    // 시스템 취소: 이동만 멈추고 이미 쌓인 행동에는 영향이 없다
    cancel(id) {
      const f = fingers.get(id);
      if (!f) return;
      fingers.delete(id);
      if (f.role === 'move') { moverId = null; joy.x = 0; joy.y = 0; hist.length = 0; }
    },
    // canAct: 지금 행동을 받을 수 있는가(패스 비행 중 등이면 false). 못 받는 동안은 150ms까지 보관한다.
    poll(now, canAct = true) {
      const actions = [];
      const keep = [];
      for (const a of queue) {
        if (canAct) actions.push(a);
        else if (now - a.at <= T.buffer) keep.push(a);
      }
      queue = keep;
      const move = (joy.x === 0 && joy.y === 0) ? null : { x: joy.x, y: joy.y };
      return { move, actions };
    },
    get moverId() { return moverId; },
    get pending() { return queue.length; },
  };
  return api;
}
