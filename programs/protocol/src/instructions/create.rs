use crate::errors::ContestError;
use crate::state::contest::{TokenDraftContest, MAX_TOKEN_PER_DRAFT};
use crate::state::credit::TokenDraftContestCredits;
use crate::state::metadata::ContestMetadata;
use anchor_lang::prelude::*;
use pyth_solana_receiver_sdk::price_update::PriceUpdateV2;

#[derive(Accounts)]
pub struct CreateTokenDraftContest<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
        mut,
        seeds = [b"contest_metadata"],
        bump
    )]
    pub contest_metadata: Box<Account<'info, ContestMetadata>>,

    #[account(
        init,
        payer = signer,
        space = 8 + TokenDraftContest::INIT_SPACE,
        seeds = [b"token_draft_contest", contest_metadata.token_draft_contest_count.to_le_bytes().as_ref(), signer.key().as_ref()],
        bump
    )]
    pub contest: Box<Account<'info, TokenDraftContest>>,

    #[account(
        init,
        payer = signer,
        space = 8 + TokenDraftContest::INIT_SPACE,
        seeds = [b"token_draft_contest_credits", contest.key().as_ref()],
        bump
    )]
    pub contest_credits: Box<Account<'info, TokenDraftContestCredits>>,

    pub feed0: Option<Box<Account<'info, PriceUpdateV2>>>,
    pub feed1: Option<Box<Account<'info, PriceUpdateV2>>>,
    pub feed2: Option<Box<Account<'info, PriceUpdateV2>>>,
    pub feed3: Option<Box<Account<'info, PriceUpdateV2>>>,
    pub feed4: Option<Box<Account<'info, PriceUpdateV2>>>,

    pub system_program: Program<'info, System>,
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
    let contest = &mut ctx.accounts.contest;
    let current_time = Clock::get()?.unix_timestamp as u64;

    // Contest must start in some future time
    require!(start_time > current_time, ContestError::InvalidDuration);

    // Contest must end later than it starts
    require!(end_time > start_time, ContestError::InvalidDuration);

    // Reward allocation must be sorted in descending order and sum to 100
    let is_allocation_good = reward_allocation.windows(2).all(|v| v[0] >= v[1])
        && reward_allocation.iter().sum::<u8>() == 100;
    require!(is_allocation_good, ContestError::InvalidRewardAllocation);

    // At least one token must be selected for the draft and no more than MAX_TOKEN_PER_DRAFT
    require!(
        token_feed_ids.len() > 0 && token_feed_ids.len() <= MAX_TOKEN_PER_DRAFT,
        ContestError::InvalidDraftTokenCount
    );

    // Check that valid feeds are provided
    let feed_accounts: Vec<&Option<Box<Account<'_, PriceUpdateV2>>>> = vec![
        &ctx.accounts.feed0,
        &ctx.accounts.feed1,
        &ctx.accounts.feed2,
        &ctx.accounts.feed3,
        &ctx.accounts.feed4,
    ];
    for (i, _feed_id) in token_feed_ids.iter().enumerate() {
        require!(feed_accounts[i].is_some(), ContestError::InvalidFeeds);
    }

    // Set contest parameters
    contest.id = ctx
        .accounts
        .contest_metadata
        // .load()?
        .token_draft_contest_count;
    contest.creator = ctx.accounts.signer.key();
    contest.start_time = start_time;
    contest.end_time = end_time;
    contest.entry_fee = entry_fee;
    contest.max_entries = max_entries;
    contest.token_feed_ids = token_feed_ids;
    contest.is_resolved = false;

    // Initialize credit data
    ctx.accounts.contest_credits.contest_key = contest.key();

    // Initialize winner data
    ctx.accounts.contest.winner_reward_allocation = reward_allocation;

    // Update contest metadata
    ctx.accounts.contest_metadata.token_draft_contest_count += 1;

    Ok(())
}
