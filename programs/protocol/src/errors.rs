use anchor_lang::prelude::*;

#[error_code]
pub enum ConfigError {
    Unauthorized,
    AlreadyInitialized,
    InvalidFeePercent,
}

#[error_code]
pub enum ContestError {
    InvalidStartTime,
    InvalidDuration,
    ContestStillActive,
    InsufficientAmount,
    AlreadyClaimedOrWithdrawn,
    InvalidDraftTokenCount,
    InvalidFeeds,
    InvalidDraftTokenDistribution,
    EntryClosed,
    AlreadyFull,
    ContestNotEnded,
    ContestNotResolved,
    AlreadyResolved,
    NotWinner,
    InvalidRewardAllocation,
    ContestNotStarted,
    ContestPricesNotSet,
    ContestPricesAlreadySet,
    ContestNotCancelled,
}
