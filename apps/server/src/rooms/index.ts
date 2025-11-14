import { createDatabase } from '../db/client.js';
import { GamePersistence } from '../persistence/GamePersistence.js';
import { RoomRegistry } from './RoomRegistry.js';

const database = createDatabase();
export const db = database.db;
export const dbPool = database.pool;

export const gamePersistence = new GamePersistence(database.db);
export const roomRegistry = new RoomRegistry({ persistence: gamePersistence });
