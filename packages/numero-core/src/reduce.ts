import { MASTER_NUMBERS } from "./types";

export function isMaster(n: number): boolean {
  return (MASTER_NUMBERS as readonly number[]).includes(n);
}

function digitSum(n: number): number {
  let sum = 0;
  for (const d of String(Math.abs(Math.trunc(n)))) sum += Number(d);
  return sum;
}

/**
 * Reduce to a single digit, preserving master numbers 11/22/33 (PRD §3.3).
 * Returns every intermediate value, e.g. reduceSteps(1975) → [1975, 22].
 */
export function reduceSteps(n: number): number[] {
  const steps = [n];
  let x = n;
  while (x > 9 && !isMaster(x)) {
    x = digitSum(x);
    steps.push(x);
  }
  return steps;
}

export function reduce(n: number): number {
  const steps = reduceSteps(n);
  return steps[steps.length - 1];
}
