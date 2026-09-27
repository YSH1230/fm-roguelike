// 스펙 4절 "슬라이스 구단 4종": 강점 1개 + 약점 1개, 고정 데이터 (4개뿐이라 생성기 불필요)
// kit은 선수 초상화(ui/portrait.mjs)가 그리는 유니폼 색.
export const CLUBS = [
  {
    id: 'club-youth-academy',
    kit: '#3f7d4f',
    name: '유스 명문',
    strength: '시작 선수단에 성골 유스 다수',
    weakness: '시작 자금 적음',
    startingFundsMultiplier: 0.8,
  },
  {
    id: 'club-oil-money',
    kit: '#2f5f9e',
    name: '오일머니',
    strength: '시작 자금 많음, 레전더리급 1명 보유',
    weakness: '이적 오퍼 성과 기대치 큼',
    startingFundsMultiplier: 1.5,
  },
  {
    id: 'club-defensive-tradition',
    kit: '#5d4a7a',
    name: '수비 전통',
    strength: '수비형 플레이스타일 편중, 적응도 시작 높음',
    weakness: '공격 태그 카드 등장률 낮음',
    startingFundsMultiplier: 1.0,
  },
  {
    id: 'club-attacking-football',
    kit: '#b8452f',
    name: '공격 축구',
    strength: '공격형 플레이스타일 편중',
    weakness: '수비 포지션 OVR 낮음',
    startingFundsMultiplier: 1.0,
  },
];
