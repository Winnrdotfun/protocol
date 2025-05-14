use anchor_lang::prelude::*;

use ephemeral_rollups_sdk::anchor::delegate;
use ephemeral_rollups_sdk::cpi::DelegateConfig;
use crate::constants::seeds::SEED_CONTEST_METADATA;
use crate::state::contest::TokenDraftContest;

#[delegate]
#[derive(Accounts)]
pub struct DelegateEr<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
        mut, 
        del,
        seeds = [SEED_CONTEST_METADATA],
        bump
    )]
    pub contest_metadata: Box<Account<'info, TokenDraftContest>>,

    #[account(mut, del)]
    pub contest: Box<Account<'info, TokenDraftContest>>,
    
    pub system_program: Program<'info, System>,

}

pub fn delegate_er<'info>(ctx: Context<DelegateEr<'info>>) -> Result<()> {
    ctx.accounts.delegate_contest(
        &ctx.accounts.signer,
        &[&ctx.accounts.contest.key().to_bytes()],
        DelegateConfig::default(),
    )?;

    ctx.accounts.delegate_contest_metadata(
        &ctx.accounts.signer,
        &[&ctx.accounts.contest_metadata.key().to_bytes()],
        DelegateConfig::default()
    )?;

    Ok(())
}
