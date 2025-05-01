use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct TokenDraftContestCreditAllocations {
    pub contest: Pubkey,

    #[max_len(5)]
    pub credit_allocations: Vec<u8>,
}

pub struct CreditAllocations {
    entry_idx: u32,
    credit_allocation: [u8; 5], 
}