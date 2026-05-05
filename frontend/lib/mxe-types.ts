// Shared types mirroring mxe/src/combat.ts — kept in sync manually.
// At Arcium MXE integration time, replace with imports from the SDK package.

export interface EncryptedMoveInput {
  encryptedData: string;
  iv: string;
  clientPublicKey: string;
  playerId: string;
}

export interface DecryptedMove {
  territories: number[];
  unitCounts: number[];
  targetTerritory: number;
  sourceTerritory: number;
  unitsCommitted: number;
}

export interface CombatResult {
  winner: string;
  loser: string;
  territoryChanged: number;
  attackerUnitsLost: number;
  defenderUnitsLost: number;
  newUnitCounts: Record<string, number[]>;
}

export interface TurnResolution {
  combatResults: CombatResult[];
  gameOver: boolean;
  winner: string | null;
  algorithmHash: string;
  resolvedAt: string;
}

export interface MxeKeyPair {
  privateKey: CryptoKey;
  publicKey: CryptoKey;
  publicKeyBytes: Uint8Array;
}
