export type EngineErrorCode =
  | 'ROUND_NOT_READY'
  | 'GAME_COMPLETED'
  | 'NOT_PLAYERS_TURN'
  | 'CARD_NOT_IN_HAND'
  | 'MUST_FOLLOW_SUIT'
  | 'CANNOT_LEAD_TRUMP'
  | 'INVALID_BID'
  | 'TRICK_INCOMPLETE'
  | 'INVALID_PLAY'
  | 'ROUND_NOT_COMPLETE';

export class EngineError extends Error {
  constructor(public readonly code: EngineErrorCode, message: string) {
    super(message);
    this.name = 'EngineError';
  }
}

export function assertEngine(condition: boolean, code: EngineErrorCode, message: string): asserts condition {
  if (!condition) {
    throw new EngineError(code, message);
  }
}
