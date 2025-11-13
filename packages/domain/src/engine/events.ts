import type { GameEvent } from '../types/events';

export type EngineEvent<T extends GameEvent['type'] = GameEvent['type']> = {
  type: T;
  payload: Extract<GameEvent, { type: T }>['payload'];
};

export function event<T extends EngineEvent['type']>(
  type: T,
  payload: EngineEvent<T>['payload'],
): EngineEvent {
  return { type, payload };
}
