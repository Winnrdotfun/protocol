use crate::{
    constants::seeds::{SEED_CONFIG, SEED_CONTEST_METADATA, SEED_PROGRAM_TOKEN_ACCOUNT},
    state::{config::Config, metadata::ContestMetadata},
};
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked,
};

#[derive(Accounts)]
pub struct WithdrawFee<'info> {
    #[account(
        mut,
        address = config.admin
    )]
    pub signer: Signer<'info>,

    #[account(
        seeds = [SEED_CONFIG],
        bump,
    )]
    pub config: Box<Account<'info, Config>>,

    #[account(
        mut,
        seeds = [SEED_CONTEST_METADATA],
        bump,
    )]
    pub contest_metadata: Box<Account<'info, ContestMetadata>>,

    #[account(mut)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        mut,
        token::mint = mint,
        seeds = [SEED_PROGRAM_TOKEN_ACCOUNT, mint.key().to_bytes().as_ref()],
        bump
    )]
    pub program_token_account: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(mut)]
    pub withdrawal_token_account: Box<InterfaceAccount<'info, TokenAccount>>,

    pub token_program: Interface<'info, TokenInterface>,

    pub system_program: Program<'info, System>,
}

pub fn withdraw_fee(ctx: Context<WithdrawFee>) -> Result<()> {
    let total_fee_amount = ctx.accounts.contest_metadata.token_draft_contest_fee_amount;

    // Transfer the fee to the signer
    let cpi_accounts = TransferChecked {
        mint: ctx.accounts.mint.to_account_info(),
        from: ctx.accounts.program_token_account.to_account_info(),
        to: ctx.accounts.withdrawal_token_account.to_account_info(),
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
    transfer_checked(cpi_context, total_fee_amount, ctx.accounts.mint.decimals)?;

    Ok(())
}
