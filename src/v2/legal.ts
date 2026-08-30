export type LegalDocId = 'terms' | 'privacy';

export interface LegalDoc {
  id: LegalDocId;
  title: string;
  updated: string;
  sections: Array<{ heading: string; body: string[] }>;
}

export const LEGAL_DOCS: Record<LegalDocId, LegalDoc> = {
  terms: {
    id: 'terms',
    title: 'Terms of Use',
    updated: '2026-08-02',
    sections: [
      {
        heading: 'The service',
        body: [
          'FolioDuet is a self-serve reading and listening tool provided by Dion Labs (“we”). By using the app you agree to these terms.',
          'The service is provided as-is, without warranties of any kind, to the extent permitted by law.',
        ],
      },
      {
        heading: 'Your content and copyright',
        body: [
          'You are responsible for the files you import, convert, store, or listen to with FolioDuet.',
          'You represent that you have all rights needed to upload and process those materials (for example, that you own them, have a license, or otherwise have lawful permission).',
          'We do not review uploads for copyright status. If you are not allowed to use a file, do not import it.',
          'If we receive a valid notice that content infringes someone’s rights, we may remove it and, where appropriate, suspend the related account.',
        ],
      },
      {
        heading: 'Accounts and keys',
        body: [
          'Guest sessions are temporary. Signed-in libraries sync under your account.',
          'Optional third-party API keys you enter (for example TTS providers) stay under your control. Shared sponsor keys we optionally provide may be withdrawn at any time.',
        ],
      },
      {
        heading: 'Acceptable use',
        body: [
          'Do not abuse the service, attempt to break security, scrape other users’ data, or use FolioDuet to distribute infringing or unlawful material.',
        ],
      },
      {
        heading: 'Contact',
        body: [
          'Questions about these terms: contact Dion Labs via the GitHub organization (dion-labs) or the project repository.',
        ],
      },
    ],
  },
  privacy: {
    id: 'privacy',
    title: 'Privacy',
    updated: '2026-08-30',
    sections: [
      {
        heading: 'What we store',
        body: [
          'If you sign in, we store account identifiers (such as your Google auth uid and basic profile fields) plus your FolioDuet library metadata, reading progress, preferences, and processed book text needed to read across devices.',
          'Original PDF files stay on the device that imported them unless you separately choose to keep a local copy elsewhere. We do not use Firebase Storage for originals in the current design.',
          'Optional API keys you save are stored privately under your account and loaded only into your browser session.',
        ],
      },
      {
        heading: 'Analytics',
        body: [
          'We may use Firebase Analytics only after you accept the analytics consent banner. You can decline; the reader still works.',
          'Necessary sign-in and library sync are not advertising cookies and are required to provide the service when you use cloud sync.',
        ],
      },
      {
        heading: 'Product feedback',
        body: [
          'If you choose to send feedback, we store the category, the message you enter, and minimal product context such as whether you were on the home or reader screen, the document type, sample status, and selected voice mode.',
          'Feedback uses your existing private guest or signed-in Firebase session for abuse protection, but the submitted record does not include your email address or book content and cannot be read back by app clients.',
        ],
      },
      {
        heading: 'Processors',
        body: [
          'Authentication and cloud data use Google Firebase. Optional speech features may send text you choose to play to third-party TTS providers (for example Fish Audio or Inworld) using a sponsor key or your own key.',
        ],
      },
      {
        heading: 'Retention and deletion',
        body: [
          'You can delete books from your library in the app. Signing out of a guest session or clearing site data removes local guest state.',
          'Product feedback is retained only while it remains useful for understanding and improving FolioDuet.',
          'To request deletion of a signed-in cloud library, contact Dion Labs via the GitHub organization.',
        ],
      },
      {
        heading: 'Contact',
        body: [
          'Privacy questions: contact Dion Labs via the GitHub organization (dion-labs) or the project repository.',
        ],
      },
    ],
  },
};

export function parseLegalHash(hash: string): LegalDocId | null {
  const value = hash.replace(/^#/, '').trim().toLowerCase();
  if (value === 'terms' || value === 'privacy') return value;
  return null;
}
