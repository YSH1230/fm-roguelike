import {
  CHEMISTRY_DECAY_PER_TRANSACTION,
  CHEMISTRY_RECOVERY_PER_STABLE_WEEK,
  CHEMISTRY_LOW_THRESHOLD,
  CHEMISTRY_HIGH_THRESHOLD,
  CHEMISTRY_LOW_MULTIPLIER,
  CHEMISTRY_MID_MULTIPLIER_AT_LOW,
  CHEMISTRY_MID_MULTIPLIER_AT_HIGH,
  CHEMISTRY_HIGH_MULTIPLIER,
} from './constants.mjs';

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function chemistryMultiplier(chemistry) {
  if (chemistry < CHEMISTRY_LOW_THRESHOLD) return CHEMISTRY_LOW_MULTIPLIER;
  if (chemistry >= CHEMISTRY_HIGH_THRESHOLD) return CHEMISTRY_HIGH_MULTIPLIER;
  const span = CHEMISTRY_HIGH_THRESHOLD - CHEMISTRY_LOW_THRESHOLD; // 96 - 40 = 56
  const progress = (chemistry - CHEMISTRY_LOW_THRESHOLD) / span;
  return CHEMISTRY_MID_MULTIPLIER_AT_LOW + progress * (CHEMISTRY_MID_MULTIPLIER_AT_HIGH - CHEMISTRY_MID_MULTIPLIER_AT_LOW);
}

export function applyTransactionDecay(chemistry, transactionCount, decayPerTransaction = CHEMISTRY_DECAY_PER_TRANSACTION) {
  return clamp(chemistry - transactionCount * decayPerTransaction, 0, 100);
}

export function applyStableWeekRecovery(chemistry, recovery = CHEMISTRY_RECOVERY_PER_STABLE_WEEK) {
  return clamp(chemistry + recovery, 0, 100);
}
