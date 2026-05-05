import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { CipherWars } from "../target/types/cipher_wars";
import { PublicKey, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { assert } from "chai";
import * as crypto from "crypto";

describe("cipher-wars", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.CipherWars as Program<CipherWars>;

  const playerOne = Keypair.generate();
  const playerTwo = Keypair.generate();
  const gameId = crypto.randomBytes(32);

  before(async () => {
    // Airdrop SOL to test wallets
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(
        playerOne.publicKey,
        2 * LAMPORTS_PER_SOL
      )
    );
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(
        playerTwo.publicKey,
        2 * LAMPORTS_PER_SOL
      )
    );
  });

  it("creates a game", async () => {
    const [gamePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("game"), gameId],
      program.programId
    );

    const stakeAmount = new anchor.BN(0.01 * LAMPORTS_PER_SOL);

    await program.methods
      .createGame(Array.from(gameId), stakeAmount)
      .accounts({
        gameState: gamePda,
        player: playerOne.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([playerOne])
      .rpc();

    const game = await program.account.gameState.fetch(gamePda);
    assert.equal(game.playerOne.toBase58(), playerOne.publicKey.toBase58());
    assert.equal(game.status.waiting !== undefined, true);
    assert.equal(game.playerOneStake.toString(), stakeAmount.toString());
  });

  it("joins a game", async () => {
    const [gamePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("game"), gameId],
      program.programId
    );

    await program.methods
      .joinGame(Array.from(gameId))
      .accounts({
        gameState: gamePda,
        player: playerTwo.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([playerTwo])
      .rpc();

    const game = await program.account.gameState.fetch(gamePda);
    assert.equal(game.playerTwo.toBase58(), playerTwo.publicKey.toBase58());
    assert.equal(game.status.active !== undefined, true);
  });

  it("submits encrypted moves from both players", async () => {
    const [gamePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("game"), gameId],
      program.programId
    );

    const encryptedData = new Uint8Array(256).fill(0xab);
    const iv = new Uint8Array(12).fill(0xcd);
    const clientPubKey = new Uint8Array(32).fill(0xef);

    await program.methods
      .submitMove(
        Array.from(gameId),
        Array.from(encryptedData),
        Array.from(iv),
        Array.from(clientPubKey)
      )
      .accounts({
        gameState: gamePda,
        player: playerOne.publicKey,
      })
      .signers([playerOne])
      .rpc();

    await program.methods
      .submitMove(
        Array.from(gameId),
        Array.from(encryptedData),
        Array.from(iv),
        Array.from(clientPubKey)
      )
      .accounts({
        gameState: gamePda,
        player: playerTwo.publicKey,
      })
      .signers([playerTwo])
      .rpc();

    const game = await program.account.gameState.fetch(gamePda);
    assert.equal(game.playerOneMoves.length, 1);
    assert.equal(game.playerTwoMoves.length, 1);
    assert.equal(game.turn, 1); // Advanced after both submitted
  });
});
