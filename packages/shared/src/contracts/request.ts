import { z } from 'zod';
import { MAX_SELECTION_CHARS } from '../limits/index.ts';
import { SHAPE_IDS } from './shapes.ts';

// A tag the prompt can name: Intl.DisplayNames refuses extensions such as -u-ca-gregory and -x-.
function isLanguageTag(tag: string): boolean {
  try {
    new Intl.DisplayNames(['en'], { type: 'language' }).of(tag);
    return true;
  } catch {
    return false;
  }
}

export const summarizeRequestSchema = z.strictObject({
  shape: z.enum(SHAPE_IDS),
  outputLanguage: z
    .string()
    .refine(isLanguageTag, 'Expected a language tag without extensions, such as en or pt-BR'),
  sentences: z
    .array(z.string().min(1))
    .min(1)
    .refine(
      (sentences) => sentences.join('').length <= MAX_SELECTION_CHARS,
      'Selection is too long',
    ),
});

export type SummarizeRequest = z.infer<typeof summarizeRequestSchema>;
