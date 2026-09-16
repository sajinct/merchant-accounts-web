import { errorMessage } from './notify.service';

describe('errorMessage', () => {
  it('maps permission errors to a friendly message', () => {
    expect(errorMessage({ message: 'not authorized', code: '42501' })).toBe(
      'You are not allowed to do this.',
    );
  });

  it('maps duplicate keys', () => {
    expect(errorMessage({ message: 'duplicate key', code: '23505' })).toContain('already exists');
  });

  it('explains a lost connection instead of showing the browser wording', () => {
    expect(errorMessage(new TypeError('Failed to fetch'))).toContain('Could not reach the server');
  });

  it('explains an expired session and a wrong password', () => {
    expect(errorMessage({ message: 'Invalid login credentials' })).toBe(
      'That email or password is not correct.',
    );
    expect(errorMessage({ message: 'JWT expired' })).toContain('session has expired');
  });

  it('rewrites the technical messages the database raises', () => {
    expect(errorMessage(new Error('Request ID was already used'))).toContain('already been saved');
    expect(errorMessage(new Error('Unbalanced journal detected'))).toContain('does not balance');
  });

  it('keeps business rules from the database, as a sentence', () => {
    expect(errorMessage(new Error('amount must be greater than zero'))).toBe(
      'Amount must be greater than zero',
    );
    expect(errorMessage('plain')).toBe('Plain');
  });

  it('says so when the browser is offline', () => {
    const online = Object.getOwnPropertyDescriptor(Navigator.prototype, 'onLine');
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    try {
      expect(errorMessage(new Error('Failed to fetch'))).toContain('offline');
    } finally {
      if (online) Object.defineProperty(Navigator.prototype, 'onLine', online);
      delete (navigator as { onLine?: boolean }).onLine;
    }
  });
});
