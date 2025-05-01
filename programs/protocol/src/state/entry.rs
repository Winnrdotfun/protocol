use anchor_lang::prelude::*;
use crate::state::contest::MAX_TOKEN_PER_DRAFT;

pub const TOTAL_CREDIT_PER_CONTEST: u8 = 100;

#[account]
#[derive(InitSpace)]
pub struct TokenDraftContestEntry {
    pub user: Pubkey,

    pub entry_idx: u32,

    pub contest: Pubkey,

    #[max_len(MAX_TOKEN_PER_DRAFT)]
    pub credit_allocation: Vec<u8>,

    pub has_claimed: bool,
}