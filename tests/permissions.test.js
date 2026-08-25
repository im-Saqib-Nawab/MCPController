import assert from 'node:assert/strict';
import test from 'node:test';
import { hasScope, requireScope, assertToolAllowed } from '../server/services/permission.service.js';

test('hasScope allows granted permissions', () => {
  assert.equal(hasScope(['read', 'write'], 'read'), true);
  assert.equal(hasScope(['read', 'write'], 'delete'), false);
});

test('requireScope throws when missing', () => {
  assert.throws(() => requireScope(['read'], 'delete'), /Permission denied/);
});

test('tool mapping matches the practice scopes', () => {
  assert.doesNotThrow(() => assertToolAllowed('get_profile', ['read']));
  assert.doesNotThrow(() => assertToolAllowed('create_data', ['write']));
  assert.throws(() => assertToolAllowed('delete_data', ['read', 'write']), /Permission denied/);
});
