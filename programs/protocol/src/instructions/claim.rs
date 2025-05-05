use crate::errors::ContestError;
use crate::state::config::Config;
use crate::state::contest::TokenDraftContest;
use crate::state::entry::TokenDraftContestEntry;
use crate::state::metadata::ContestMetadata;
use anchor_lang::prelude::*;
use anchor_spl::token::Mint;
use anchor_spl::token_interface::{
    transfer_checked, TokenAccount, TokenInterface, TransferChecked,
};

#[derive(Accounts)]
pub struct ClaimTokenDraftContest<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
        seeds = [b"config"],
        bump
    )]
    pub config: Account<'info, Config>,

    #[account(mut)]
    pub contest: Account<'info, TokenDraftContest>,

    #[account(
        mut,
        seeds = [b"contest_metadata"],
        bump
    )]
    pub contest_metadata: Account<'info, ContestMetadata>,

    #[account(
        mut,
        seeds = [b"token_draft_contest_entry", contest.key().as_ref(), signer.key().as_ref()],
        bump
    )]
    pub contest_entry: Account<'info, TokenDraftContestEntry>,

    #[account(mut)]
    pub mint: Account<'info, Mint>,

    #[account(
        mut,
        token::mint = mint,
        seeds = [b"escrow_token_account", mint.key().to_bytes().as_ref()],
        bump
    )]
    pub escrow_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = mint,
        seeds = [b"fee_token_account", mint.key().to_bytes().as_ref()],
        bump
    )]
    pub fee_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = mint,
        token::authority = signer,
    )]
    pub signer_token_account: InterfaceAccount<'info, TokenAccount>,

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
        b"escrow_token_account",
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
