use crate::constants::seeds::{
    SEED_CONTEST_METADATA, SEED_ESCROW_TOKEN_ACCOUNT, SEED_FEE_TOKEN_ACCOUNT,
    SEED_TOKEN_DRAFT_CONTEST_ENTRY,
};
use crate::state::config::Config;
use crate::state::contest::TokenDraftContest;
use crate::state::entry::TokenDraftContestEntry;
use crate::state::metadata::ContestMetadata;
use crate::{constants::seeds::SEED_CONFIG, errors::ContestError};
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked,
};

#[derive(Accounts)]
pub struct ClaimTokenDraftContest<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
        seeds = [SEED_CONFIG],
        bump
    )]
    pub config: Box<Account<'info, Config>>,

    #[account(mut)]
    pub contest: Box<Account<'info, TokenDraftContest>>,

    #[account(
        mut,
        seeds = [SEED_CONTEST_METADATA],
        bump
    )]
    pub contest_metadata: Box<Account<'info, ContestMetadata>>,

    #[account(
        mut,
        seeds = [SEED_TOKEN_DRAFT_CONTEST_ENTRY, contest.key().as_ref(), signer.key().as_ref()],
        bump
    )]
    pub contest_entry: Box<Account<'info, TokenDraftContestEntry>>,

    #[account(mut)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        mut,
        token::mint = mint,
        seeds = [SEED_ESCROW_TOKEN_ACCOUNT, mint.key().to_bytes().as_ref()],
        bump
    )]
    pub escrow_token_account: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        mut,
        token::mint = mint,
        seeds = [SEED_FEE_TOKEN_ACCOUNT, mint.key().to_bytes().as_ref()],
        bump
    )]
    pub fee_token_account: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        mut,
        token::mint = mint,
        token::authority = signer,
    )]
    pub signer_token_account: Box<InterfaceAccount<'info, TokenAccount>>,

    pub token_program: Interface<'info, TokenInterface>,

    pub system_program: Program<'info, System>,
}

pub fn claim_token_draft_contest(ctx: Context<ClaimTokenDraftContest>) -> Result<()> {
    let contest = &mut ctx.accounts.contest;
    let contest_entry = &mut ctx.accounts.contest_entry;

    // Check if the contest has already ended
    require!(contest.is_resolved, ContestError::ContestNotResolved);

    // Check if the user has already claimed their rewards
    require!(!contest_entry.has_claimed, ContestError::AlreadyClaimed);

    let pos_opt = contest
        .winner_ids
        .iter()
        .position(|&id| id == contest_entry.id);
    require!(pos_opt.is_some(), ContestError::NotWinner);

    let pos = pos_opt.unwrap();
    let alloc = contest.winner_reward_allocation[pos];

    // Calculate the user reward amount based on the credit allocation
    let fee_frac = ctx
        .accounts
        .contest_metadata
        .token_draft_contest_fee_percent as f64
        / 100.0;
    let total_pool_amount = contest.pool_amount();
    let fee_amount = (fee_frac * total_pool_amount as f64).floor() as u64;
    let total_reward_amount = total_pool_amount - fee_amount;
    let user_reward_amount = ((alloc as f64 / 100.0) * (total_reward_amount as f64)).floor() as u64;

    // Transfer the reward to the user's token account
    let cpi_accounts = TransferChecked {
        mint: ctx.accounts.mint.to_account_info(),
        from: ctx.accounts.escrow_token_account.to_account_info(),
        to: ctx.accounts.signer_token_account.to_account_info(),
        authority: ctx.accounts.escrow_token_account.to_account_info(),
    };
    let mint_key = ctx.accounts.mint.key();
    let signer_seeds: &[&[&[u8]]] = &[&[
        SEED_ESCROW_TOKEN_ACCOUNT,
        &mint_key.as_ref(),
        &[ctx.bumps.escrow_token_account],
    ]];
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_context = CpiContext::new(cpi_program, cpi_accounts).with_signer(signer_seeds);
    transfer_checked(cpi_context, user_reward_amount, ctx.accounts.mint.decimals)?;

    // Mark the entry as claimed
    contest_entry.has_claimed = true;

    Ok(())
}
