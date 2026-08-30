import { describe, expect, it } from 'vitest';
import {
  MAX_FEEDBACK_MESSAGE_LENGTH,
  normalizeFeedbackInput,
  type FeedbackInput,
} from './feedback';

function input(overrides: Partial<FeedbackInput> = {}): FeedbackInput {
  return {
    category: 'something_broke',
    message: '  Playback stopped on page two.  ',
    surface: 'reader',
    documentKind: 'markdown-zip',
    isSample: true,
    voiceMode: 'fish',
    ...overrides,
  };
}

describe('feedback', () => {
  it('trims feedback while preserving its bounded product context', () => {
    expect(normalizeFeedbackInput(input())).toEqual({
      category: 'something_broke',
      message: 'Playback stopped on page two.',
      surface: 'reader',
      documentKind: 'markdown-zip',
      isSample: true,
      voiceMode: 'fish',
    });
  });

  it('removes control characters and bounds free text', () => {
    const normalized = normalizeFeedbackInput(input({
      message: `hello\u0000${'x'.repeat(MAX_FEEDBACK_MESSAGE_LENGTH + 100)}`,
    }));
    expect(normalized.message).not.toContain('\u0000');
    expect(normalized.message).toHaveLength(MAX_FEEDBACK_MESSAGE_LENGTH);
  });

  it('rejects categories outside the public taxonomy', () => {
    expect(() => normalizeFeedbackInput(input({
      category: 'private_note' as FeedbackInput['category'],
    }))).toThrow(/choose the option/i);
  });
});
