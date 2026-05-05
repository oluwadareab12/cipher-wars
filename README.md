# ⚡ Cipher Wars

A hidden-information strategy game built on Solana where every move is cryptographically sealed before it hits the blockchain. Two players battle for control of a 5×5 territory grid — but neither can see the other's strategy until combat resolves inside an Arcium Multi-Party Execution Environment (MXE). Stakes are held in an on-chain escrow and paid out automatically to the winner.

---

## How the MXE Encrypts Game State

Each move is a JSON payload `{ territories, unitCounts, targetTerritory, sourceTerritory, unitsCommitted }`. Before the client submits it to Solana it:

1. **Generates an ephemeral X25519 keypair** (in the browser, never persisted)
2. **Performs ECDH** against the MXE's long-lived X25519 public key to derive 256 bits of shared secret
3. **Runs HKDF-SHA256** over the shared secret with the fixed info string `"cipher-wars-move-encryption-v1"` to produce a 256-bit AES key
4. **Encrypts the payload** with AES-GCM-256 using a random 96-bit IV
5. **Submits** `{ encryptedData, iv, clientPublicKey }` to the Anchor program — the on-chain account stores only ciphertext

Inside the MXE (`mxe/src/combat.ts`), the resolver:
- Re-derives the shared secret using its private key and the client's ephemeral public key
- Decrypts both players' moves without ever exposing raw unit counts outside the secure enclave
- Resolves combat (1.5× attacker threshold, proportional losses)
- Returns only the *outcomes* — territory changes, unit deltas, algorithm hash

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Browser / Client                  │
│  Next.js 15  ─►  encryption.ts (X25519+AES-GCM)     │
│                        │                            │
│              Encrypted Move Payload                 │
└──────────────────────┬──────────────────────────────┘
                       │ submit_move ix
                       ▼
┌─────────────────────────────────────────────────────┐
│              Solana Devnet (Anchor Program)          │
│  GameState PDA  ──  Escrow lamports                 │
│  player_one_moves[]  player_two_moves[]             │
└──────────────────────┬──────────────────────────────┘
                       │ fetch encrypted moves
                       ▼
┌─────────────────────────────────────────────────────┐
│          MXE — mxe/src/combat.ts                    │
│  ◄── Arcium SDK swap point ──►                      │
│  X25519 ECDH → HKDF → AES-GCM decrypt              │
│  Combat resolution (1.5× capture threshold)        │
│  Win condition check                                │
│  Returns TurnResolution (outcomes only)            │
└──────────────────────┬──────────────────────────────┘
                       │ resolve_game ix (if game over)
                       ▼
┌─────────────────────────────────────────────────────┐
│              Winner receives full escrow            │
└─────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Smart contract | Rust · Anchor 0.30 |
| Chain | Solana Devnet |
| Encryption | X25519 ECDH + HKDF-SHA256 + AES-GCM-256 |
| MXE | Simulated Arcium MXE (swap point in `mxe/src/combat.ts`) |
| Frontend | Next.js 15 · TypeScript · Tailwind CSS |
| Wallet | Phantom via `@solana/wallet-adapter` |
| Program client | `@coral-xyz/anchor` |

---

## Running Locally

### Prerequisites

- [Rust](https://rustup.rs/) + `solana-cli` + `anchor-cli`
- Node.js 20+
- [Phantom wallet](https://phantom.app/) browser extension funded with devnet SOL

```bash
# Get devnet SOL
solana airdrop 2 --url devnet
```

### 1 — Build & deploy the Anchor program

```bash
cd program
anchor build
anchor deploy --provider.cluster devnet
# Copy the deployed program ID into:
#   program/programs/cipher-wars/src/lib.rs  →  declare_id!(...)
#   frontend/lib/anchor.ts                   →  PROGRAM_ID
```

### 2 — Start the frontend

```bash
cd frontend
npm install
npm run dev
# Open http://localhost:3000
```

### 3 — (Optional) Run Anchor tests

```bash
cd program
anchor test
```

---

## How to Play

1. **Connect** your Phantom wallet (devnet) in the top-right corner
2. **Create a game** — generate or enter a Game ID, set a stake amount (default 0.01 SOL), click *Create Game*
3. **Share the Game ID** with your opponent
4. **Opponent joins** — they paste the Game ID and click *Join Game*; their matching stake is deposited
5. **Each turn:**
   - Select a source territory (one you own) and a target adjacent territory
   - Set the number of units to commit
   - Click *Encrypt & Submit Move* — your move is sealed with X25519 + AES-GCM-256 before leaving your browser
6. **Once both players submit**, switch to the **Resolver** tab and click *Resolve Turn*
   - The MXE decrypts both moves, resolves combat, and updates the board
7. **Win condition:** eliminate all opponent units OR capture all 25 territories
8. The winner clicks **Claim Winnings** to receive the full escrow payout

---

## Arcium MXE Swap Point

The current MXE is a local simulation. To integrate with the real Arcium network:

1. Replace the contents of **`mxe/src/combat.ts`** with the Arcium SDK client
2. Keep the same exported interface:
   - `resolveTurn(moves: EncryptedMoveInput[], mxePrivateKey: CryptoKey): Promise<TurnResolution>`
   - `generateMxeKeyPair(): Promise<MxeKeyPair>`
   - `getMxePublicKey(keyPair: MxeKeyPair): Uint8Array`
3. The frontend encryption (`frontend/lib/encryption.ts`) and the Anchor program (`program/`) require **no changes** — they only see encrypted bytes

---

## Security Notes

- Encrypted move data (`[u8; 256]`) + IV (`[u8; 12]`) + ephemeral public key (`[u8; 32]`) are stored on-chain — all ciphertext
- Raw unit counts and strategy are **never** stored on-chain or returned by the MXE
- The resolver keypair in `resolve_game` should be replaced with a secure hardware key or an Arcium verifiable computation attestation before mainnet
