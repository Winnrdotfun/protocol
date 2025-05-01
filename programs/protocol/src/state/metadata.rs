use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct ContestMetadata {
    pub token_draft_contest_count: u64,
}