import { CONTRACT_YEARS } from './constants.mjs';
import { overall } from './player.mjs';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// 선수의 시장 가치(0~100). 현재 능력에 잠재력의 절반을 더하고, 33세부터 나이만큼 깎는다.
export function marketValue(p) {
  const now = overall(p);
  const v = now + (p.potential - now) * 0.5 - Math.max(0, p.age - 32) * 2;
  return clamp(v, 0, 100);
}

// 요구 연봉(캡 포인트). 가치 30 이하는 최저 2, 가치 100이면 40.
// FA 영입 가격(코인). 요구 연봉이 높은 좋은 선수일수록 가파르게 비싸다: 2는 2, 10은 14, 25는 50, 40은 104.
export const faPrice = (asking) => Math.round(asking + (asking * asking) / 25);

export const askingSalary = (p) => Math.round(2 + 38 * (Math.max(0, marketValue(p) - 30) / 70) ** 2);

// 샐러리캡은 스타 연봉 총액만 센다(조연·코치 제외).
export const payroll = (team) => team.stars.reduce((sum, p) => sum + p.contract.salary, 0);
export const capRoom = (team, cap) => cap - payroll(team);

export const newContract = (salary) => ({ salary, years: CONTRACT_YEARS });

// 시즌이 끝날 때 한 번 부른다. 계약 연수를 1 줄이고 만료된 스타 목록을 돌려준다.
export function tickContracts(team) {
  for (const p of team.stars) p.contract.years -= 1;
  return team.stars.filter((p) => p.contract.years <= 0);
}
