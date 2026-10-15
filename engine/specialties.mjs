// 감독의 성향은 두 겹이다.
//  1) 전술 철학(영구): 정식 임명 때 하나를 고르고, 승격할 때마다(최대 4번) 한 단계씩 강해진다(Lv1 → Lv5).
//  2) 라커룸 토크(시즌 단위): 시즌을 시작할 때와 마칠 때 라커룸 장면에서 3장 중 하나를 고른다. 고르고 나서야
//     선수들의 반응(장점과 단점)이 정해진다. 같은 토크도 반응이 매번 달라서 외워 둔 정답이 없다. 누적되지 않는다.
// 모티브는 실제 감독 스타일이지만 게임 안에서는 별명만 쓴다. 효과는 engine 계산 곳곳에 fx 객체 하나로 넘긴다.
export const MAX_PHILOSOPHY_LEVEL = 5;

// ---------- 전술 철학 ----------
// kind: 'tag'(그 태그 선수가 3명 이상 있어야 힘이 남) / 'always'. levels = 단계별 효과(Lv1~Lv5).
// 수치는 "승점 환산"으로 맞췄다: Lv1 약 1.5점 → Lv5 약 4.5점(선발 평균 OVR 1점 ≈ 승점 2.5점, tools/balance 분석 참고).
const tagLevels = (tag) => [2, 2.5, 3, 4, 5].map((v) => ({ tagBonus: { [tag]: v } }));
export const PHILOSOPHIES = {
  pressing:      { name: '압박의 전도사', kind: 'tag', tag: 'press', blurb: '전방 압박 태그 선수가 더 강해져요', line: '"공을 뺏는 순간이 가장 빠른 공격이다."', levels: tagLevels('press') },
  possession:    { name: '점유의 철학자', kind: 'tag', tag: 'pass', blurb: '패스 플레이 태그 선수가 더 강해져요', line: '"공을 가진 쪽이 경기를 지배한다."', levels: tagLevels('pass') },
  counter:       { name: '역습의 마술사', kind: 'tag', tag: 'counter', blurb: '역습 태그 선수가 더 강해져요', line: '"기다렸다가, 한 번에 찌른다."', levels: tagLevels('counter') },
  buildup:       { name: '빌드업 설계자', kind: 'tag', tag: 'buildup', blurb: '후방 빌드업 태그 선수가 더 강해져요', line: '"공격은 골키퍼부터 시작한다."', levels: tagLevels('buildup') },
  romantic:      { name: '낭만 공격수', kind: 'tag', tag: 'dribble', blurb: '돌파 태그 선수가 더 강해져요', line: '"지더라도 화끈하게 가자."', levels: tagLevels('dribble') },
  pragmatic:     { name: '실용 피지컬 감독', kind: 'tag', tag: 'physical', blurb: '몸싸움 태그 선수가 더 강해져요', line: '"축구는 결국 힘과 투지다."', levels: tagLevels('physical') },
  totalFootball: { name: '토탈 축구 설계자', kind: 'always', blurb: '포메이션 궁합이 커져요', line: '"모두가 공격하고 모두가 수비한다."', levels: [2, 3, 4, 5, 6].map((v) => ({ formationBonus: v })) },
  catenaccio:    { name: '철벽 수비', kind: 'always', blurb: '수비 라인이 더 단단해져요', line: '"무실점이 곧 승점이다."', levels: [1, 1.5, 2, 2.5, 3].map((v) => ({ defenseLine: v })) },
};
export const PHILOSOPHY_IDS = Object.keys(PHILOSOPHIES);
export const philosophyText = (id, level) => {
  const p = PHILOSOPHIES[id]; const e = p.levels[level - 1];
  if (e.tagBonus) return `${TAG_NAME[p.tag]} 태그 선수 OVR +${e.tagBonus[p.tag]}`;
  if (e.formationBonus) return `포메이션 궁합 +${e.formationBonus} 더(합계 +${e.formationBonus + 1})`;
  return `골키퍼·수비수·수비형 미드필더 선발 OVR +${e.defenseLine}`;
};
const TAG_NAME = { press: '전방 압박', pass: '패스 플레이', counter: '역습', buildup: '후방 빌드업', dribble: '돌파', physical: '몸싸움' };

// 철학 3택1(정식 임명). owned는 이미 고른 철학이 없을 때만 부른다.
export function drawPhilosophyChoices(rng = Math.random, count = 3) {
  const ids = [...PHILOSOPHY_IDS];
  for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
  return ids.slice(0, count);
}
// philosophy = { id, level } | null
// 승격 때 철학을 바꾸면 새 철학은 max(1, 현재 Lv − 2)로 시작한다.
export const switchPhilosophy = (ph, newId) => ({ id: newId, level: Math.max(1, (ph?.level ?? 1) - 2) });
export const levelUpPhilosophy = (ph) => (ph && ph.level < MAX_PHILOSOPHY_LEVEL ? { ...ph, level: ph.level + 1 } : ph);

// ---------- 라커룸 토크 ----------
// 한 토크 = 장면 이름과 대사 + 반응 후보 몇 개. 반응 하나는 { text, fx } (fx에는 장점과 단점이 같이 들어 있다).
// 시즌 시작 토크의 fx는 그 시즌 동안, 시즌 종료 토크의 fx는 오프시즌(노화·지급액·다음 시즌 시작)에 쓰인다.
// fx 키(시즌): chemNow(즉시 조직력) txDecayMult buyDiscount(−면 비싸짐) saleMult pointsFirst pointsSecond formationBonus patienceBonus gradeNoiseMult recoveryDelta
// fx 키(오프시즌): nextStartChem grantMult vetRelief(+면 베테랑 하락 완화, −면 악화) youthGrowth(성장 단계 선수 추가 +1 확률 ±)
export const TALKS = {
  start: {
    roar: { name: '호통', line: '"작년 같은 모습이면 곤란하다!"', tone: 'risky', outcomes: [
      { text: '선수들이 바짝 긴장했어요. 분위기는 잡혔지만 이적 소문이 돌아요.', fx: { chemNow: 6, saleMult: 0.94 } },
      { text: '라커룸이 얼어붙었어요. 집중력은 높지만 사람이 오가는 게 부담스러워요.', fx: { chemNow: 5, txDecayMult: 2 } },
      { text: '기선 제압은 성공. 다만 어린 선수들이 눈치를 봐요.', fx: { chemNow: 4, patienceBonus: -1 } },
    ] },
    cheer: { name: '격려', line: '"여러분을 믿습니다."', tone: 'safe', outcomes: [
      { text: '마음이 편해진 선수들이 훈련에 몰입해요. 하지만 긴장감은 조금 풀렸어요.', fx: { chemNow: -2, saleMult: 1.0, growthBoost: 0.25 } },
      { text: '믿어 주는 감독에게 선수들이 힘을 내요. 대신 승부욕이 조금 줄었어요.', fx: { chemNow: 3, pointsFirst: -1 } },
      { text: '든든한 분위기. 다만 협상에서는 너무 점잖아 보여요.', fx: { chemNow: 4, patienceBonus: -1 } },
    ] },
    gamble: { name: '승부수 선언', line: '"이번에는 후반에 승부를 건다."', tone: 'risky', outcomes: [
      { text: '후반을 겨냥한 계획이 짜여요. 전반은 조금 느슨해져요.', fx: { pointsSecond: 3, pointsFirst: -2 } },
      { text: '체력 안배에 성공. 대신 시작 분위기가 가라앉아요.', fx: { pointsSecond: 2, chemNow: -2 } },
      { text: '큰 승부수. 선수들이 부담을 느끼지만 후반엔 폭발해요.', fx: { pointsSecond: 4, pointsFirst: -3 } },
    ] },
    film: { name: '침묵의 영상', line: '말없이 영상을 틀어 준다.', tone: 'safe', outcomes: [
      { text: '선수들의 장단점이 선명해져요. 분위기는 무거워졌어요.', fx: { gradeNoiseMult: 0.5, chemNow: -2 } },
      { text: '상대 영상을 파고들어요. 협상 때도 침착해지지만 시작이 조금 어색해요.', fx: { patienceBonus: 1, chemNow: -2 } },
      { text: '전술 이해도가 높아져요. 대신 훈련이 딱딱해졌어요.', fx: { formationBonus: 1, chemNow: -3 } },
    ] },
    freedom: { name: '전권 위임', line: '"각자 자기 자리에서 알아서 해라."', tone: 'risky', outcomes: [
      { text: '선수들이 자유를 만끽해요. 하지만 호흡 맞추는 데 시간이 걸려요.', fx: { formationBonus: 1, recoveryDelta: -1 } },
      { text: '프로의식이 올라가요. 다만 팀워크가 느슨해져요.', fx: { buyDiscount: 0.04, recoveryDelta: -1 } },
      { text: '개성이 폭발해요. 하나의 팀 같지는 않아요.', fx: { formationBonus: 2, chemNow: -4 } },
    ] },
    market: { name: '시장 선언', line: '"이번 시장은 내가 이끈다."', tone: 'risky', outcomes: [
      { text: '구단 프런트가 감독을 믿고 움직여요. 팔 때는 사정이 달라져요.', fx: { buyDiscount: 0.06, saleMult: 0.94 } },
      { text: '영입에 힘이 실려요. 선수단 분위기는 조금 불안해요.', fx: { buyDiscount: 0.08, chemNow: -3 } },
      { text: '협상 테이블에서 강해져요. 판매는 신경을 덜 써요.', fx: { patienceBonus: 1, saleMult: 0.94 } },
    ] },
    joke: { name: '농담 한마디', line: '"자, 오늘은 웃으면서 시작하자."', tone: 'safe', outcomes: [
      { text: '웃음이 터져요. 분위기가 좋아요. 긴장감은 조금 풀려요.', fx: { chemNow: 3, pointsFirst: -1 } },
      { text: '라커룸이 화기애애해요. 협상에서도 너그러워 보여요.', fx: { chemNow: 4, patienceBonus: -1 } },
      { text: '가볍게 시작해요. 영입가는 조금 비싸게 받아들여져요.', fx: { chemNow: 3, buyDiscount: -0.03 } },
    ] },
    carrot: { name: '채찍과 당근', line: '"성과를 내면 보상, 못 내면 벌이다."', tone: 'risky', outcomes: [
      { text: '선수들이 눈빛이 달라졌어요. 하지만 서로 경쟁하느라 지쳐요.', fx: { pointsFirst: 2, chemNow: -3 } },
      { text: '성과 보너스가 걸려요. 후반엔 힘이 빠져요.', fx: { pointsFirst: 3, pointsSecond: -1 } },
      { text: '긴장감이 팽팽해요. 팔려 나가는 선수도 있을 거예요.', fx: { pointsFirst: 2, saleMult: 0.94 } },
    ] },
  },
  end: {
    thanks: { name: '감사 연설', line: '"한 해 동안 고생했다."', tone: 'safe', outcomes: [
      { text: '선수들이 뭉클해해요. 하지만 예산 이야기는 꺼내지 못해요.', fx: { nextStartChem: 5, grantMult: 0.96 } },
      { text: '라커룸이 따뜻해요. 어린 선수들은 안주할 수 있어요.', fx: { nextStartChem: 4, youthGrowth: -0.15 } },
      { text: '좋은 마무리. 다만 베테랑들만 더 편해져요.', fx: { nextStartChem: 5, vetRelief: -1 } },
    ] },
    review: { name: '냉정한 총평', line: '"잘못된 건 잘못됐다고 말한다."', tone: 'risky', outcomes: [
      { text: '쓴소리가 약이 돼요. 분위기는 가라앉아요.', fx: { youthGrowth: 0.25, nextStartChem: -3 } },
      { text: '베테랑들이 정신을 차려요. 서운함이 남아요.', fx: { vetRelief: 1, nextStartChem: -3 } },
      { text: '냉정한 평가에 모두가 긴장해요.', fx: { youthGrowth: 0.2, grantMult: 0.97 } },
    ] },
    generation: { name: '세대교체 선언', line: '"이제는 너희 차례다."', tone: 'risky', outcomes: [
      { text: '젊은 선수들의 눈빛이 달라져요. 선배들은 서운해해요.', fx: { youthGrowth: 0.3, vetRelief: -1 } },
      { text: '미래를 믿는 분위기. 당장의 팀 분위기는 어수선해요.', fx: { youthGrowth: 0.25, nextStartChem: -2 } },
      { text: '과감한 선언. 선수단 변화의 폭이 커져요.', fx: { youthGrowth: 0.3, grantMult: 0.96 } },
    ] },
    veterans: { name: '베테랑 헌정', line: '"선배들에게 감사한다. 당신들이 이 팀의 뿌리다."', tone: 'safe', outcomes: [
      { text: '베테랑들이 오래 뛰고 싶어 해요. 어린 선수들은 기회가 줄어요.', fx: { vetRelief: 1, youthGrowth: -0.2 } },
      { text: '존중받은 베테랑들이 힘을 내요. 분위기는 차분해요.', fx: { vetRelief: 1, nextStartChem: -2 } },
      { text: '뿌리를 챙기는 감독. 새로운 변화는 더뎌져요.', fx: { vetRelief: 1, grantMult: 0.97 } },
    ] },
    belt: { name: '허리띠 졸라매기', line: '"내년엔 아껴 써야 한다."', tone: 'risky', outcomes: [
      { text: '재정을 다진 선언. 선수들 얼굴이 굳어요.', fx: { grantMult: 1.08, nextStartChem: -3 } },
      { text: '살림이 좋아져요. 어린 선수들의 훈련 지원이 줄어요.', fx: { grantMult: 1.06, youthGrowth: -0.15 } },
      { text: '긴축 선언. 베테랑에게도 인색해져요.', fx: { grantMult: 1.07, vetRelief: -1 } },
    ] },
    cleanup: { name: '대청소 선언', line: '"필요 없는 선수는 정리한다."', tone: 'risky', outcomes: [
      { text: '선수단이 긴장해요. 새 판이 짜여요.', fx: { youthGrowth: 0.2, nextStartChem: -3 } },
      { text: '정리 대상이 정해져요. 지원금은 조금 줄어요.', fx: { youthGrowth: 0.2, grantMult: 0.96 } },
      { text: '팀의 색이 바뀌어요. 마음이 뒤숭숭한 선수도 있어요.', fx: { vetRelief: -1, youthGrowth: 0.3 } },
    ] },
  },
};
// ②③ 반기 직전 토크: 여름 시장 종료 후(②)·겨울 시장 종료 후(③). 같은 효과표를 공유하고 이름·대사만 다르다.
// 효과는 그 반기만: ②는 pointsFirst, ③은 pointsSecond. 톤은 그 반기의 변동성으로 이어진다(risky=공격 1.6배, safe=수비 0.45배).
// [텍스트, 즉시 조직력, 반기 승점] 3개 중 하나가 나온다. 무작위로 골라도 평균 승점 환산(조직력 1점≈0.35점) ≈ 0.
const PRE_EFFECTS = {
  roar: [['선수들이 바짝 긴장했어요. 분위기는 잡혔지만 여유가 없어요.', 4, -1], ['라커룸이 얼어붙었어요. 집중력은 높지만 어깨가 무거워 보여요.', 3, -1], ['기선 제압은 성공. 다만 어린 선수들이 위축돼요.', 5, -2]],
  cheer: [['마음이 편해진 선수들이 힘을 내요. 승부욕은 조금 줄었어요.', 3, -1], ['믿어 주는 감독에게 선수들이 보답하려 해요. 긴장은 풀렸어요.', 2, -1], ['든든한 분위기예요. 다만 너무 편안해졌어요.', 4, -2]],
  gamble: [['이번 반기에 거는 계획이 짜여요. 선수단 분위기는 흔들려요.', -5, 2], ['승부수에 선수들이 설레요. 하지만 준비가 덜 됐어요.', -3, 1], ['큰 승부수예요. 부담을 느끼지만 한 번 해 볼 만해요.', -4, 2]],
  film: [['선수들이 상대를 읽어요. 분위기는 차분해요.', 1, 0], ['전술 이해도가 올라요. 대신 훈련이 딱딱해졌어요.', -1, 1], ['장단점이 선명해져요. 분위기는 조금 무거워요.', 2, -1]],
  freedom: [['선수들이 자유를 만끽해요. 하지만 호흡이 맞지 않아요.', -5, 2], ['개성이 살아나요. 팀 같지는 않아요.', -3, 1], ['각자 해결하려는 분위기예요. 터지면 크지만 불안해요.', -4, 2]],
  joke: [['웃음이 터져요. 분위기는 좋은데 긴장이 풀려요.', 4, -2], ['라커룸이 화기애애해요.', 3, -1], ['가볍게 시작해요. 약간 느슨해요.', 2, -1]],
  carrot: [['선수들 눈빛이 달라져요. 하지만 서로 경쟁하느라 지쳐요.', -5, 2], ['성과 보너스가 걸려요. 분위기가 날카로워요.', -6, 2], ['긴장감이 팽팽해요. 한 번 밀어붙일 만해요.', -8, 3]],
};
const PRE_TALKS = {
  roar: ['호통', '"작년 같은 모습이면 곤란하다!"', '"이대로면 곤란하다!"', 'risky'],
  cheer: ['격려', '"여러분을 믿습니다."', '"아직 충분히 뒤집을 수 있다."', 'safe'],
  gamble: ['승부수 선언', '"이번 반기에 승부를 건다."', '"남은 반기에 모든 걸 건다."', 'risky'],
  film: ['영상 분석', '"상대 영상을 같이 보자."', '"틀린 장면을 같이 보자."', 'safe'],
  freedom: ['자유 플레이', '"각자 하고 싶은 대로 해 봐라."', '"각자 해결해 봐라."', 'risky'],
  joke: ['농담 한마디', '"자, 웃으면서 시작하자."', '"표정이 굳었다, 웃자."', 'safe'],
  carrot: ['채찍과 당근', '"성과를 내면 보상, 못 내면 벌이다."', '"후반기 성과에 보너스를 건다."', 'risky'],
};
const preKind = (half) => Object.fromEntries(Object.entries(PRE_TALKS).map(([id, [name, l1, l2, tone]]) => [id, {
  name: id === 'gamble' && half === 2 ? '역전 승부수' : id === 'film' && half === 2 ? '전반기 복기' : name,
  line: half === 1 ? l1 : l2, tone,
  outcomes: PRE_EFFECTS[id].map(([text, chem, pts]) => ({ text, fx: { chemNow: chem, [half === 1 ? 'pointsFirst' : 'pointsSecond']: pts } })),
}]));
TALKS.pre1 = preKind(1);
TALKS.pre2 = preKind(2);
export const TALK_IDS = { start: Object.keys(TALKS.start), end: Object.keys(TALKS.end), pre1: Object.keys(TALKS.pre1), pre2: Object.keys(TALKS.pre2) };

// 시즌 합계 한도: 조직력(① + ② + ③ + 성격 보정) ±8, 승점 효과(①~③) ±4. 한도를 넘는 만큼만 잘라 낸 새 변화량을 돌려준다.
export const TALK_SEASON_CHEM_CAP = 8;
export const TALK_SEASON_POINTS_CAP = 4;
export const capTalkDelta = (sum, delta, cap) => Math.max(-cap, Math.min(cap, sum + delta)) - sum;
// 반기 직전 토크의 숨은 변동성 방향(전술 방향 효과를 흡수): risky → 공격, safe → 수비
export const talkDirection = (tone) => (tone === 'risky' ? 'attack' : tone === 'safe' ? 'defense' : 'balance');

// 라커룸 토크 3장(장면 이름·대사·분위기만 보인다. 반응은 고르고 나서 정해진다).
export function drawTalkChoices(kind, rng = Math.random, count = 3) {
  const ids = [...TALK_IDS[kind]];
  for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
  return ids.slice(0, count);
}
// 토크를 고르면 반응 하나가 정해진다(같은 토크도 매번 다를 수 있다).
export function rollTalkOutcome(kind, id, rng = Math.random) {
  const t = TALKS[kind][id];
  const o = t.outcomes[Math.floor(rng() * t.outcomes.length)];
  return { id, kind, name: t.name, text: o.text, fx: o.fx, tone: t.tone };
}
// 반응의 장단점을 사람이 읽는 문장으로("조직력 +6", "판매 오퍼 −6%")
export function describeTalkFx(fx) {
  const f = (v, plus, unit = '') => `${plus} ${v > 0 ? '+' : '−'}${Math.abs(v)}${unit}`;
  const out = [];
  const pct = (v) => Math.round(v * 100);
  if (fx.chemNow) out.push({ good: fx.chemNow > 0, text: f(fx.chemNow, '조직력') });
  if (fx.nextStartChem) out.push({ good: fx.nextStartChem > 0, text: f(fx.nextStartChem, '다음 시즌 시작 조직력') });
  if (fx.txDecayMult && fx.txDecayMult !== 1) out.push({ good: fx.txDecayMult < 1, text: `거래 조직력 하락 ×${fx.txDecayMult}` });
  if (fx.buyDiscount) out.push({ good: fx.buyDiscount > 0, text: `영입가 ${fx.buyDiscount > 0 ? '−' : '+'}${Math.abs(pct(fx.buyDiscount))}%` });
  if (fx.saleMult && fx.saleMult !== 1) out.push({ good: fx.saleMult > 1, text: `판매 오퍼 ${fx.saleMult > 1 ? '+' : '−'}${Math.abs(pct(fx.saleMult - 1))}%` });
  if (fx.pointsFirst) out.push({ good: fx.pointsFirst > 0, text: f(fx.pointsFirst, '전반기 승점') });
  if (fx.pointsSecond) out.push({ good: fx.pointsSecond > 0, text: f(fx.pointsSecond, '후반기 승점') });
  if (fx.formationBonus) out.push({ good: fx.formationBonus > 0, text: f(fx.formationBonus, '포메이션 궁합') });
  if (fx.patienceBonus) out.push({ good: fx.patienceBonus > 0, text: f(fx.patienceBonus, '협상 인내심') });
  if (fx.gradeNoiseMult && fx.gradeNoiseMult !== 1) out.push({ good: fx.gradeNoiseMult < 1, text: `잠재력 등급 오차 ${fx.gradeNoiseMult < 1 ? '−' : '+'}${Math.abs(pct(1 - fx.gradeNoiseMult))}%` });
  if (fx.recoveryDelta) out.push({ good: fx.recoveryDelta > 0, text: `주간 조직력 회복 ${fx.recoveryDelta > 0 ? '+' : '−'}${Math.abs(fx.recoveryDelta)}` });
  if (fx.growthBoost) out.push({ good: fx.growthBoost > 0, text: `성장 초반 선수 성장 +1 확률 +${pct(fx.growthBoost)}%` });
  if (fx.grantMult && fx.grantMult !== 1) out.push({ good: fx.grantMult > 1, text: `다음 시즌 지급액 ${fx.grantMult > 1 ? '+' : '−'}${Math.abs(pct(fx.grantMult - 1))}%` });
  if (fx.vetRelief) out.push({ good: fx.vetRelief > 0, text: `베테랑 시즌 하락 ${fx.vetRelief > 0 ? '−1 완화' : '+1 악화'}` });
  if (fx.youthGrowth) out.push({ good: fx.youthGrowth > 0, text: `성장 단계 선수 추가 성장 확률 ${fx.youthGrowth > 0 ? '+' : '−'}${Math.abs(pct(fx.youthGrowth))}%` });
  return out;
}

// ---------- 효과 합치기 ----------
export const NO_EFFECTS = Object.freeze({
  tagBonus: {}, formationBonus: 0, defenseLine: 0, flairBonus: 0,
  txDecayMult: 1, buyDiscount: 0, saleMult: 1, pointsFirst: 0, pointsSecond: 0, patienceBonus: 0, gradeNoiseMult: 1, recoveryDelta: 0, growthBoost: 0,
  // 예전 호출부 호환(철학으로 바뀌며 쓰이지 않는 값)
  startChemistry: 0, tenureChem: 0, tenureCap: 0, secondHalfPoints: 0, promotedPointsPerHalf: 0, growthBuyDiscount: 0, growthSaleBonus: 0, pressureMult: 1,
});
// philosophy = { id, level } | null, stanceFx = 이번 시즌 라커룸 토크의 fx | null
export function specialtyEffects(philosophy, stanceFx = null) {
  const fx = { ...NO_EFFECTS, tagBonus: {} };
  const e = philosophy ? PHILOSOPHIES[philosophy.id]?.levels?.[philosophy.level - 1] : null;
  if (e) {
    if (e.tagBonus) for (const [t, n] of Object.entries(e.tagBonus)) fx.tagBonus[t] = (fx.tagBonus[t] ?? 0) + n;
    if (e.formationBonus) fx.formationBonus += e.formationBonus;
    if (e.defenseLine) fx.defenseLine += e.defenseLine;
  }
  const s = stanceFx ?? {};
  fx.formationBonus += s.formationBonus ?? 0;
  fx.txDecayMult *= s.txDecayMult ?? 1;
  fx.buyDiscount += s.buyDiscount ?? 0;
  fx.saleMult *= s.saleMult ?? 1;
  fx.pointsFirst += s.pointsFirst ?? 0;
  fx.pointsSecond += s.pointsSecond ?? 0;
  fx.patienceBonus += s.patienceBonus ?? 0;
  fx.gradeNoiseMult *= s.gradeNoiseMult ?? 1;
  fx.recoveryDelta += s.recoveryDelta ?? 0;
  fx.growthBoost += s.growthBoost ?? 0;
  fx.secondHalfPoints = fx.pointsSecond; // 호환
  return fx;
}
