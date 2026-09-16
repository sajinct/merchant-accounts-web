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

  it('passes other messages through', () => {
    expect(errorMessage(new Error('amount must be greater than zero'))).toBe(
      'amount must be greater than zero',
    );
    expect(errorMessage('plain')).toBe('plain');
  });
});
