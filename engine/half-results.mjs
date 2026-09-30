// 전/후반기 승점(시즌 시뮬레이션이 이미 계산한 값)을 19경기의 실제 승/무/패와 스코어로
// 풀어 보여주기 위한 순수 함수. 합계 승점은 항상 반올림한 입력 승점과 정확히 같다 -
// 화면이 연출용 가짜 숫자가 아니라 "이 승점이 어떻게 쌓였는지"를 그대로 보여준다.
export const MATCHES_PER_HALF = 19;

export function generateHalfResults(points, rng = Math.random) {
  const n = MATCHES_PER_HALF;
  let P = Math.max(0, Math.min(3 * n, Math.round(points)));

  // 3w + d = P, w + d <= n 을 만족하는 (승, 무) 조합. 56점처럼 만들 수 없는 값은 한 점씩 내린다.
  let options = [];
  for (; P >= 0; P--) {
    options = [];
    for (let w = Math.floor(P / 3); w >= 0; w--) {
      const d = P - 3 * w;
      if (w + d <= n) options.push({ w, d });
    }
    if (options.length) break;
  }
  // 무승부는 보통 4~6번이라 그 근처 조합을 더 자주 뽑는다.
  const weights = options.map((o) => 1 / (1 + Math.abs(o.d - 5)));
  let roll = rng() * weights.reduce((a, b) => a + b, 0);
  const { w, d } = options.find((_, i) => (roll -= weights[i]) < 0) ?? options.at(-1);
  const l = n - w - d;

  const results = [...Array(w).fill('W'), ...Array(d).fill('D'), ...Array(l).fill('L')];
  for (let i = results.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [results[i], results[j]] = [results[j], results[i]];
  }

  let total = 0;
  return results.map((result) => {
    let gf; let ga;
    if (result === 'W') { gf = 1 + Math.floor(rng() * 3.2); ga = Math.floor(rng() * gf); }
    else if (result === 'L') { ga = 1 + Math.floor(rng() * 3.2); gf = Math.floor(rng() * ga); }
    else {
      const r = rng();
      gf = ga = r < 0.25 ? 0 : r < 0.6 ? 1 : r < 0.9 ? 2 : 3;
    }
    total += result === 'W' ? 3 : result === 'D' ? 1 : 0;
    return { result, gf, ga, points: total };
  });
}
