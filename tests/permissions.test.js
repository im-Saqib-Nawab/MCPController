import assert from 'node:assert/strict';
import test from 'node:test';
import { hasScope, requireScope, assertToolAllowed } from '../server/services/permission.service.js';

test('hasScope allows granted permissions', () => {
  assert.equal(hasScope(['doctor:read', 'doctor:write'], 'doctor:read'), true);
  assert.equal(hasScope(['doctor:read', 'doctor:write'], 'doctor:delete'), false);
});

test('requireScope throws when missing', () => {
  assert.throws(() => requireScope(['doctor:read'], 'doctor:delete'), /Permission denied/);
});

test('tool mapping matches the practice scopes', () => {
  assert.doesNotThrow(() => assertToolAllowed('list_doctors', ['doctor:read']));
  assert.doesNotThrow(() => assertToolAllowed('add_doctor', ['doctor:write']));
  assert.throws(
    () => assertToolAllowed('delete_doctor', ['doctor:read', 'doctor:write']),
    /Permission denied/
  );
});
