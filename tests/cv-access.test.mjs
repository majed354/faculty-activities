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

test('copied Arabic numbers ignore bidi formatting while preserving the exact employee ID', () => {
  for (const mark of ['\u061c', '\u200e', '\u200f', '\u202a', '\u202b', '\u202c', '\u202d', '\u202e', '\u2066', '\u2067', '\u2068', '\u2069']) {
    assert.equal(matchesEmployeeId(`${mark}٤٢٨٠٥٤٨${mark}`, '4280548'), true);
    assert.equal(matchesEmployeeId(`٤٢٨${mark}٠٥٤٨`, '4280548'), true);
    assert.equal(matchesEmployeeId(`${mark}٤٢٨٠٥٤٩${mark}`, '4280548'), false);
    assert.equal(matchesEmployeeId(mark, '4280548'), false);
  }
  assert.equal(normalizeEmployeeId('\u2067٠٠١٢٣٤٥٦٧٨٩٠\u2069'), '001234567890');
  assert.equal(matchesEmployeeId('\u200f٤٢٨ ٠٥٤٨', '4280548'), false);
});
