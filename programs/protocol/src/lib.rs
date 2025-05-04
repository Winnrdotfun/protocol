use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("E35TzkfrR1LoNEevvRFK9frvrFQgSGxN251rvpVrzW2");

#[program]
pub mod protocol {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, token_draft_contest_fee_percent: u8) -> Result<()> {
        initialize::initialize(ctx, token_draft_contest_fee_percent)
    }

    pub fn create_token_draft_contest(
        ctx: Context<CreateTokenDraftContest>,
        start_time: u64,
        end_time: u64,
        entry_fee: u64,
        max_entries: u32,
        token_feed_ids: Vec<Pubkey>,
        reward_allocation: Vec<u8>,
    ) -> Result<()> {
        create::create_token_draft_contest(
            ctx,
            start_time,
            end_time,
            entry_fee,
            max_entries,
            token_feed_ids,
            reward_allocation,
        )
    }

    pub fn enter_token_draft_contest(
        ctx: Context<EnterTokenDraftContest>,
        credit_allocation: Vec<u8>,
    ) -> Result<()> {
        enter::enter_token_draft_contest(ctx, credit_allocation)
    }

    pub fn resolve_token_draft_contest(ctx: Context<ResolveTokenDraftContest>) -> Result<()> {
        resolve::resolve_token_draft_contest(ctx)
    }

    pub fn claim_token_draft_contest(ctx: Context<ClaimTokenDraftContest>) -> Result<()> {
        claim::claim_token_draft_contest(ctx)
    }

    pub fn withdraw_fee(ctx: Context<WithdrawFee>) -> Result<()> {
        withdraw_fee::withdraw_fee(ctx)
    }
}
