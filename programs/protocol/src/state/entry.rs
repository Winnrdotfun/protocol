use crate::state::contest::MAX_TOKEN_PER_DRAFT;
use anchor_lang::prelude::*;

pub const TOTAL_CREDIT_PER_CONTEST: u8 = 100;

#[account]
#[derive(InitSpace)]
pub struct TokenDraftContestEntry {
    pub user: Pubkey,

    pub id: u32,

    pub contest_key: Pubkey,

    #[max_len(MAX_TOKEN_PER_DRAFT)]
    pub credit_allocation: Vec<u8>,

    pub has_claimed_or_withdrawn: bool,
}
