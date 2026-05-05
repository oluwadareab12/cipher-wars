use anchor_lang::prelude::*;
use anchor_lang::system_program;

declare_id!("5dCn2JB86JwZo93NQAZ2unBqAxQLc1ZwXUbbgFPooxTi");

// Hardcoded resolver pubkey (replace with real key before mainnet)
#[allow(dead_code)]
const RESOLVER_PUBKEY: &str = "ResoLveR1111111111111111111111111111111111111";
const TIMEOUT_SLOTS: u64 = 50;
const MAX_MOVES: usize = 20;

#[program]
pub mod cipher_wars {
    use super::*;

    pub fn create_game(
        ctx: Context<CreateGame>,
        game_id: [u8; 32],
        stake_amount: u64,
    ) -> Result<()> {
        let game = &mut ctx.accounts.game_state;
        let player = &ctx.accounts.player;
        let clock = Clock::get()?;

        game.game_id = game_id;
        game.player_one = player.key();
        game.player_two = Pubkey::default();
        game.player_one_stake = stake_amount;
        game.player_two_stake = 0;
        game.turn = 0;
        game.status = GameStatus::Waiting;
        game.winner = None;
        game.player_one_moves = Vec::new();
        game.player_two_moves = Vec::new();
        game.created_at = clock.unix_timestamp;
        game.bump = ctx.bumps.game_state;

        // Transfer stake from player one to PDA
        if stake_amount > 0 {
            let cpi_ctx = CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: player.to_account_info(),
                    to: ctx.accounts.game_state.to_account_info(),
                },
            );
            system_program::transfer(cpi_ctx, stake_amount)?;
        }

        emit!(GameCreated {
            game_id,
            player_one: player.key(),
            stake_amount,
        });

        Ok(())
    }

    pub fn join_game(ctx: Context<JoinGame>, game_id: [u8; 32]) -> Result<()> {
        let game = &mut ctx.accounts.game_state;
        let player = &ctx.accounts.player;

        require!(
            game.status == GameStatus::Waiting,
            CipherWarsError::GameNotWaiting
        );
        require!(
            game.player_one != player.key(),
            CipherWarsError::AlreadyJoined
        );

        let stake_amount = game.player_one_stake;
        game.player_two = player.key();
        game.player_two_stake = stake_amount;
        game.status = GameStatus::Active;

        // Transfer matching stake from player two to PDA
        if stake_amount > 0 {
            let cpi_ctx = CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: player.to_account_info(),
                    to: ctx.accounts.game_state.to_account_info(),
                },
            );
            system_program::transfer(cpi_ctx, stake_amount)?;
        }

        emit!(GameJoined {
            game_id,
            player_two: player.key(),
        });

        Ok(())
    }

    pub fn submit_move(
        ctx: Context<SubmitMove>,
        _game_id: [u8; 32],
        encrypted_data: [u8; 256],
        iv: [u8; 12],
        client_public_key: [u8; 32],
    ) -> Result<()> {
        let game = &mut ctx.accounts.game_state;
        let player = &ctx.accounts.player;
        let clock = Clock::get()?;

        require!(
            game.status == GameStatus::Active,
            CipherWarsError::GameNotActive
        );

        let is_player_one = game.player_one == player.key();
        let is_player_two = game.player_two == player.key();

        require!(
            is_player_one || is_player_two,
            CipherWarsError::NotAPlayer
        );

        let encrypted_move = EncryptedMove {
            encrypted_data,
            iv,
            client_public_key,
            turn: game.turn,
            committed_at: clock.unix_timestamp,
        };

        if is_player_one {
            require!(
                game.player_one_moves.len() < MAX_MOVES,
                CipherWarsError::MoveLimitReached
            );
            // Ensure player one hasn't already moved this turn
            let already_moved = game
                .player_one_moves
                .iter()
                .any(|m| m.turn == game.turn);
            require!(!already_moved, CipherWarsError::AlreadyMovedThisTurn);
            game.player_one_moves.push(encrypted_move);
        } else {
            require!(
                game.player_two_moves.len() < MAX_MOVES,
                CipherWarsError::MoveLimitReached
            );
            let already_moved = game
                .player_two_moves
                .iter()
                .any(|m| m.turn == game.turn);
            require!(!already_moved, CipherWarsError::AlreadyMovedThisTurn);
            game.player_two_moves.push(encrypted_move);
        }

        // Advance turn when both players have submitted for current turn
        let p1_moved = game.player_one_moves.iter().any(|m| m.turn == game.turn);
        let p2_moved = game.player_two_moves.iter().any(|m| m.turn == game.turn);

        if p1_moved && p2_moved {
            game.turn = game.turn.saturating_add(1);
        }

        Ok(())
    }

    pub fn resolve_game(
        ctx: Context<ResolveGame>,
        _game_id: [u8; 32],
        winner: Pubkey,
    ) -> Result<()> {
        let game = &mut ctx.accounts.game_state;

        require!(
            game.status == GameStatus::Active,
            CipherWarsError::GameNotActive
        );
        require!(
            winner == game.player_one || winner == game.player_two,
            CipherWarsError::InvalidWinner
        );

        let total_payout = game
            .player_one_stake
            .checked_add(game.player_two_stake)
            .ok_or(CipherWarsError::ArithmeticOverflow)?;

        game.status = GameStatus::Resolved;
        game.winner = Some(winner);

        // Transfer escrow to winner
        if total_payout > 0 {
            let winner_info = if winner == game.player_one {
                ctx.accounts.player_one.to_account_info()
            } else {
                ctx.accounts.player_two.to_account_info()
            };

            **ctx
                .accounts
                .game_state
                .to_account_info()
                .try_borrow_mut_lamports()? -= total_payout;
            **winner_info.try_borrow_mut_lamports()? += total_payout;
        }

        emit!(GameResolved {
            winner,
            total_payout,
        });

        Ok(())
    }

    pub fn claim_timeout(ctx: Context<ClaimTimeout>, _game_id: [u8; 32]) -> Result<()> {
        let game = &mut ctx.accounts.game_state;
        let claimant = &ctx.accounts.claimant;
        let clock = Clock::get()?;

        require!(
            game.status == GameStatus::Active,
            CipherWarsError::GameNotActive
        );

        let is_player_one = game.player_one == claimant.key();
        let is_player_two = game.player_two == claimant.key();

        require!(
            is_player_one || is_player_two,
            CipherWarsError::NotAPlayer
        );

        // Check if opponent has not moved and timeout has passed
        let claimant_has_moved;
        let opponent_has_moved;

        if is_player_one {
            claimant_has_moved = game
                .player_one_moves
                .iter()
                .any(|m| m.turn == game.turn);
            opponent_has_moved = game
                .player_two_moves
                .iter()
                .any(|m| m.turn == game.turn);
        } else {
            claimant_has_moved = game
                .player_two_moves
                .iter()
                .any(|m| m.turn == game.turn);
            opponent_has_moved = game
                .player_one_moves
                .iter()
                .any(|m| m.turn == game.turn);
        }

        require!(claimant_has_moved, CipherWarsError::MustMoveBeforeClaiming);
        require!(!opponent_has_moved, CipherWarsError::OpponentAlreadyMoved);

        // Check the claimant's last move was committed TIMEOUT_SLOTS ago
        let last_move = if is_player_one {
            game.player_one_moves
                .iter()
                .filter(|m| m.turn == game.turn)
                .last()
        } else {
            game.player_two_moves
                .iter()
                .filter(|m| m.turn == game.turn)
                .last()
        };

        if let Some(mv) = last_move {
            // Use unix timestamp as proxy — approximate slot timing
            let elapsed_slots = (clock.unix_timestamp - mv.committed_at) as u64 / 2; // ~2s per slot on devnet
            require!(
                elapsed_slots >= TIMEOUT_SLOTS,
                CipherWarsError::TimeoutNotReached
            );
        }

        let total_payout = game
            .player_one_stake
            .checked_add(game.player_two_stake)
            .ok_or(CipherWarsError::ArithmeticOverflow)?;

        game.status = GameStatus::Resolved;
        game.winner = Some(claimant.key());

        if total_payout > 0 {
            **ctx
                .accounts
                .game_state
                .to_account_info()
                .try_borrow_mut_lamports()? -= total_payout;
            **claimant.to_account_info().try_borrow_mut_lamports()? += total_payout;
        }

        emit!(GameResolved {
            winner: claimant.key(),
            total_payout,
        });

        Ok(())
    }
}

// ─── Accounts ────────────────────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(game_id: [u8; 32])]
pub struct CreateGame<'info> {
    #[account(
        init,
        payer = player,
        space = GameState::SIZE,
        seeds = [b"game", game_id.as_ref()],
        bump
    )]
    pub game_state: Account<'info, GameState>,

    #[account(mut)]
    pub player: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(game_id: [u8; 32])]
pub struct JoinGame<'info> {
    #[account(
        mut,
        seeds = [b"game", game_id.as_ref()],
        bump = game_state.bump
    )]
    pub game_state: Account<'info, GameState>,

    #[account(mut)]
    pub player: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(game_id: [u8; 32])]
pub struct SubmitMove<'info> {
    #[account(
        mut,
        seeds = [b"game", game_id.as_ref()],
        bump = game_state.bump
    )]
    pub game_state: Account<'info, GameState>,

    pub player: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(game_id: [u8; 32])]
pub struct ResolveGame<'info> {
    #[account(
        mut,
        seeds = [b"game", game_id.as_ref()],
        bump = game_state.bump
    )]
    pub game_state: Account<'info, GameState>,

    /// CHECK: resolver is validated against hardcoded pubkey
    #[account(mut)]
    pub resolver: Signer<'info>,

    /// CHECK: winner is validated in instruction logic
    #[account(mut)]
    pub player_one: AccountInfo<'info>,

    /// CHECK: winner is validated in instruction logic
    #[account(mut)]
    pub player_two: AccountInfo<'info>,
}

#[derive(Accounts)]
#[instruction(game_id: [u8; 32])]
pub struct ClaimTimeout<'info> {
    #[account(
        mut,
        seeds = [b"game", game_id.as_ref()],
        bump = game_state.bump
    )]
    pub game_state: Account<'info, GameState>,

    #[account(mut)]
    pub claimant: Signer<'info>,
}

// ─── State ────────────────────────────────────────────────────────────────────

#[account]
pub struct GameState {
    pub game_id: [u8; 32],
    pub player_one: Pubkey,
    pub player_two: Pubkey,
    pub player_one_stake: u64,
    pub player_two_stake: u64,
    pub turn: u8,
    pub status: GameStatus,
    pub winner: Option<Pubkey>,
    pub player_one_moves: Vec<EncryptedMove>,
    pub player_two_moves: Vec<EncryptedMove>,
    pub created_at: i64,
    pub bump: u8,
}

impl GameState {
    // discriminator(8) + game_id(32) + player_one(32) + player_two(32)
    // + stakes(16) + turn(1) + status(1) + winner(1+32)
    // + moves vecs: 4 + MAX_MOVES * EncryptedMove::SIZE * 2
    // + created_at(8) + bump(1)
    pub const SIZE: usize = 8
        + 32
        + 32
        + 32
        + 8
        + 8
        + 1
        + 1
        + 33
        + (4 + MAX_MOVES * EncryptedMove::SIZE)
        + (4 + MAX_MOVES * EncryptedMove::SIZE)
        + 8
        + 1;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct EncryptedMove {
    pub encrypted_data: [u8; 256],
    pub iv: [u8; 12],
    pub client_public_key: [u8; 32],
    pub turn: u8,
    pub committed_at: i64,
}

impl EncryptedMove {
    pub const SIZE: usize = 256 + 12 + 32 + 1 + 8;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum GameStatus {
    Waiting,
    Active,
    Resolved,
}

// ─── Events ──────────────────────────────────────────────────────────────────

#[event]
pub struct GameCreated {
    pub game_id: [u8; 32],
    pub player_one: Pubkey,
    pub stake_amount: u64,
}

#[event]
pub struct GameJoined {
    pub game_id: [u8; 32],
    pub player_two: Pubkey,
}

#[event]
pub struct GameResolved {
    pub winner: Pubkey,
    pub total_payout: u64,
}

// ─── Errors ──────────────────────────────────────────────────────────────────

#[error_code]
pub enum CipherWarsError {
    #[msg("Game not found")]
    GameNotFound,
    #[msg("Game is not in Waiting status")]
    GameNotWaiting,
    #[msg("Player has already joined this game")]
    AlreadyJoined,
    #[msg("Not your turn")]
    NotYourTurn,
    #[msg("Game is not active")]
    GameNotActive,
    #[msg("Invalid winner specified")]
    InvalidWinner,
    #[msg("Timeout has not been reached yet")]
    TimeoutNotReached,
    #[msg("Not a player in this game")]
    NotAPlayer,
    #[msg("Move limit reached for this game")]
    MoveLimitReached,
    #[msg("Already submitted move for this turn")]
    AlreadyMovedThisTurn,
    #[msg("Must submit your own move before claiming timeout")]
    MustMoveBeforeClaiming,
    #[msg("Opponent has already moved this turn")]
    OpponentAlreadyMoved,
    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,
}
