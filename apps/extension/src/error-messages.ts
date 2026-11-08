import type { ErrorCode } from '@dr-too-long/shared/contracts';

export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  no_key: 'Save an API key first.',
  unauthorized: 'The provider rejected the API key.',
  rate_limited: 'The provider is rate limiting this key. Try again in a moment.',
  quota_exceeded:
    'The account behind this key is out of credit or at its spending limit. Check its billing settings, then try again.',
  network: 'The provider could not be reached.',
  timed_out: 'The provider stopped responding. Try again.',
  model_unavailable:
    'The provider no longer offers the model this version of Dr. Too Long uses. An update will fix this; until then, use a key from another provider.',
  aborted: 'The run was cancelled.',
  disconnected: 'The background worker stopped before the summary finished.',
  invalidated:
    'Dr. Too Long was updated or reloaded. Start it again from the icon, the shortcut or the menu.',
  invalid_output: 'The model returned no usable summary.',
  no_selection: 'Select some text first.',
  too_long: 'The selection is too long.',
  unsupported_selection:
    'Text in form fields, editors, embedded frames and widgets cannot be summarized.',
  provider: 'The provider returned an error.',
  unexpected:
    'Something went wrong in Dr. Too Long. Try again, and report it if it keeps happening.',
};

// Shown under the message, for a bug report to quote.
export const httpDetail = (httpStatus: number | undefined): string | undefined =>
  httpStatus === undefined ? undefined : `HTTP status ${httpStatus}`;
