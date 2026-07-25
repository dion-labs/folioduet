import { describe, expect, it } from 'vitest';
import { compareProgress, reconcileProgress, type ProgressState } from './BimodalSyncEngine';

function progress(
  page_index: number,
  block_index: number,
  word_index: number,
  updated_at: number,
): ProgressState {
  return {
    document_id: 'document-1',
    page_index,
    block_index,
    word_index,
    updated_at,
  };
}

describe('compareProgress', () => {
  it('compares the stable page, block, word path in order', () => {
    expect(compareProgress(progress(2, 0, 0, 1), progress(1, 99, 99, 2))).toBe(1);
    expect(compareProgress(progress(2, 4, 0, 1), progress(2, 3, 99, 2))).toBe(1);
    expect(compareProgress(progress(2, 4, 8, 1), progress(2, 4, 9, 2))).toBe(-1);
  });
});

describe('reconcileProgress', () => {
  it('protects recent offline forward progress from a slightly newer rewind', () => {
    const local = progress(10, 2, 4, 1_000);
    const remote = progress(8, 9, 9, 1_120);
    expect(reconcileProgress(local, remote, 300)).toBe(local);
  });

  it('accepts a much newer intentional rewind', () => {
    const local = progress(10, 2, 4, 1_000);
    const remote = progress(8, 9, 9, 1_500);
    expect(reconcileProgress(local, remote, 300)).toBe(remote);
  });

  it('uses timestamps when the logical position is identical', () => {
    const older = progress(2, 3, 4, 1_000);
    const newer = progress(2, 3, 4, 1_010);
    expect(reconcileProgress(older, newer)).toBe(newer);
  });
});

