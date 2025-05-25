use crate::constants::seeds::{SEED_CONTEST_METADATA, SEED_PROGRAM_TOKEN_ACCOUNT};
use crate::instructions::{calc_avg_roi, get_token_roi};
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

pub fn resolve_token_draft_contest_er(ctx: Context<ResolveTokenDraftContestEr>) -> Result<()> {
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

    require!(!contest.is_resolved, ContestError::AlreadyResolved);

    let feed_accounts: Vec<&Option<Box<Account<'_, PriceUpdateV2>>>> = vec![
        &ctx.accounts.feed0,
        &ctx.accounts.feed1,
        &ctx.accounts.feed2,
        &ctx.accounts.feed3,
        &ctx.accounts.feed4,
    ];

    let clock = Clock::get()?;
    let mut token_rois: Vec<f64> = Vec::new();
    for (i, feed_id) in contest.token_feed_ids.iter().enumerate() {
        require!(feed_accounts[i].is_some(), ContestError::InvalidFeeds);
        let feed_account = feed_accounts[i].as_ref().unwrap();
        let start_price = contest.token_start_prices[i];
        let price = get_token_roi(&clock, start_price, &feed_id, feed_account)?;
        token_rois.push(price);
    }
    ctx.accounts.contest.token_rois = token_rois.clone();

    // Calculate the average ROI for each user
    let num_entries = ctx.accounts.contest.num_entries as usize;
    let num_tokens = ctx.accounts.contest.token_feed_ids.len();
    let credit_allocations = &ctx.accounts.contest_credits.credit_allocations;
    let mut user_avg_rois: Vec<(usize, f64)> = Vec::with_capacity(num_entries);
    for i in 0..num_entries {
        let alloc = &credit_allocations[(i * num_tokens)..(i * num_tokens + num_tokens)];
        user_avg_rois.push((i, calc_avg_roi(alloc, &token_rois)))
    }

    // Find the top N users
    let num_top_users = ctx.accounts.contest.winner_reward_allocation.len();
    let winners = find_top_n_rois(&user_avg_rois, num_top_users);

    // Store the top N users
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
