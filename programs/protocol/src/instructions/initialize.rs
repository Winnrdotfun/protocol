use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::state::config::Config;
use crate::state::metadata::ContestMetadata;
use crate::errors::ConfigError;

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
        init,
        payer = signer,
        space = 8 + Config::INIT_SPACE,
        seeds = [b"config"],
        bump
    )]
    pub config: Account<'info, Config>,

    #[account(
        init,
        payer = signer,
        space = 8 + ContestMetadata::INIT_SPACE,
        seeds = [b"contest_metadata"],
        bump
    )]
    pub contest_metadata: Account<'info, ContestMetadata>,

    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        init,
        payer = signer,
        token::mint = mint,
        token::authority = token_account,
        token::token_program = token_program,
        seeds = [b"token_account", mint.key().to_bytes().as_ref()],
        bump
    )]
    pub token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,

    pub system_program: Program<'info, System>,
}

pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
    let config = &mut ctx.accounts.config;
    require!(!config.is_initialized, ConfigError::AlreadyInitialized);

    config.admin = ctx.accounts.signer.key();
    config.mint = ctx.accounts.mint.key();
    config.is_initialized = true;
    ctx.accounts.contest_metadata.token_draft_contest_count = 0;

    Ok(())
}