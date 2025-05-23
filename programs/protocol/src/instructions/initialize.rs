use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::constants::seeds::{SEED_CONFIG, SEED_CONTEST_METADATA, SEED_PROGRAM_TOKEN_ACCOUNT};
use crate::errors::ConfigError;
use crate::state::config::Config;
use crate::state::metadata::ContestMetadata;

#[derive(Accounts)]
pub struct InitConfigs<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
        init,
        payer = signer,
        space = 8 + Config::INIT_SPACE,
        seeds = [SEED_CONFIG],
        bump
    )]
    pub config: Box<Account<'info, Config>>,

    #[account(
        init,
        payer = signer,
        space = 8 + ContestMetadata::INIT_SPACE,
        seeds = [SEED_CONTEST_METADATA],
        bump
    )]
    pub contest_metadata: Box<Account<'info, ContestMetadata>>,

    pub mint: Box<InterfaceAccount<'info, Mint>>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct InitTokenAccounts<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
        seeds = [SEED_CONFIG],
        bump
    )]
    pub config: Box<Account<'info, Config>>,

    #[account(address = config.mint)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        init,
        payer = signer,
        token::mint = mint,
        token::authority = program_token_account,
        token::token_program = token_program,
        seeds = [SEED_PROGRAM_TOKEN_ACCOUNT, mint.key().to_bytes().as_ref()],
        bump
    )]
    pub program_token_account: Box<InterfaceAccount<'info, TokenAccount>>,

    pub token_program: Interface<'info, TokenInterface>,

    pub system_program: Program<'info, System>,
}

pub fn init_config(ctx: Context<InitConfigs>, token_draft_contest_fee_percent: u8) -> Result<()> {
    let config = &mut ctx.accounts.config;

    require!(
        token_draft_contest_fee_percent < 100,
        ConfigError::InvalidFeePercent
    );

    let contest_metadata = &mut ctx.accounts.contest_metadata;

    config.admin = ctx.accounts.signer.key();
    config.mint = (*(ctx.accounts.mint)).key();

    contest_metadata.token_draft_contest_count = 0;
    contest_metadata.token_draft_contest_fee_percent = token_draft_contest_fee_percent;

    Ok(())
}

pub fn init_token_accounts(_ctx: Context<InitTokenAccounts>) -> Result<()> {
    Ok(())
}
