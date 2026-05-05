/**
 * Cipher Wars MXE — Simulated Multi-Party Execution Environment
 *
 * Arcium SDK swap point: replace the exports below with the real Arcium MXE
 * SDK when integrating. The interface contract (resolveTurn, generateMxeKeyPair,
 * getMxePublicKey) remains the same.
 */

export {
  resolveTurn,
  generateMxeKeyPair,
  getMxePublicKey,
} from "./combat.js";

export type {
  EncryptedMoveInput,
  DecryptedMove,
  CombatResult,
  TurnResolution,
  MxeKeyPair,
} from "./combat.js";
