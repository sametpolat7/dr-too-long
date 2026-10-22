import { z } from 'zod';
import { isWithinSelectionLimits } from '../limits/index.ts';
import { PRESET_IDS } from './presets.ts';

function isLanguageTag(tag: string): boolean {
  try {
    return Intl.getCanonicalLocales(tag).length === 1;
  } catch {
    return false;
  }
}

export const summarizeRequestSchema = z.strictObject({
  v: z.literal(1),
  preset: z.enum(PRESET_IDS),
  outputLanguage: z.string().refine(isLanguageTag, 'Expected a BCP 47 language tag'),
  sentences: z
    .array(z.string().min(1))
    .min(1)
    .refine(
      (sentences) => isWithinSelectionLimits(sentences.join('').length, sentences.length),
      'Selection is too long',
    ),
});

export type SummarizeRequest = z.infer<typeof summarizeRequestSchema>;
