import { describe, expect, it } from 'vitest';
import { checkAuthorizedDomains } from './check-live.mjs';

const required = ['folioduet.dionlabs.ai', 'boxie.dionlabs.ai'];
describe('shared Firebase auth configuration regression', () => {
  it('rejects the Boxie-only allowlist that broke FolioDuet sign-in', () => {
    expect(() => checkAuthorizedDomains({ authorizedDomains: ['boxie.dionlabs.ai'] }, required))
      .toThrow('folioduet.dionlabs.ai');
  });
  it('rejects a FolioDuet repair that removes Boxie', () => {
    expect(() => checkAuthorizedDomains({ authorizedDomains: ['folioduet.dionlabs.ai'] }, required))
      .toThrow('boxie.dionlabs.ai');
  });
  it('allows additional shared domains and rejects absent configuration', () => {
    expect(() => checkAuthorizedDomains({ authorizedDomains: [...required, 'localhost'] }, required)).not.toThrow();
    expect(() => checkAuthorizedDomains({}, required)).toThrow('missing');
  });
});
