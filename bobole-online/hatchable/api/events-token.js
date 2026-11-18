import { events } from 'hatchable';
import { guest, roomFor, route } from 'lib/rooms.js';
export const access='public';
export const methods=['GET','POST'];
export default route(async req=>{const r=await roomFor(await guest(req));return events.grant(['room:'+r.code]);});
