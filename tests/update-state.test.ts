// Run: npm run test:ui  (node 22.6+ strips the types itself)
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fail, fraction, initialState, reduce, sizeText } from '../src/ui/update-state.ts';

test('download progress fills the bar', () => {
  let s = initialState();
  assert.equal(fraction(s), 0);
  s = reduce(s, { stage: 'download', received: 10 * 1048576, total: 40 * 1048576 });
  assert.equal(s.phase, 'downloading');
  assert.equal(fraction(s), 0.25);
  s = reduce(s, { stage: 'download', received: 40 * 1048576, total: 40 * 1048576 });
  assert.equal(fraction(s), 1);
});

test('unknown total keeps the bar empty and the old total survives a zero', () => {
  let s = reduce(initialState(), { stage: 'download', received: 500, total: 0 });
  assert.equal(fraction(s), 0);
  s = reduce(s, { stage: 'download', received: 1000, total: 2000 });
  s = reduce(s, { stage: 'download', received: 1500, total: 0 });
  assert.equal(s.total, 2000);
  assert.equal(fraction(s), 0.75);
});

test('verify and extract mean installing, done means restarting', () => {
  let s = reduce(initialState(), { stage: 'download', received: 5, total: 10 });
  s = reduce(s, { stage: 'extract' });
  assert.equal(s.phase, 'installing');
  assert.equal(fraction(s), 1);
  s = reduce(s, { stage: 'done' });
  assert.equal(s.phase, 'restarting');
});

test('a late download event does not move the overlay back', () => {
  let s = reduce(initialState(), { stage: 'extract' });
  s = reduce(s, { stage: 'download', received: 1, total: 10 });
  assert.equal(s.phase, 'installing');
});

test('an error is final until a new attempt starts', () => {
  let s = reduce(initialState(), { stage: 'download', received: 5, total: 10 });
  s = fail(s, 'No network');
  assert.equal(s.phase, 'error');
  assert.equal(s.error, 'No network');
  assert.equal(fraction(s), 0);
  assert.equal(reduce(s, { stage: 'extract' }).phase, 'error');
  assert.equal(initialState().error, null);
});

test('size text', () => {
  assert.equal(sizeText(12.34 * 1048576, 40.1 * 1048576), '12.3 / 40.1');
  assert.equal(sizeText(1048576, 0), '1.0');
});
