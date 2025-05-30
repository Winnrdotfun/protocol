use anchor_lang::prelude::*;

use ephemeral_rollups_sdk::anchor::delegate;
use ephemeral_rollups_sdk::cpi::DelegateConfig;
use crate::constants::seeds::{SEED_CONTEST_METADATA, SEED_TOKEN_DRAFT_CONTEST};
use crate::state::contest::TokenDraftContest;
use crate::state::metadata::ContestMetadata;

#[delegate]
#[derive(Accounts)]
pub struct ErDelegate<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
        mut, 
        del,
        seeds = [SEED_CONTEST_METADATA],
        bump
    )]
    pub contest_metadata: AccountLoader<'info, ContestMetadata>,

    #[account(mut, del)]
    pub contest: Box<Account<'info, TokenDraftContest>>,
    
    pub system_program: Program<'info, System>,
}

pub fn er_delegate<'info>(ctx: Context<ErDelegate<'info>>) -> Result<()> {
    ctx.accounts.delegate_contest(
        &ctx.accounts.signer,
        &[SEED_TOKEN_DRAFT_CONTEST, &ctx.accounts.contest.id.to_le_bytes()],
        DelegateConfig::default(),
    )?;

    ctx.accounts.delegate_contest_metadata(
        &ctx.accounts.signer,
        &[SEED_CONTEST_METADATA],
        DelegateConfig::default()
    )?;

    Ok(())
}
