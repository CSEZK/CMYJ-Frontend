import { registerMvuSchema } from 'https://testingcf.jsdelivr.net/gh/StageDog/tavern_resource/dist/util/mvu_zod.js';

import { Schema } from './definition.js';

export { Schema } from './definition.js';

$(() => {
  registerMvuSchema(Schema);
});
