import { EventEmitter } from 'events';

// Create a globally shared event emitter instance for AI background processing events
export const aiEvents = new EventEmitter();
