import { test } from 'node:test';
import assert from 'node:assert/strict';
test('낮은 리그일수록 높은 등급 스태프가 시장에 안 나온다(5부는 아카데미·프로 라이선스뿐)', async () => {
  const { generateStaffOffer } = await import('../data/staff.mjs');
  const keys = (tier) => Object.keys(generateStaffOffer(Math.random, tier));
  assert.ok(keys('tier5').every((k) => k.endsWith('academy') || k.endsWith('proLicense')));
  assert.ok(keys('tier4').some((k) => k.endsWith('veteran')) && !keys('tier4').some((k) => k.endsWith('master')));
  assert.equal(keys('tier3').length, 8);
});
