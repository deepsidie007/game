import { guest, detach, route } from 'lib/rooms.js';
export const access='public';
export const methods=['POST'];
export default route(async req=>{await detach(await guest(req));return {ok:true};});
