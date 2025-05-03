use anchor_lang::prelude::*;
use anchor_spl::token_interface::{TokenAccount, TokenInterface, TransferChecked, transfer_checked};
use anchor_spl::token::Mint;

use crate::state::config::Config;
use crate::state::contest::TokenDraftContest;
use crate::state::entry::{TokenDraftContestEntry, TOTAL_CREDIT_PER_CONTEST};
use crate::state::credit::TokenDraftContestCredits;
use crate::errors::ContestError;

#[derive(Accounts)]
pub struct EnterTokenDraftContest<'info> {
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
        init,
        payer = signer,
        space = 8 + TokenDraftContestEntry::INIT_SPACE,
        seeds = [b"token_draft_contest_entry", contest.key().as_ref(), signer.key().as_ref()],
        bump,
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

pub fn enter_token_draft_contest(
    ctx: Context<EnterTokenDraftContest>,
    credit_allocation: Vec<u8>,
) -> Result<()> {
    let contest = &mut ctx.accounts.contest;
    // let current_time = Clock::get()?.unix_timestamp as u64;

    // Check if the contest entry is closed
    require!(contest.is_entry_active(), ContestError::EntryClosed);

    // Check if the contest is already full
    require!(contest.num_entries <= contest.max_entries, ContestError::AlreadyFull);

    // Check if allocation is valid
    let sum_credits: u8 = credit_allocation.iter().sum();
    require!(sum_credits == TOTAL_CREDIT_PER_CONTEST, ContestError::InvalidDraftTokenDistribution);
    require!(contest.token_feed_ids.len() == credit_allocation.len(), ContestError::InvalidDraftTokenDistribution);

    // Transfer entry fee from the user's token account to the program's token account
    let cpi_accounts = TransferChecked {
        mint: ctx.accounts.mint.to_account_info(),
        from: ctx.accounts.signer_token_account.to_account_info(),
        to: ctx.accounts.program_token_account.to_account_info(),
        authority: ctx.accounts.signer.to_account_info()
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_context = CpiContext::new(cpi_program, cpi_accounts);
    transfer_checked(cpi_context, contest.entry_fee, ctx.accounts.mint.decimals)?;

    // Update number of entries
    contest.num_entries += 1;

    // Create a new participation record
    let contest_entry = &mut ctx.accounts.contest_entry;
    contest_entry.user = ctx.accounts.signer.key();
    contest_entry.id = contest.num_entries - 1;
    contest_entry.contest_key = ctx.accounts.contest.key();
    contest_entry.credit_allocation = credit_allocation.clone();

    // Append to credit allocation account
    ctx.accounts.contest_credits.credit_allocations.append(&mut credit_allocation.clone());

    Ok(())
}