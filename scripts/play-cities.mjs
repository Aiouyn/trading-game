// Starts this worktree's game and city atlas with separate ports and a separate saved world.
import { main } from './play.mjs';
process.env.PLAY_WEB_PORT ??= '3237';
process.env.PLAY_WORLD_PORT ??= '8857';
process.env.DATA_DIR ??= 'world-data/cities-prototype';
console.log('Living Cities atlas: http://localhost:'+process.env.PLAY_WEB_PORT+'/city-preview');
process.exitCode = await main();

