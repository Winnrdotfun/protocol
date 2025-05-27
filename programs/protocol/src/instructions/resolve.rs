use crate::constants::seeds::SEED_CONTEST_METADATA;
use crate::state::contest::TokenDraftContest;
use crate::state::credit::TokenDraftContestCredits;
use crate::state::metadata::ContestMetadata;
use crate::utils::roi::find_top_n_rois;
use crate::{constants::seeds::SEED_TOKEN_DRAFT_CONTEST_CREDITS, errors::ContestError};
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct ResolveTokenDraftContest<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
        mut,
        seeds = [SEED_CONTEST_METADATA],
        bump
    )]
    pub contest_metadata: Box<Account<'info, ContestMetadata>>,

    #[account(mut)]
    pub contest: Box<Account<'info, TokenDraftContest>>,

    #[account(
        mut,
        seeds = [SEED_TOKEN_DRAFT_CONTEST_CREDITS, contest.key().as_ref()],
        bump
    )]
    pub contest_credits: Box<Account<'info, TokenDraftContestCredits>>,

    pub system_program: Program<'info, System>,
}

pub fn resolve_token_draft_contest(ctx: Context<ResolveTokenDraftContest>) -> Result<()> {
    let contest = &ctx.accounts.contest;
    let current_time = Clock::get()?.unix_timestamp as u64;

    require!(
        contest.token_start_prices.len() > 0,
        ContestError::ContestPriceNotSet
    );

    // Check that end time has passed
    require!(
        current_time > contest.end_time,
        ContestError::ContestNotEnded
    );

    // Check that contest is not already resolved
    require!(!contest.is_resolved, ContestError::AlreadyResolved);

    // Calculate the ROI by each token
    let num_tokens = contest.token_feed_ids.len();
    let mut token_rois: Vec<f64> = Vec::new();
    for i in 0..num_tokens {
        let start_price = contest.token_start_prices[i];
        let end_price = contest.token_end_prices[i];
        let roi = ((end_price - start_price) / start_price) * 100.0;
        token_rois.push(roi);
    }

    // Calculate the average ROI of each user
    let num_entries = ctx.accounts.contest.num_entries as usize;
    let credit_allocations = &ctx.accounts.contest_credits.credit_allocations;
    let mut user_avg_rois: Vec<(usize, f64)> = Vec::with_capacity(num_entries);
    for i in 0..num_entries {
        let alloc = &credit_allocations[(i * num_tokens)..(i * num_tokens + num_tokens)];
        user_avg_rois.push((i, calc_avg_roi(alloc, &token_rois)));
    }

    // Find the top n users
    let num_top_users = ctx.accounts.contest.winner_reward_allocation.len();
    let winners = find_top_n_rois(&user_avg_rois, num_top_users);

    // Store the top n users
    ctx.accounts.contest.winner_ids = winners.iter().map(|v| v.0 as u32).collect();
    ctx.accounts.contest.is_resolved = true;

    // Accumulate the fee amount from this contest
    let fee_frac = ctx
        .accounts
        .contest_metadata
        .token_draft_contest_fee_percent as f64
        / 100.0;
    let total_pool_amount = ctx.accounts.contest.pool_amount() as f64;
    let fee_amount = (fee_frac * total_pool_amount).floor() as u64;
    ctx.accounts.contest_metadata.token_draft_contest_fee_amount += fee_amount;

    Ok(())
}

pub fn calc_avg_roi(allocation: &[u8], token_rois: &Vec<f64>) -> f64 {
    let mut avg_roi = 0.0;

    for (i, &alloc) in allocation.iter().enumerate() {
        avg_roi += ((alloc as f64) / 100.0) * token_rois[i];
    }

    avg_roi
}
