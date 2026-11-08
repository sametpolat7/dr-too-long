import { z } from 'zod';

// Zod checks whether it may compile schemas with new Function, and the extension's security policy
// reports that check as a violation even though Zod catches the refusal. The model's entry module
// imports this one first, before any schema is built, and package.json lists both as having side
// effects, so the bundler keeps them.
z.config({ jitless: true });
