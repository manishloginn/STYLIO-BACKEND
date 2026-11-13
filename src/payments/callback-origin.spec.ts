import { callbackOrigin } from './callback-origin';

describe('callbackOrigin', () => {
  it('uses the public API origin instead of Render’s internal port', () => {
    expect(
      callbackOrigin({
        renderExternalUrl: 'https://stylio-backend.onrender.com',
        requestOrigin: 'http://127.0.0.1:10000',
        port: 10000,
      }),
    ).toBe('https://stylio-backend.onrender.com');
  });

  it('upgrades an onrender host to https', () => {
    expect(callbackOrigin({ requestOrigin: 'http://stylio-backend.onrender.com', port: 10000 })).toBe(
      'https://stylio-backend.onrender.com',
    );
  });

  it('keeps local development on the API port', () => {
    expect(callbackOrigin({ requestOrigin: 'http://127.0.0.1:3000', port: 3000 })).toBe('http://127.0.0.1:3000');
  });
});
