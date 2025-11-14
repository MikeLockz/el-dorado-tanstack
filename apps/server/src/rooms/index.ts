import { createDatabase, type Database, type DatabaseConnection } from '../db/client.js';
import { GamePersistence } from '../persistence/GamePersistence.js';
import { RoomRegistry } from './RoomRegistry.js';

let database: DatabaseConnection | null = null;
if (process.env.DATABASE_URL) {
  database = createDatabase();
}

export const db: Database | undefined = database?.db;
export const dbPool = database?.pool;
export const gamePersistence = database ? new GamePersistence(database.db) : undefined;
export const roomRegistry = new RoomRegistry({ persistence: gamePersistence });
