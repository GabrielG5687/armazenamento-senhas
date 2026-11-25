import type { PermissionActionName, PermissionLevelName } from '../types';

export type { PermissionActionName, PermissionLevelName };

const RANK: Record<PermissionLevelName, number> = {
  READ: 1,
  UPDATE: 2,
  OWNER: 3,
};

export function levelRank(level: PermissionLevelName): number {
  return RANK[level];
}

export function maxLevel(levels: readonly PermissionLevelName[]): PermissionLevelName | null {
  let winner: PermissionLevelName | null = null;
  for (const level of levels) {
    if (winner === null || RANK[level] > RANK[winner]) {
      winner = level;
    }
  }
  return winner;
}

export function resolveEffectiveLevel(
  direct: PermissionLevelName | null,
  groupLevels: readonly PermissionLevelName[],
): PermissionLevelName | null {
  return maxLevel([...(direct ? [direct] : []), ...groupLevels]);
}

export function actionRequires(action: PermissionActionName): PermissionLevelName {
  switch (action) {
    case 'READ':
      return 'READ';
    case 'UPDATE':
    case 'DELETE':
      return 'UPDATE';
    case 'SHARE':
      return 'OWNER';
  }
}

export function isAllowed(
  effective: PermissionLevelName | null,
  action: PermissionActionName,
): boolean {
  if (effective === null) {
    return false;
  }
  return RANK[effective] >= RANK[actionRequires(action)];
}

/**
 * Pure helper for the "last OWNER" invariant. `ownerKeys` are stable
 * identifiers (for example `USER:<id>` / `GROUP:<id>`) and `removingKey`
 * is the identifier being removed. Returns true when at least one OWNER
 * remains after the removal.
 */
export function canRemoveOwner(
  ownerKeys: readonly string[],
  removingKey: string,
): boolean {
  return ownerKeys.some((key) => key !== removingKey);
}