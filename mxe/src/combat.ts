/**
 * Simulated Arcium MXE (Multi-Party Execution Environment) combat resolver.
 * Swap point: replace this module with the real Arcium MXE SDK when available.
 *
 * Encryption: X25519 ECDH + HKDF-SHA256 + AES-GCM-256
 * Raw unit counts are NEVER returned — only combat outcomes.
 */

import { webcrypto } from "crypto";
const subtle = webcrypto.subtle;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EncryptedMoveInput {
  encryptedData: string; // base64
  iv: string; // base64
  clientPublicKey: string; // base64 X25519 public key
  playerId: string;
}

export interface DecryptedMove {
  territories: number[]; // territory indices the player controls (0–24 on 5×5 grid)
  unitCounts: number[]; // units on each of the player's territories (parallel to territories)
  targetTerritory: number; // territory index being attacked/moved to
  sourceTerritory: number; // territory index units are moving from
  unitsCommitted: number; // how many units to send
}

export interface CombatResult {
  winner: string; // playerId
  loser: string; // playerId
  territoryChanged: number; // territory index that changed hands (-1 if none)
  attackerUnitsLost: number;
  defenderUnitsLost: number;
  newUnitCounts: Record<string, number[]>; // playerId → unit counts after battle
}

export interface TurnResolution {
  combatResults: CombatResult[];
  gameOver: boolean;
  winner: string | null;
  algorithmHash: string; // SHA-256 of resolution metadata
  resolvedAt: string; // ISO timestamp
}

export interface MxeKeyPair {
  privateKey: CryptoKey;
  publicKey: CryptoKey;
  publicKeyBytes: Uint8Array;
}

// ─── Key Generation ───────────────────────────────────────────────────────────

export async function generateMxeKeyPair(): Promise<MxeKeyPair> {
  const keyPair = await subtle.generateKey(
    { name: "X25519" },
    true,
    ["deriveKey", "deriveBits"]
  );

  const publicKeyBytes = new Uint8Array(
    await subtle.exportKey("raw", keyPair.publicKey)
  );

  return {
    privateKey: keyPair.privateKey,
    publicKey: keyPair.publicKey,
    publicKeyBytes,
  };
}

export function getMxePublicKey(keyPair: MxeKeyPair): Uint8Array {
  return keyPair.publicKeyBytes;
}

// ─── Decryption ───────────────────────────────────────────────────────────────

async function deriveSharedKey(
  mxePrivateKey: CryptoKey,
  clientPublicKeyBytes: Uint8Array,
  info: string
): Promise<CryptoKey> {
  const clientPublicKey = await subtle.importKey(
    "raw",
    clientPublicKeyBytes,
    { name: "X25519" },
    false,
    []
  );

  const sharedBits = await subtle.deriveBits(
    { name: "X25519", public: clientPublicKey },
    mxePrivateKey,
    256
  );

  // HKDF-SHA256 with field-specific info string
  const hkdfKey = await subtle.importKey("raw", sharedBits, "HKDF", false, [
    "deriveKey",
  ]);

  return subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(32),
      info: new TextEncoder().encode(info),
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
  const encryptedData = Buffer.from(input.encryptedData, "base64");
  const iv = Buffer.from(input.iv, "base64");
  const clientPublicKeyBytes = Buffer.from(input.clientPublicKey, "base64");

  const aesKey = await deriveSharedKey(
    mxePrivateKey,
    clientPublicKeyBytes,
    "cipher-wars-move-encryption-v1"
  );

  const decryptedBuffer = await subtle.decrypt(
    { name: "AES-GCM", iv },
    aesKey,
    encryptedData
  );

  const json = new TextDecoder().decode(decryptedBuffer);
  return JSON.parse(json) as DecryptedMove;
}

// ─── Combat Resolution ────────────────────────────────────────────────────────

function resolveCombat(
  attacker: { playerId: string; move: DecryptedMove },
  defender: { playerId: string; move: DecryptedMove },
  targetTerritory: number
): CombatResult {
  const attackerUnits = attacker.move.unitsCommitted;

  // Find defender's units on the contested territory
  const defTerritoryIdx = defender.move.territories.indexOf(targetTerritory);
  const defenderUnits =
    defTerritoryIdx >= 0 ? defender.move.unitCounts[defTerritoryIdx] : 0;

  // Attacker needs 1.5× defender units to capture
  const captureThreshold = Math.ceil(defenderUnits * 1.5);
  const attackerWins = attackerUnits >= captureThreshold;

  // Proportional losses
  let attackerUnitsLost: number;
  let defenderUnitsLost: number;

  if (attackerWins) {
    defenderUnitsLost = defenderUnits;
    attackerUnitsLost = Math.floor(defenderUnits * 0.5);
  } else {
    // Failed assault — attacker loses more
    attackerUnitsLost = attackerUnits;
    defenderUnitsLost = Math.floor(attackerUnits * 0.3);
  }

  // Build outcome unit counts (do NOT include raw counts from DecryptedMove)
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
  if (attackerWins) {
    const alreadyHasTerr = attacker.move.territories.includes(targetTerritory);
    if (!alreadyHasTerr) {
      // Add newly captured territory with surviving attacking units
      attacker.move.territories.push(targetTerritory);
      attackerNewCounts.push(
        Math.max(0, attacker.move.unitsCommitted - attackerUnitsLost)
      );
    }
  }

  const defenderNewCounts: number[] = [];
  for (let i = 0; i < defender.move.territories.length; i++) {
    const t = defender.move.territories[i];
    if (t === targetTerritory) {
      if (attackerWins) {
        defenderNewCounts.push(0); // Territory lost, 0 units remain
      } else {
        defenderNewCounts.push(
          Math.max(0, defender.move.unitCounts[i] - defenderUnitsLost)
        );
      }
    } else {
      defenderNewCounts.push(defender.move.unitCounts[i]);
    }
  }

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
  moves: Array<{ playerId: string; move: DecryptedMove }>,
  combatResults: CombatResult[]
): string | null {
  // Aggregate territory ownership after all combat
  const playerTerritories: Record<string, Set<number>> = {};
  const playerUnitTotals: Record<string, number> = {};

  for (const { playerId, move } of moves) {
    playerTerritories[playerId] = new Set(move.territories);
    playerUnitTotals[playerId] = move.unitCounts.reduce((a, b) => a + b, 0);
  }

  // Apply combat results
  for (const result of combatResults) {
    if (result.territoryChanged >= 0) {
      for (const pid of Object.keys(playerTerritories)) {
        playerTerritories[pid].delete(result.territoryChanged);
      }
      playerTerritories[result.winner].add(result.territoryChanged);
    }

    // Update unit totals from combat result counts
    for (const [pid, counts] of Object.entries(result.newUnitCounts)) {
      playerUnitTotals[pid] = counts.reduce((a, b) => a + b, 0);
    }
  }

  // Win: control all 5 starting territories (indices 0,1,2 + 6,7,8) or opponent has 0 units
  const ALL_TERRITORIES = 25; // 5×5 grid

  for (const [pid, territories] of Object.entries(playerTerritories)) {
    if (territories.size >= ALL_TERRITORIES) return pid;
  }

  for (const [pid, total] of Object.entries(playerUnitTotals)) {
    if (total <= 0) {
      // Return the other player as winner
      const others = Object.keys(playerUnitTotals).filter((p) => p !== pid);
      if (others.length > 0) return others[0];
    }
  }

  return null;
}

async function sha256Hex(data: string): Promise<string> {
  const buf = await subtle.digest(
    "SHA-256",
    new TextEncoder().encode(data)
  );
  return Buffer.from(buf).toString("hex");
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export async function resolveTurn(
  moves: EncryptedMoveInput[],
  mxePrivateKey: CryptoKey
): Promise<TurnResolution> {
  if (moves.length !== 2) {
    throw new Error("resolveTurn requires exactly 2 player moves");
  }

  // Decrypt moves inside the MXE — raw data never leaves this function
  const decrypted = await Promise.all(
    moves.map(async (m) => ({
      playerId: m.playerId,
      move: await decryptMove(m, mxePrivateKey),
    }))
  );

  const [p1, p2] = decrypted;
  const combatResults: CombatResult[] = [];
  const resolvedAt = new Date().toISOString();

  // Check for territorial collision (both players target same territory)
  if (p1.move.targetTerritory === p2.move.targetTerritory) {
    const target = p1.move.targetTerritory;
    const p1OwnsTerr = p1.move.territories.includes(target);
    const p2OwnsTerr = p2.move.territories.includes(target);

    if (p1OwnsTerr && !p2OwnsTerr) {
      // p2 attacks p1's territory
      combatResults.push(resolveCombat(p2, p1, target));
    } else if (p2OwnsTerr && !p1OwnsTerr) {
      // p1 attacks p2's territory
      combatResults.push(resolveCombat(p1, p2, target));
    } else if (!p1OwnsTerr && !p2OwnsTerr) {
      // Both attacking neutral — higher units win
      if (p1.move.unitsCommitted >= p2.move.unitsCommitted) {
        combatResults.push(resolveCombat(p1, p2, target));
      } else {
        combatResults.push(resolveCombat(p2, p1, target));
      }
    }
    // If both own it somehow — no combat
  } else {
    // No collision — resolve each move against the defending territory if occupied
    const p1Target = p1.move.targetTerritory;
    const p2Target = p2.move.targetTerritory;

    if (p2.move.territories.includes(p1Target)) {
      combatResults.push(resolveCombat(p1, p2, p1Target));
    }

    if (p1.move.territories.includes(p2Target)) {
      combatResults.push(resolveCombat(p2, p1, p2Target));
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

  return {
    combatResults,
    gameOver: winner !== null,
    winner,
    algorithmHash,
    resolvedAt,
  };
}
