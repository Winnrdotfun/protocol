use anchor_lang::prelude::*;
use anchor_spl::token_interface::{TokenAccount, TokenInterface, TransferChecked, transfer_checked};
use anchor_spl::token::Mint;
use crate::state::contest::TokenDraftContest;
use crate::state::entry::TokenDraftContestEntry;
use crate::state::credit::TokenDraftContestCredits;
use crate::state::config::Config;
use crate::errors::ContestError;

#[derive(Accounts)]
pub struct ClaimTokenDraftContest<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
        seeds = [b"config"],
        bump
    )]
    pub config: Account<'info, Config>,

    #[account(
        mut,
        seeds = [b"token_draft_contest", contest.key().as_ref()],
        bump
    )]
    pub contest: Account<'info, TokenDraftContest>,

    #[account(
        mut,
        seeds = [b"token_draft_contest_entry", contest.key().as_ref(), signer.key().as_ref()],
        bump
    )]
    pub contest_entry: Account<'info, TokenDraftContestEntry>,

    #[account(
        mut,
        realloc = contest_credits.to_account_info().data_len() + 32,
        realloc::payer = signer,
        realloc::zero = false,
        seeds = [b"token_draft_contest_credits", contest.key().as_ref()],
        bump
    )]
    pub contest_credits: Account<'info, TokenDraftContestCredits>,

    #[account(mut)]
    pub mint: Account<'info, Mint>,

    #[account(
        mut,
        token::mint = mint,
        seeds = [b"token_account", mint.key().to_bytes().as_ref()],
        bump
    )]
    pub program_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = mint,
        token::authority = signer,
    )]
    pub signer_token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,

    pub system_program: Program<'info, System>,
}

pub fn claim_token_draft_contest(
    ctx: Context<ClaimTokenDraftContest>,
) -> Result<()> {
    let contest = &mut ctx.accounts.contest;
    let contest_entry = &mut ctx.accounts.contest_entry;

    // Check if the contest has already ended
    require!(contest.has_ended(), ContestError::ContestNotEnded);

    // Check if the user has already claimed their rewards
    require!(!contest_entry.has_claimed, ContestError::AlreadyClaimed);

    let pos_opt = contest.winner_ids.iter().position(|&id| id == contest_entry.id);
    require!(pos_opt.is_some(), ContestError::NotWinner);

    let pos = pos_opt.unwrap();
    let alloc = contest.winner_reward_allocation[pos];

    // Calculate the reward amount based on the credit allocation
    let reward_amount = ((alloc as f64 / 100.0) * contest.prize_pool() as f64) as u64;

    // Transfer the reward to the user's token account
    let cpi_accounts = TransferChecked {
        mint: ctx.accounts.mint.to_account_info(),
        from: ctx.accounts.program_token_account.to_account_info(),
        to: ctx.accounts.signer_token_account.to_account_info(),
        authority: ctx.accounts.program_token_account.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_context = CpiContext::new(cpi_program, cpi_accounts);
    transfer_checked(cpi_context, reward_amount, ctx.accounts.mint.decimals)?;

    // Mark the entry as claimed
    contest_entry.has_claimed = true;

    Ok(())
}