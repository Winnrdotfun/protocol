use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked,
};

use crate::constants::seeds::{
    SEED_CONFIG, SEED_PROGRAM_TOKEN_ACCOUNT, SEED_TOKEN_DRAFT_CONTEST_CREDITS,
    SEED_TOKEN_DRAFT_CONTEST_ENTRY,
};
use crate::errors::ContestError;
use crate::state::config::Config;
use crate::state::contest::TokenDraftContest;
use crate::state::credit::TokenDraftContestCredits;
use crate::state::entry::{TokenDraftContestEntry, TOTAL_CREDIT_PER_CONTEST};

#[derive(Accounts)]
pub struct EnterTokenDraftContest<'info> {
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
        init,
        payer = signer,
        space = 8 + TokenDraftContestEntry::INIT_SPACE,
        seeds = [SEED_TOKEN_DRAFT_CONTEST_ENTRY, contest.key().as_ref(), signer.key().as_ref()],
        bump,
    )]
    pub contest_entry: Box<Account<'info, TokenDraftContestEntry>>,

    #[account(
        mut,
        realloc = contest_credits.to_account_info().data_len() + 32,
        realloc::payer = signer,
        realloc::zero = false,
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

    #[account(
        mut,
        token::mint = mint,
        token::authority = signer,
    )]
    pub signer_token_account: Box<InterfaceAccount<'info, TokenAccount>>,

    pub token_program: Interface<'info, TokenInterface>,

    pub system_program: Program<'info, System>,
}

pub fn enter_token_draft_contest(
    ctx: Context<EnterTokenDraftContest>,
    credit_allocation: Vec<u8>,
) -> Result<()> {
    let contest = &mut ctx.accounts.contest;

    // Check if the contest entry is closed
    require!(contest.is_entry_active(), ContestError::EntryClosed);

    // Check if the contest is already full
    require!(
        contest.num_entries <= contest.max_entries,
        ContestError::AlreadyFull
    );

    // Check if allocation is valid
    let sum_credits: u8 = credit_allocation.iter().sum();
    require!(
        sum_credits == TOTAL_CREDIT_PER_CONTEST,
        ContestError::InvalidDraftTokenDistribution
    );
    require!(
        contest.token_feed_ids.len() == credit_allocation.len(),
        ContestError::InvalidDraftTokenDistribution
    );

    // Transfer entry fee from the user's token account to the program's token account
    let cpi_accounts = TransferChecked {
        mint: ctx.accounts.mint.to_account_info(),
        from: ctx.accounts.signer_token_account.to_account_info(),
        to: ctx.accounts.program_token_account.to_account_info(),
        authority: ctx.accounts.signer.to_account_info(),
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
    ctx.accounts
        .contest_credits
        .credit_allocations
        .append(&mut credit_allocation.clone());

    Ok(())
}
