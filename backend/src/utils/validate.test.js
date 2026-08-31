import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ALLOTMENT_STATUSES, validateAllotmentStatus } from './validate.js';
import { maskPan } from './pan.js';

describe('allotment status authorization of values', () => {
  it('accepts queue statuses without dropping legacy values', () => {
    for (const s of ['PENDING', 'CHECKING', 'ALLOTED', 'PARTIALLY_ALLOTTED', 'NOT_ALLOTED', 'NOT_APPLIED', 'REJECTED', 'ERROR', 'RETRY']) {
      assert.ok(ALLOTMENT_STATUSES.includes(s), s);
      validateAllotmentStatus(s);
    }
  });

  it('rejects unknown statuses', () => {
    assert.throws(() => validateAllotmentStatus('YES'));
  });
});

describe('PAN', () => {
  it('never returns the first five characters', () => {
    const masked = maskPan('PQRST6789K');
    assert.equal(masked.startsWith('XXXXX'), true);
    assert.equal(masked.includes('PQRST'), false);
  });
});
