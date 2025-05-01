use anchor_lang::prelude::*;

pub const MAX_TOKEN_PER_DRAFT: usize = 5;

#[account]
#[derive(InitSpace)]
pub struct TokenDraftContest {
    pub id: u64,

    pub creator: Pubkey,

    pub start_time: u64,
    
    pub end_time: u64,

    pub entry_fee: u64,

    pub max_entries: u32,

    pub num_winners: u32,

    pub num_entries: u32,

    #[max_len(MAX_TOKEN_PER_DRAFT)]
    pub token_feed_ids: Vec<Pubkey>,

    #[max_len(MAX_TOKEN_PER_DRAFT)]
    pub token_start_prices: Vec<f64>,

    #[max_len(MAX_TOKEN_PER_DRAFT)]
    pub token_rois: Vec<f64>,

    pub is_resolved: bool,
}

impl TokenDraftContest {
    pub fn is_entry_active(&self) -> bool {
        let current_time = Clock::get().unwrap().unix_timestamp as u64;
        current_time < self.start_time
    }

    pub fn has_ended(&self) -> bool {
        let current_time = Clock::get().unwrap().unix_timestamp as u64;
        current_time > self.end_time
    }
}
