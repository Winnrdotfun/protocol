use crate::constants::seeds::{SEED_CONTEST_METADATA, SEED_PROGRAM_TOKEN_ACCOUNT};
use crate::instructions::calc_avg_roi;
use crate::state::contest::TokenDraftContest;
use crate::state::credit::TokenDraftContestCredits;
use crate::state::metadata::ContestMetadata;
use crate::utils::roi::find_top_n_rois;
use crate::{constants::seeds::SEED_TOKEN_DRAFT_CONTEST_CREDITS, errors::ContestError};
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};
use ephemeral_rollups_sdk::anchor::{commit, MagicProgram};
use ephemeral_rollups_sdk::ephem::commit_and_undelegate_accounts;
use pyth_solana_receiver_sdk::price_update::PriceUpdateV2;

#[commit]
#[derive(Accounts)]
pub struct ResolveTokenDraftContestEr<'info> {
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

    #[account(mut)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        mut,
        token::mint = mint,
        seeds = [SEED_PROGRAM_TOKEN_ACCOUNT, mint.key().to_bytes().as_ref()],
        bump
    )]
    pub program_token_account: Box<InterfaceAccount<'info, TokenAccount>>,

    pub feed0: Option<Box<Account<'info, PriceUpdateV2>>>,
    pub feed1: Option<Box<Account<'info, PriceUpdateV2>>>,
    pub feed2: Option<Box<Account<'info, PriceUpdateV2>>>,
    pub feed3: Option<Box<Account<'info, PriceUpdateV2>>>,
    pub feed4: Option<Box<Account<'info, PriceUpdateV2>>>,

    pub token_program: Interface<'info, TokenInterface>,

    pub system_program: Program<'info, System>,
}

pub fn er_resolve_token_draft_contest(ctx: Context<ResolveTokenDraftContestEr>) -> Result<()> {
    let contest = &ctx.accounts.contest;

    // Check that contest is not already resolved
    require!(!contest.is_resolved, ContestError::AlreadyResolved);

    // Check that end time has passed
    require!(contest.has_ended(), ContestError::ContestNotEnded);

    // Check that contest has sufficient entries
    if contest.has_insufficient_entries() {
        // If not enough entries, cancel the contest without any winners
        ctx.accounts.contest.is_resolved = true;
        return Ok(());
    }

    // Check start and end prices are set
    require!(contest.has_prices(), ContestError::ContestPricesNotSet);

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
    let num_winners = ctx.accounts.contest.winner_reward_allocation.len();
    let winners = find_top_n_rois(&user_avg_rois, num_winners);

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

    ctx.accounts.contest_metadata.exit(&crate::ID)?;
    ctx.accounts.contest.exit(&crate::ID)?;
    commit_and_undelegate_accounts(
        &ctx.accounts.signer,
        vec![
            &ctx.accounts.contest_metadata.to_account_info(),
            &ctx.accounts.contest.to_account_info(),
        ],
        &ctx.accounts.magic_context,
        &ctx.accounts.magic_program,
    )?;

    Ok(())
}
