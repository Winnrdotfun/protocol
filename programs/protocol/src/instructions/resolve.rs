use anchor_lang::prelude::*;
use pyth_solana_receiver_sdk::price_update::PriceUpdateV2;
use crate::state::contest::TokenDraftContest;
use crate::errors::ContestError;

#[derive(Accounts)]
pub struct ResolveTokenDraftContest<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(mut)]
    pub contest: Account<'info, TokenDraftContest>,

    pub feed0: Option<Account<'info, PriceUpdateV2>>,
    pub feed1: Option<Account<'info, PriceUpdateV2>>,
    pub feed2: Option<Account<'info, PriceUpdateV2>>,
    pub feed3: Option<Account<'info, PriceUpdateV2>>,
    pub feed4: Option<Account<'info, PriceUpdateV2>>,
    
    pub system_program: Program<'info, System>,
}

pub fn resolve_token_draft_contest(
    ctx: Context<ResolveTokenDraftContest>,
) -> Result<()> {
    let contest = &mut ctx.accounts.contest;
    let current_time = Clock::get()?.unix_timestamp as u64;

    // Check that end time has passed
    // require!(current_time > contest.end_time, ContestError::ContestNotEnded);

    require!(!contest.is_resolved, ContestError::AlreadyResolved);

    let feed_accounts: Vec<&Option<Account<'_, PriceUpdateV2>>> = vec![
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
    contest.token_rois = token_rois;
    contest.is_resolved = true;

    Ok(())
}

fn get_token_roi(clock: &Clock, start_price: f64, _feed_id: &Pubkey, feed: &Account<'_, PriceUpdateV2>) -> Result<f64> {
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