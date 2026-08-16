import { describe, expect, it, vi } from 'vitest';
import { onRequest } from './_middleware';

describe('legacy host middleware', () => {
  it('permanently redirects the old host while preserving path and query', async () => {
    const next = vi.fn(async () => new Response('next'));
    const response = await onRequest({
      request: new Request(
        'https://pageecho.dionlabs.ai/pdf-to-audiobook/?utm_source=old_post',
      ),
      next,
    });

    expect(response.status).toBe(308);
    expect(response.headers.get('location')).toBe(
      'https://folioduet.dionlabs.ai/pdf-to-audiobook/?utm_source=old_post',
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('serves the canonical host normally', async () => {
    const next = vi.fn(async () => new Response('canonical'));
    const response = await onRequest({
      request: new Request('https://folioduet.dionlabs.ai/'),
      next,
    });

    expect(await response.text()).toBe('canonical');
    expect(next).toHaveBeenCalledOnce();
  });
});
