import { roomRegistry } from '../rooms/index.js';
import { BotManager } from './BotManager.js';

export const botManager = new BotManager({ registry: roomRegistry });
