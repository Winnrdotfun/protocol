use anchor_lang::prelude::*;
use pyth_solana_receiver_sdk::price_update::PriceUpdateV2;
use crate::state::contest::{TokenDraftContest, MAX_TOKEN_PER_DRAFT};
use crate::state::metadata::ContestMetadata;
use crate::errors::ContestError;

#[derive(Accounts)]
pub struct CreateTokenDraftContest<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
        mut,
        seeds = [b"contest_metadata"],
        bump
    )]
    pub contest_metadata: Account<'info, ContestMetadata>,

    #[account(
        init,
        payer = signer,
        space = 8 + TokenDraftContest::INIT_SPACE,
        seeds = [b"token_draft_contest", contest_metadata.token_draft_contest_count.to_le_bytes().as_ref(), signer.key().as_ref()],
        bump
    )]
    pub contest: Account<'info, TokenDraftContest>,

    pub feed0: Option<Account<'info, PriceUpdateV2>>,
    pub feed1: Option<Account<'info, PriceUpdateV2>>,
    pub feed2: Option<Account<'info, PriceUpdateV2>>,
    pub feed3: Option<Account<'info, PriceUpdateV2>>,
    pub feed4: Option<Account<'info, PriceUpdateV2>>,

    pub system_program: Program<'info, System>,
}

pub fn create_token_draft_contest(
    ctx: Context<CreateTokenDraftContest>,
    start_time: u64,
    end_time: u64,
    entry_fee: u64,
    max_entries: u32,
    num_winners: u32,
    token_feed_ids: Vec<Pubkey>,
) -> Result<()> {
    let contest = &mut ctx.accounts.contest;
    let current_time = Clock::get()?.unix_timestamp as u64;

    // Contest must start in some future time
    require!(start_time > current_time, ContestError::InvalidDuration);

    // Contest must end later than it starts
    require!(end_time > start_time, ContestError::InvalidDuration);

    // Number of winners must be greater than 0 and less than or equal to max_entries
    // require!(num_winners > 0 && num_winners <= max_entries, ContestError::InvalidWinnersCount);

    // At least one token must be selected for the draft and no more than MAX_TOKEN_PER_DRAFT
    require!(token_feed_ids.len() > 0 && token_feed_ids.len() <= MAX_TOKEN_PER_DRAFT, ContestError::InvalidDraftTokenCount);

    let feed_accounts: Vec<&Option<Account<'_, PriceUpdateV2>>> = vec![
        &ctx.accounts.feed0,
        &ctx.accounts.feed1,
        &ctx.accounts.feed2,
        &ctx.accounts.feed3,
        &ctx.accounts.feed4,
        ];

    let clock = Clock::get()?;
    contest.token_start_prices = Vec::new();
    for (i, feed_id) in token_feed_ids.iter().enumerate() {
        require!(feed_accounts[i].is_some(), ContestError::InvalidFeeds);
        let feed_account = feed_accounts[i].as_ref().unwrap();
        let price = get_token_price(&clock, &feed_id, feed_account)?;
        contest.token_start_prices.push(price);
    }
        
    contest.id = ctx.accounts.contest_metadata.token_draft_contest_count;
    contest.creator = ctx.accounts.signer.key();
    contest.start_time = start_time;
    contest.end_time = end_time;
    contest.entry_fee = entry_fee;
    contest.max_entries = max_entries;
    contest.num_winners = num_winners;
    contest.num_entries = 0;
    contest.token_feed_ids = token_feed_ids;
    contest.is_resolved = false;

    Ok(())
}

fn get_token_price(clock: &Clock, _feed_id: &Pubkey, feed: &Account<'_, PriceUpdateV2>) -> Result<f64> {
    let maximum_age = 60;
    let feed_id = _feed_id.to_bytes();
    // let price_data = feed.get_price_no_older_than(clock, maximum_age, &feed_id)?;
    let price_data = feed.get_price_unchecked(&feed_id)?;
    let exp = (-price_data.exponent) as u32;
    let price = (price_data.price as u64 as f64) / (10u64.pow(exp) as f64);
    Ok(price)
}