import { guest, perform, route } from 'lib/rooms.js';
export const access='public';
export const methods=['POST'];
export default route(async req=>perform(await guest(req),req.body||{}));
