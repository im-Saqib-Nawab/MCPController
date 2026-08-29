import assert from 'node:assert/strict';
import test from 'node:test';
import { hasScope, requireScope, assertToolAllowed } from '../server/services/permission.service.js';

test('hasScope allows granted permissions', () => {
  assert.equal(hasScope(['doctor:read', 'doctor:create'], 'doctor:read'), true);
  assert.equal(hasScope(['doctor:read', 'doctor:create'], 'doctor:delete'), false);
});

test('requireScope throws when missing', () => {
  assert.throws(() => requireScope(['doctor:read'], 'doctor:delete'), /Permission denied/);
});

test('tool mapping matches doctor scopes', () => {
  assert.doesNotThrow(() => assertToolAllowed('list_doctors', ['doctor:read']));
  assert.doesNotThrow(() => assertToolAllowed('add_doctor', ['doctor:create']));
  assert.doesNotThrow(() => assertToolAllowed('update_doctor', ['doctor:update']));
  assert.throws(
    () => assertToolAllowed('delete_doctor', ['doctor:read', 'doctor:create']),
    /Permission denied/
  );
});
