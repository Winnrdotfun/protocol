use anchor_lang::prelude::*;

#[error_code]
pub enum ConfigError {
    Unauthorized,
    AlreadyInitialized,
}

#[error_code]
pub enum ContestError {
    InvalidStartTime,
    InvalidDuration,
    ContestStillActive,
    InsufficientAmount,
    AlreadyClaimed,
    InvalidDraftTokenCount,
    InvalidFeeds,
    InvalidDraftTokenDistribution,
    EntryClosed,
    AlreadyFull,
    ContestNotEnded,
    AlreadyResolved,
    NotWinner,
}

