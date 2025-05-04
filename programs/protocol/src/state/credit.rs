use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct TokenDraftContestCredits {
    pub contest_key: Pubkey,

    #[max_len(0)]
    pub credit_allocations: Vec<u8>,
}