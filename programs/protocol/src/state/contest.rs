use anchor_lang::prelude::*;

use crate::constants::MAX_TOKEN_PER_DRAFT;

#[account]
#[derive(InitSpace)]
pub struct TokenDraftContest {
    pub id: u64,

    pub creator: Pubkey,

    pub start_time: u64,

    pub end_time: u64,

    pub entry_fee: u64,

    pub max_entries: u32,

    pub num_entries: u32,

    #[max_len(MAX_TOKEN_PER_DRAFT)]
    pub token_feed_ids: Vec<Pubkey>,

    #[max_len(MAX_TOKEN_PER_DRAFT)]
    pub token_start_prices: Vec<f64>,

    #[max_len(MAX_TOKEN_PER_DRAFT)]
    pub token_end_prices: Vec<f64>,

    #[max_len(0)]
    pub winner_ids: Vec<u32>,

    #[max_len(0)]
    pub winner_reward_allocation: Vec<u8>,

    pub is_resolved: bool,
}

impl TokenDraftContest {
    pub fn is_entry_active(&self) -> bool {
        let current_time = Clock::get().unwrap().unix_timestamp as u64;
        current_time < self.start_time
    }

    pub fn has_insufficient_entries(&self) -> bool {
        self.num_entries < self.winner_reward_allocation.len() as u32
    }

    pub fn is_cancelled(&self) -> bool {
        self.is_resolved && self.winner_ids.is_empty()
    }

    pub fn has_ended(&self) -> bool {
        let current_time = Clock::get().unwrap().unix_timestamp as u64;
        current_time > self.end_time
    }

    pub fn pool_amount(&self) -> u64 {
        self.entry_fee * self.num_entries as u64
    }

    pub fn has_prices(&self) -> bool {
        let num_tokens = self.token_feed_ids.len();
        self.token_start_prices.len() == num_tokens && self.token_end_prices.len() == num_tokens
    }
}
