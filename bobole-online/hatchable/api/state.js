import { guest, roomFor, snapshot, save, route } from 'lib/rooms.js';
import { timeout } from 'lib/engine.js';
export const access='public';
export const methods=['GET'];
export default route(async req=>{const g=await guest(req),r=await roomFor(g);if(timeout(r))await save(r);return snapshot(r,g.guest_id);});
