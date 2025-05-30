use anchor_lang::prelude::*;

#[account(zero_copy)]
#[derive(InitSpace)]
pub struct ContestMetadata {
    pub token_draft_contest_count: u64,
    pub token_draft_contest_fee_amount: u64,
    pub token_draft_contest_fee_percent: u8,
    pub _padding0: [u8; 7],
    pub _padding1: [u64; 12],
}
