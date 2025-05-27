use crate::errors::ContestError;
use crate::state::contest::TokenDraftContest;
use anchor_lang::prelude::*;
use pyth_solana_receiver_sdk::price_update::PriceUpdateV2;

#[derive(Accounts)]
pub struct PostTokenDraftContestPrices<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(mut)]
    pub contest: Box<Account<'info, TokenDraftContest>>,

    pub start_price_feed0: Option<Box<Account<'info, PriceUpdateV2>>>,
    pub start_price_feed1: Option<Box<Account<'info, PriceUpdateV2>>>,
    pub start_price_feed2: Option<Box<Account<'info, PriceUpdateV2>>>,
    pub start_price_feed3: Option<Box<Account<'info, PriceUpdateV2>>>,
    pub start_price_feed4: Option<Box<Account<'info, PriceUpdateV2>>>,

    pub end_price_feed0: Option<Box<Account<'info, PriceUpdateV2>>>,
    pub end_price_feed1: Option<Box<Account<'info, PriceUpdateV2>>>,
    pub end_price_feed2: Option<Box<Account<'info, PriceUpdateV2>>>,
    pub end_price_feed3: Option<Box<Account<'info, PriceUpdateV2>>>,
    pub end_price_feed4: Option<Box<Account<'info, PriceUpdateV2>>>,

    pub system_program: Program<'info, System>,
}

pub fn post_token_draft_contest_prices(ctx: Context<PostTokenDraftContestPrices>) -> Result<()> {
    require!(
        ctx.accounts.contest.has_ended(),
        ContestError::ContestNotEnded
    );

    // Set start and end prices for each token
    let start_price_feed_accounts: Vec<&Option<Box<Account<'_, PriceUpdateV2>>>> = vec![
        &ctx.accounts.start_price_feed0,
        &ctx.accounts.start_price_feed1,
        &ctx.accounts.start_price_feed2,
        &ctx.accounts.start_price_feed3,
        &ctx.accounts.start_price_feed4,
    ];

    let end_price_feed_accounts: Vec<&Option<Box<Account<'_, PriceUpdateV2>>>> = vec![
        &ctx.accounts.end_price_feed0,
        &ctx.accounts.end_price_feed1,
        &ctx.accounts.end_price_feed2,
        &ctx.accounts.end_price_feed3,
        &ctx.accounts.end_price_feed4,
    ];

    let clock = Clock::get()?;
    let mut token_start_prices: Vec<f64> = Vec::new();
    let mut token_end_prices: Vec<f64> = Vec::new();

    for (i, feed_id) in ctx.accounts.contest.token_feed_ids.iter().enumerate() {
        require!(
            start_price_feed_accounts[i].is_some() && end_price_feed_accounts[i].is_some(),
            ContestError::InvalidFeeds
        );

        let start_price = get_token_price(
            &clock,
            &feed_id,
            start_price_feed_accounts[i].as_ref().unwrap(),
        )?;
        token_start_prices.push(start_price);

        let end_price = get_token_price(
            &clock,
            &feed_id,
            end_price_feed_accounts[i].as_ref().unwrap(),
        )?;
        token_end_prices.push(end_price);
    }

    ctx.accounts.contest.token_start_prices = token_start_prices;
    ctx.accounts.contest.token_end_prices = token_end_prices;

    Ok(())
}

fn get_token_price(
    clock: &Clock,
    _feed_id: &Pubkey,
    feed: &Account<'_, PriceUpdateV2>,
) -> Result<f64> {
    let maximum_age = 60;
    let feed_id = _feed_id.to_bytes();
    // let price_data = feed.get_price_no_older_than(clock, maximum_age, &feed_id)?;
    let price_data = feed.get_price_unchecked(&feed_id)?;
    let exp = (-price_data.exponent) as u32;
    let price = (price_data.price as u64 as f64) / (10u64.pow(exp) as f64);
    Ok(price)
}
