import { sefazNumber, noteLabel, noteStatusLabel } from '../../lib/nfe/access-key';

describe('NFC-e number shown on screen (lib/nfe/access-key.ts)', () => {
  // Keys of the first homologation notes (2026-10-05): internal #3, #4, #5 are SEFAZ nº 1, 2, 3
  const key1 = 'NFe35261060957269000192650010000000011868286599';
  const key3 = 'NFe35261060957269000192650010000000031073518346';

  it('reads series and number from the access key', () => {
    expect(sefazNumber(key1)).toEqual({ series: 1, number: 1 });
    expect(sefazNumber(key3)).toEqual({ series: 1, number: 3 });
  });

  it('no key or a malformed one has no SEFAZ number', () => {
    expect(sefazNumber(null)).toBeNull();
    expect(sefazNumber('123')).toBeNull();
  });

  it('labels a note by its SEFAZ number, never by the internal sequence', () => {
    expect(noteLabel({ documentType: 'NFCe', documentNumber: 3, accessKey: key1 })).toBe('NFC-e nº 1 (Série 1)');
    expect(noteLabel({ documentType: 'NFCe', documentNumber: 2, accessKey: null })).toBe('NFC-e sem número na SEFAZ (ref. interna 2)');
  });

  it('status labels are in Portuguese', () => {
    expect(noteStatusLabel('cancelled')).toBe('Cancelada');
    expect(noteStatusLabel('denied')).toBe('Denegada');
    expect(noteStatusLabel('authorized')).toBe('Autorizada');
  });
});
