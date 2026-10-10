import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesEmployeeId, normalizeEmployeeId } from '../src/cv-access.mjs';

test('a member number matches in Arabic, English or mixed digits without changing its identity', () => {
  for (const entered of ['4280548', '٤٢٨٠٥٤٨', '۴۲۸۰۵۴۸', '4٢8٠54٨', ' ٤٢٨٠٥٤٨ ']) {
    assert.equal(matchesEmployeeId(entered, '4280548'), true);
  }
  assert.equal(normalizeEmployeeId('٠٠١٢٣'), '00123');
  assert.equal(matchesEmployeeId('٠٠١٢٣', '00123'), true);
  assert.equal(matchesEmployeeId('١٢٣', '00123'), false);
});

test('blank, malformed and other member numbers never match the selected member', () => {
  for (const entered of ['', ' ', null, undefined, '4280549', '٤٢٨٠٥٤٩', '4280548abc', 'رقم ٤٢٨٠٥٤٨', '428 0548', '+4280548', '4280548.0', '4280548\n200', '1234567890123']) {
    assert.equal(matchesEmployeeId(entered, '4280548'), false, String(entered));
  }
  assert.equal(matchesEmployeeId('', ''), false);
  assert.equal(matchesEmployeeId('100', undefined), false);
});
