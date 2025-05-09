use crate::constants::seeds::{SEED_CONTEST_METADATA, SEED_PROGRAM_TOKEN_ACCOUNT};
use crate::state::contest::TokenDraftContest;
use crate::state::credit::TokenDraftContestCredits;
use crate::state::metadata::ContestMetadata;
use crate::{constants::seeds::SEED_TOKEN_DRAFT_CONTEST_CREDITS, errors::ContestError};
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{transfer_checked, Mint, TokenAccount, TokenInterface};
use ephemeral_rollups_sdk::anchor::{commit, delegate, ephemeral};
use ephemeral_rollups_sdk::ephem::{commit_accounts, commit_and_undelegate_accounts};
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
    let winners = find_top_n(&user_avg_rois, num_top_users);

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

    commit_accounts(
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

fn get_token_roi(
    clock: &Clock,
    start_price: f64,
    _feed_id: &Pubkey,
    feed: &Account<'_, PriceUpdateV2>,
) -> Result<f64> {
    let maximum_age = 60;
    let feed_id = _feed_id.to_bytes();
    // let price_data = feed.get_price_no_older_than(clock, maximum_age, &feed_id)?;
    let price_data = feed.get_price_unchecked(&feed_id)?;
    let exp = (-price_data.exponent) as u32;
    let price = (price_data.price as u64 as f64) / (10u64.pow(exp) as f64);
    let delta = price - start_price;
    let roi = (delta / start_price) * 100.0;
    Ok(roi)
}

fn find_top_n(user_avg_rois: &Vec<(usize, f64)>, n: usize) -> Vec<(usize, f64)> {
    let num_entries = user_avg_rois.len();

    if user_avg_rois.len() <= n {
        let mut x = user_avg_rois.clone();
        x.sort_by(|a, b| b.1.total_cmp(&a.1));
        return x;
    }

    let mut min_heap = Vec::with_capacity(n);
    for i in 0..n {
        min_heap.push(user_avg_rois[i]);
    }

    min_heapify(&mut min_heap);

    for i in n..num_entries {
        if user_avg_rois[i].1 > min_heap[0].1 {
            min_heap[0] = user_avg_rois[i];
            sift_down(&mut min_heap, 0);
        }
    }

    min_heap.sort_by(|a, b| b.1.total_cmp(&a.1));

    min_heap
}

fn min_heapify(arr: &mut Vec<(usize, f64)>) {
    let len = arr.len();
    for i in (0..len / 2).rev() {
        sift_down(arr, i);
    }
}

fn sift_down(arr: &mut Vec<(usize, f64)>, mut root: usize) {
    let len = arr.len();
    loop {
        let left = 2 * root + 1;
        let right = 2 * root + 2;
        let mut smallest = root;

        if left < len && arr[left].1 < arr[smallest].1 {
            smallest = left;
        }

        if right < len && arr[right].1 < arr[smallest].1 {
            smallest = right;
        }

        if smallest == root {
            break;
        }

        arr.swap(root, smallest);
        root = smallest;
    }
}

fn calc_avg_roi(allocation: &[u8], token_rois: &Vec<f64>) -> f64 {
    let mut avg_roi = 0.0;

    for (i, &alloc) in allocation.iter().enumerate() {
        avg_roi += ((alloc as f64) / 100.0) * token_rois[i];
    }

    avg_roi
}
