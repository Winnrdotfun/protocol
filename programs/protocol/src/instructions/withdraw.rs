use crate::{
    constants::seeds::{SEED_PROGRAM_TOKEN_ACCOUNT, SEED_TOKEN_DRAFT_CONTEST_ENTRY},
    errors::ContestError,
    state::{contest::TokenDraftContest, entry::TokenDraftContestEntry},
};
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked,
};

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(mut)]
    pub contest: Box<Account<'info, TokenDraftContest>>,

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

pub fn withdraw_entry_fee(ctx: Context<Withdraw>) -> Result<()> {
    let contest = &mut ctx.accounts.contest;
    let contest_entry = &mut ctx.accounts.contest_entry;

    // Check that contest is cancelled
    require!(contest.is_cancelled(), ContestError::ContestNotCancelled);

    // Check that amount is not already withdrawn
    require!(
        !contest_entry.has_claimed_or_withdrawn,
        ContestError::AlreadyClaimedOrWithdrawn
    );

    contest_entry.has_claimed_or_withdrawn = true;

    let withdraw_amount = contest.entry_fee;

    // Transfer the fee to the signer
    let cpi_accounts = TransferChecked {
        mint: ctx.accounts.mint.to_account_info(),
        from: ctx.accounts.program_token_account.to_account_info(),
        to: ctx.accounts.signer_token_account.to_account_info(),
        authority: ctx.accounts.program_token_account.to_account_info(),
    };
    let mint_key = ctx.accounts.mint.key();
    let signer_seeds: &[&[&[u8]]] = &[&[
        SEED_PROGRAM_TOKEN_ACCOUNT,
        &mint_key.as_ref(),
        &[ctx.bumps.program_token_account],
    ]];
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_context = CpiContext::new(cpi_program, cpi_accounts).with_signer(signer_seeds);
    transfer_checked(cpi_context, withdraw_amount, ctx.accounts.mint.decimals)?;

    Ok(())
}
