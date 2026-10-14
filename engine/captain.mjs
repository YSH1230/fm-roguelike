// 주장 규칙(순수 함수). stars는 화면에 보이는 별을 돌려주는 함수(starsFor).
// 자동: 첫 시즌 별 → 나이 / 2시즌부터 오래 뛴 순 → 별 → 나이, 선발 중에서. 임명 주장이 선수단에 있으면 그가 주장이다.
export function pickAutoCaptain(lineup, seasonNumber, stars) {
  const byStars = (a, b) => stars(b) - stars(a) || b.age - a.age;
  const cmp = seasonNumber <= 1 ? byStars : (a, b) => (b.seasonsAtClub ?? 0) - (a.seasonsAtClub ?? 0) || byStars(a, b);
  return [...lineup].sort(cmp)[0] ?? null;
}

// appointedId가 선수단에 없으면 자동 규칙으로 돌아가고 lost=true(배너용).
export function resolveCaptain({ squad, lineup, appointedId, seasonNumber, stars }) {
  const appointed = appointedId ? squad.find((p) => p.id === appointedId) : null;
  if (appointed) return { captain: appointed, lost: false };
  return { captain: pickAutoCaptain(lineup, seasonNumber, stars), lost: !!appointedId };
}

// 정원 초과 방출 순서: 화면에 보이는 별이 낮은 순, 같으면 나이 많은 순.
export const sortCapOverflow = (players, stars) => [...players].sort((a, b) => stars(a) - stars(b) || b.age - a.age);
