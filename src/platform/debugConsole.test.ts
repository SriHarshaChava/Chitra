import { describe, expect, it } from 'vitest';
import { isDebugRequested } from './debugConsole';

describe('isDebugRequested', () => {
  it.each([
    ['?debug=1', true],
    ['?foo=bar&debug=1', true],
    ['', false],
    ['?debug=0', false],
    ['?debug', false],
  ])('%s -> %s', (search, expected) => {
    expect(isDebugRequested(search)).toBe(expected);
  });
});
