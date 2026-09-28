import { createApi } from '../src/api.js';
const handle = createApi();
export default (req, res) => handle(req, res, 'review');
