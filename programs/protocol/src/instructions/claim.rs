use anchor_lang::prelude::*;

use crate::state::contest::Contest;
use crate::state::entry::TokenDraftContestEntry;
use crate::errors::ContestError;
use crate::state::config::Config;
use crate::state::contest::MAX_TOKEN_PER_DRAFT;


#[derive(Accounts)]
#[instruction(entry_bump: u8)]
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
    pub contest: Account<'info, Contest>,

    #[account(
        mut,
        seeds = [b"token_draft_contest_entry", contest.key().as_ref(), signer.key().as_ref()],
        bump = entry_bump
    )]
    pub contest_entry: Account<'info, TokenDraftContestEntry>,

    #[account(
        mut,
        token::mint = config.mint,
        token::authority = signer,
    )]
    pub signer_token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
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

    // Calculate the reward amount based on the credit allocation
    let reward_amount = (contest.total_reward as u64 * total_credit_allocation as u64) / TOTAL_CREDIT_PER_CONTEST as u64;

    // Transfer the reward to the user's token account
    transfer_checked(
        ctx.accounts.token_program.to_account_info(),
        TransferChecked {
            from: ctx.accounts.config.token_account.to_account_info(),
            to: ctx.accounts.signer_token_account.to_account_info(),
            authority: ctx.accounts.config.to_account_info(),
        },
        anchor_spl::token::TransferChecked {
            amount: reward_amount,
            decimals: 0,
        },
    )?;

    // Mark the entry as claimed
    contest_entry.has_claimed = true;

    Ok(())
}