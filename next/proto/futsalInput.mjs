// 포인터 이벤트 → 이동 벡터와 행동 목록. DOM 없는 순수 코드(시간은 인자로 받는다).
// 왼쪽 반에 처음 닿은 손가락 = 이동 전용(보이지 않는 조이스틱). 쓸기와 꾹은 두 번째(오른쪽) 손가락으로만 한다.
// 행동 3종: 콕(tap) = 20px 이하 + 250ms 이내(20~35px는 미끄러진 콕), 꾹(hold) = 20px 이하로 0.25초가 되는 순간 발동,
// 쓸기(swipe) = 35px 이상 + 0.5px/ms 이상. 입력 버퍼 150ms. 더블탭은 쓰지 않는다.
import { TUNE, classifyGesture } from './futsalRules.mjs';

export function createInput() {
  const T = TUNE.input;
  let sens = T.sensitivity; // 입력 민감도(0.7~1.3): 클수록 꾹이 빨리 발동하고 쓸기가 가볍게 인식된다
  const fingers = new Map();
  let moverId = null;
  const joy = { x: 0, y: 0 };
  const hist = []; // 조이스틱 튕기기(개인기) 판정용 최근 벡터
  let flipCool = 0;
  let lastSwipe = null; // 손을 뗀 쓸기 궤적(0.3초 남겨서 보여 준다)
  let queue = [];
  const push = (a) => { queue.push(a); };
  const holdMs = () => T.holdMs / sens;

  const api = {
    setSensitivity(s) { sens = Math.min(1.3, Math.max(0.7, s)); },
    get sensitivity() { return sens; },
    // w: 캔버스 표시 폭(px). 왼쪽 반 판정에 쓴다.
    down(id, x, y, t, w) {
      const left = x < w / 2;
      if (moverId == null && left) { moverId = id; fingers.set(id, { role: 'move', x0: x, y0: y, t0: t, moved: false }); joy.x = 0; joy.y = 0; hist.length = 0; }
      else fingers.set(id, { role: 'action', x0: x, y0: y, t0: t, x, y, moved: false, fired: false });
    },
    move(id, x, y, t) {
      const f = fingers.get(id);
      if (!f) return;
      if (f.role === 'action') {
        f.x = x; f.y = y;
        if (Math.hypot(x - f.x0, y - f.y0) > T.tapMove) f.moved = true; // 20px를 넘으면 꾹은 취소된다
        (f.trail ??= [{ x: f.x0, y: f.y0 }]).push({ x, y }); if (f.trail.length > 24) f.trail.shift();
        return;
      }
      const dx = x - f.x0; const dy = y - f.y0;
      if (!f.moved && Math.hypot(dx, dy) < T.deadzone) { joy.x = 0; joy.y = 0; return; }
      f.moved = true;
      let jx = dx / T.joyRadius; let jy = dy / T.joyRadius; const l = Math.hypot(jx, jy);
      if (l > 1) { jx /= l; jy /= l; }
      joy.x = jx; joy.y = jy;
      hist.push({ t, x: jx, y: jy }); while (hist.length && t - hist[0].t > T.flipMs) hist.shift();
      // 개인기(시연판의 현재 동작): 180ms 안에 한 방향 0.6 이상에서 반대 방향 0.6 이상으로 튕김
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
        // 이동 손가락이 거의 안 움직이고 짧게 떼어졌으면 콕(현재 동작 유지)
        if (!f.moved && Math.hypot(x - f.x0, y - f.y0) <= T.leftTapMove && t - f.t0 <= T.tapMs) push({ type: 'tap', x: f.x0, y: f.y0, at: t });
        return;
      }
      if (f.fired) return; // 꾹은 이미 발동했다
      const dx = x - f.x0; const dy = y - f.y0; const m = Math.hypot(dx, dy); const ms = Math.max(1, t - f.t0);
      const k = classifyGesture({ m, ms, sens });
      if (k === 'swipe') { lastSwipe = { pts: [...(f.trail ?? [{ x: f.x0, y: f.y0 }]), { x, y }], t }; push({ type: 'swipe', v: m / ms, dx: dx / m, dy: dy / m, at: t }); }
      else if (k === 'tap') push({ type: 'tap', x: f.x0, y: f.y0, at: t });
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
      // 꾹: 20px 안에서 0.25초가 되는 순간 발동한다(떼지 않아도 된다)
      for (const f of fingers.values()) if (f.role === 'action' && !f.fired && !f.moved && now - f.t0 >= holdMs()) { f.fired = true; push({ type: 'hold', x: f.x0, y: f.y0, at: now }); }
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
    // 꾹을 기다리는 손가락의 진행(0~1). 슬라이딩 링이 0.25초에 걸쳐 차오르는 표시용. 없으면 null.
    holdProgress(now) {
      for (const f of fingers.values()) if (f.role === 'action' && !f.fired && !f.moved) return Math.min(1, (now - f.t0) / holdMs());
      return null;
    },
    // 지금 그리는 중이거나 방금 끝난 쓸기 궤적(px 점 목록). 화면 피드백용(흰색 얇은 선, 0.3초).
    swipeTrail(now) {
      for (const f of fingers.values()) if (f.role === 'action' && f.trail && f.moved) return { pts: f.trail, live: true };
      if (lastSwipe && now - lastSwipe.t < 300) return { pts: lastSwipe.pts, live: false, age: now - lastSwipe.t };
      return null;
    },
    get moverId() { return moverId; },
    get pending() { return queue.length; },
  };
  return api;
}
