function format(value) {
  try { return JSON.stringify(value, null, 2); } catch { return String(value); }
}
function isEqual(a, b) {
  if (Object.is(a, b)) return true;
  return format(a) === format(b);
}
function makeExpect(actual, negated = false) {
  const check = (condition, message) => {
    const pass = negated ? !condition : condition;
    if (!pass) throw new Error(negated ? `Expected not: ${message}` : message);
  };
  return {
    get not() { return makeExpect(actual, !negated); },
    toBe(expected) { check(Object.is(actual, expected), `Expected ${format(actual)} to be ${format(expected)}`); },
    toEqual(expected) { check(isEqual(actual, expected), `Expected ${format(actual)} to equal ${format(expected)}`); },
    toContain(expected) { check(actual?.includes?.(expected), `Expected ${format(actual)} to contain ${format(expected)}`); },
    toBeGreaterThan(expected) { check(actual > expected, `Expected ${format(actual)} to be greater than ${format(expected)}`); },
    toBeGreaterThanOrEqual(expected) { check(actual >= expected, `Expected ${format(actual)} to be greater than or equal to ${format(expected)}`); },
    toBeLessThan(expected) { check(actual < expected, `Expected ${format(actual)} to be less than ${format(expected)}`); },
    toBeLessThanOrEqual(expected) { check(actual <= expected, `Expected ${format(actual)} to be less than or equal to ${format(expected)}`); },
    toBeTruthy() { check(Boolean(actual), `Expected ${format(actual)} to be truthy`); },
    toBeFalsy() { check(!actual, `Expected ${format(actual)} to be falsy`); },
    toBeNull() { check(actual === null, `Expected ${format(actual)} to be null`); },
    toBeDefined() { check(actual !== undefined, `Expected value to be defined`); },
    toMatch(pattern) { check(pattern instanceof RegExp ? pattern.test(String(actual)) : String(actual).includes(String(pattern)), `Expected ${format(actual)} to match ${pattern}`); },
  };
}
const state = globalThis.__vitestShimState || (globalThis.__vitestShimState = { tests: [], suites: [] });
function describe(name, fn) { state.suites.push(name); try { fn(); } finally { state.suites.pop(); } }
function it(name, fn) { state.tests.push({ name: [...state.suites, name].join(' > '), fn }); }
const test = it;
function beforeEach(fn) { state.beforeEach = fn; }
function afterEach(fn) { state.afterEach = fn; }
module.exports = { describe, it, test, expect: makeExpect, beforeEach, afterEach, __state: state };
