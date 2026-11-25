import {
  actionRequires,
  canRemoveOwner,
  isAllowed,
  maxLevel,
  resolveEffectiveLevel,
} from '../../src/shared/permissions/permission-policy';

describe('permission policy', () => {
  it('resolves the maximum level between direct and group permissions', () => {
    expect(maxLevel(['READ', 'UPDATE'])).toBe('UPDATE');
    expect(maxLevel(['READ', 'OWNER'])).toBe('OWNER');
    expect(maxLevel([])).toBeNull();
    expect(resolveEffectiveLevel('READ', ['UPDATE'])).toBe('UPDATE');
    expect(resolveEffectiveLevel(null, ['READ', 'OWNER'])).toBe('OWNER');
    expect(resolveEffectiveLevel(null, [])).toBeNull();
  });

  it('maps actions to required levels', () => {
    expect(actionRequires('READ')).toBe('READ');
    expect(actionRequires('UPDATE')).toBe('UPDATE');
    expect(actionRequires('DELETE')).toBe('UPDATE');
    expect(actionRequires('SHARE')).toBe('OWNER');
  });

  it('allows only when effective level satisfies the action', () => {
    expect(isAllowed('READ', 'READ')).toBe(true);
    expect(isAllowed('READ', 'UPDATE')).toBe(false);
    expect(isAllowed('UPDATE', 'READ')).toBe(true);
    expect(isAllowed('UPDATE', 'SHARE')).toBe(false);
    expect(isAllowed('OWNER', 'SHARE')).toBe(true);
    expect(isAllowed(null, 'READ')).toBe(false);
  });

  it('enforces the last OWNER invariant', () => {
    expect(canRemoveOwner(['USER:a', 'USER:b'], 'USER:a')).toBe(true);
    expect(canRemoveOwner(['USER:a'], 'USER:a')).toBe(false);
    expect(canRemoveOwner(['USER:a', 'GROUP:g'], 'GROUP:g')).toBe(true);
    expect(canRemoveOwner([], 'USER:a')).toBe(false);
  });
});
