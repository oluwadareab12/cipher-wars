/**
 * Browser-side MXE combat resolver.
 *
 * Mirrors mxe/src/combat.ts exactly — same crypto primitives, same algorithm.
 * Arcium MXE swap point: replace this module with the Arcium SDK client
 * while keeping the same exported function signatures.
 */

import type {
  EncryptedMoveInput,
  DecryptedMove,
  CombatResult,
  TurnResolution,
  MxeKeyPair,
} from "./mxe-types";

const HKDF_INFO = "cipher-wars-move-encryption-v1";

// ─── Key Generation ───────────────────────────────────────────────────────────

export async function generateMxeKeyPair(): Promise<MxeKeyPair> {
  const subtle = window.crypto.subtle;
  const keyPair = await subtle.generateKey({ name: "X25519" }, true, [
    "deriveKey",
    "deriveBits",
  ]) as CryptoKeyPair;
  const publicKeyBytes = new Uint8Array(
    await subtle.exportKey("raw", keyPair.publicKey)
  );
  return { privateKey: keyPair.privateKey, publicKey: keyPair.publicKey, publicKeyBytes };
}

export function getMxePublicKey(keyPair: MxeKeyPair): Uint8Array {
  return keyPair.publicKeyBytes;
}

// ─── Decryption ───────────────────────────────────────────────────────────────

async function deriveSharedKey(
  mxePrivateKey: CryptoKey,
  clientPublicKeyBytes: Uint8Array
): Promise<CryptoKey> {
  const subtle = window.crypto.subtle;
  const clientPublicKey = await subtle.importKey(
    "raw",
    clientPublicKeyBytes as unknown as ArrayBuffer,
    { name: "X25519" },
    false,
    []
  );
  const sharedBits = await subtle.deriveBits(
    { name: "X25519", public: clientPublicKey },
    mxePrivateKey,
    256
  );
  const hkdfKey = await subtle.importKey("raw", sharedBits, "HKDF", false, [
    "deriveKey",
  ]);
  return subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(32),
      info: new TextEncoder().encode(HKDF_INFO),
    },
    hkdfKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );
}

async function decryptMove(
  input: EncryptedMoveInput,
  mxePrivateKey: CryptoKey
): Promise<DecryptedMove> {
  const encryptedData = Uint8Array.from(atob(input.encryptedData), (c) =>
    c.charCodeAt(0)
  );
  const iv = Uint8Array.from(atob(input.iv), (c) => c.charCodeAt(0));
  const clientPublicKeyBytes = Uint8Array.from(
    atob(input.clientPublicKey),
    (c) => c.charCodeAt(0)
  );
  const aesKey = await deriveSharedKey(mxePrivateKey, clientPublicKeyBytes);
  const decryptedBuffer = await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    aesKey,
    encryptedData
  );
  return JSON.parse(new TextDecoder().decode(decryptedBuffer)) as DecryptedMove;
}

// ─── Combat Resolution ────────────────────────────────────────────────────────

function resolveCombat(
  attacker: { playerId: string; move: DecryptedMove },
  defender: { playerId: string; move: DecryptedMove },
  targetTerritory: number
): CombatResult {
  const attackerUnits = attacker.move.unitsCommitted;
  const defTerritoryIdx = defender.move.territories.indexOf(targetTerritory);
  const defenderUnits = defTerritoryIdx >= 0 ? defender.move.unitCounts[defTerritoryIdx] : 0;
  const captureThreshold = Math.ceil(defenderUnits * 1.5);
  const attackerWins = attackerUnits >= captureThreshold;

  const attackerUnitsLost = attackerWins
    ? Math.floor(defenderUnits * 0.5)
    : attackerUnits;
  const defenderUnitsLost = attackerWins ? defenderUnits : Math.floor(attackerUnits * 0.3);

  const attackerNewCounts: number[] = [];
  for (let i = 0; i < attacker.move.territories.length; i++) {
    const t = attacker.move.territories[i];
    if (t === attacker.move.sourceTerritory) {
      attackerNewCounts.push(
        Math.max(0, attacker.move.unitCounts[i] - attacker.move.unitsCommitted)
      );
    } else if (t === targetTerritory && attackerWins) {
      attackerNewCounts.push(
        Math.max(0, attacker.move.unitsCommitted - attackerUnitsLost)
      );
    } else {
      attackerNewCounts.push(attacker.move.unitCounts[i]);
    }
  }
  if (attackerWins && !attacker.move.territories.includes(targetTerritory)) {
    attacker.move.territories.push(targetTerritory);
    attackerNewCounts.push(Math.max(0, attacker.move.unitsCommitted - attackerUnitsLost));
  }

  const defenderNewCounts = defender.move.territories.map((t, i) => {
    if (t === targetTerritory) {
      return attackerWins ? 0 : Math.max(0, defender.move.unitCounts[i] - defenderUnitsLost);
    }
    return defender.move.unitCounts[i];
  });

  return {
    winner: attackerWins ? attacker.playerId : defender.playerId,
    loser: attackerWins ? defender.playerId : attacker.playerId,
    territoryChanged: attackerWins ? targetTerritory : -1,
    attackerUnitsLost,
    defenderUnitsLost,
    newUnitCounts: {
      [attacker.playerId]: attackerNewCounts,
      [defender.playerId]: defenderNewCounts,
    },
  };
}

function checkWinCondition(
  decrypted: Array<{ playerId: string; move: DecryptedMove }>,
  combatResults: CombatResult[]
): string | null {
  const playerTerritories: Record<string, Set<number>> = {};
  const playerUnitTotals: Record<string, number> = {};

  for (const { playerId, move } of decrypted) {
    playerTerritories[playerId] = new Set(move.territories);
    playerUnitTotals[playerId] = move.unitCounts.reduce((a, b) => a + b, 0);
  }

  for (const result of combatResults) {
    if (result.territoryChanged >= 0) {
      for (const pid of Object.keys(playerTerritories)) {
        playerTerritories[pid].delete(result.territoryChanged);
      }
      playerTerritories[result.winner].add(result.territoryChanged);
    }
    for (const [pid, counts] of Object.entries(result.newUnitCounts)) {
      playerUnitTotals[pid] = counts.reduce((a, b) => a + b, 0);
    }
  }

  for (const [pid, territories] of Object.entries(playerTerritories)) {
    if (territories.size >= 25) return pid;
  }
  for (const [pid, total] of Object.entries(playerUnitTotals)) {
    if (total <= 0) {
      const others = Object.keys(playerUnitTotals).filter((p) => p !== pid);
      if (others.length > 0) return others[0];
    }
  }
  return null;
}

async function sha256Hex(data: string): Promise<string> {
  const buf = await window.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(data)
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export async function resolveTurn(
  moves: EncryptedMoveInput[],
  mxePrivateKey: CryptoKey
): Promise<TurnResolution> {
  if (moves.length !== 2) throw new Error("resolveTurn requires exactly 2 player moves");

  const decrypted = await Promise.all(
    moves.map(async (m) => ({
      playerId: m.playerId,
      move: await decryptMove(m, mxePrivateKey),
    }))
  );

  const [p1, p2] = decrypted;
  const combatResults: CombatResult[] = [];
  const resolvedAt = new Date().toISOString();

  if (p1.move.targetTerritory === p2.move.targetTerritory) {
    const target = p1.move.targetTerritory;
    const p1Owns = p1.move.territories.includes(target);
    const p2Owns = p2.move.territories.includes(target);

    if (p1Owns && !p2Owns) {
      combatResults.push(resolveCombat(p2, p1, target));
    } else if (p2Owns && !p1Owns) {
      combatResults.push(resolveCombat(p1, p2, target));
    } else if (!p1Owns && !p2Owns) {
      if (p1.move.unitsCommitted >= p2.move.unitsCommitted) {
        combatResults.push(resolveCombat(p1, p2, target));
      } else {
        combatResults.push(resolveCombat(p2, p1, target));
      }
    }
  } else {
    if (p2.move.territories.includes(p1.move.targetTerritory)) {
      combatResults.push(resolveCombat(p1, p2, p1.move.targetTerritory));
    }
    if (p1.move.territories.includes(p2.move.targetTerritory)) {
      combatResults.push(resolveCombat(p2, p1, p2.move.targetTerritory));
    }
  }

  const winner = checkWinCondition(decrypted, combatResults);
  const algorithmHash = await sha256Hex(
    JSON.stringify({
      turn: "resolved",
      playerCount: moves.length,
      combatCount: combatResults.length,
      resolvedAt,
    })
  );

  return { combatResults, gameOver: winner !== null, winner, algorithmHash, resolvedAt };
}
