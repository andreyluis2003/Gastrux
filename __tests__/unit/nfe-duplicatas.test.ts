/** The boletos (duplicatas) of a purchase NF-e become contas a pagar (spec 2026-10-18 contas a pagar §5) */
import { parseDuplicatas } from '@/lib/nfe/duplicatas';

const KEY = '35261012345678000199550010000012341000012345';
const xml = (dups: string) => `<?xml version="1.0"?><nfeProc><NFe><infNFe Id="NFe${KEY}" versao="4.00">
<ide><nNF>1234</nNF></ide><emit><CNPJ>12345678000199</CNPJ><xNome>Frigorífico Boi Bom Ltda</xNome></emit>
<dest><CNPJ>99999999000100</CNPJ><xNome>Espetaria</xNome></dest>
<total><ICMSTot><vNF>1200.00</vNF></ICMSTot></total>${dups}</infNFe></NFe></nfeProc>`;

it('three boletos: number, due date and value in cents', () => {
  const out = parseDuplicatas(xml(`<cobr><fat><nFat>1234</nFat></fat>
<dup><nDup>001</nDup><dVenc>2026-11-05</dVenc><vDup>400.00</vDup></dup>
<dup><nDup>002</nDup><dVenc>2026-12-05</dVenc><vDup>400.00</vDup></dup>
<dup><nDup>003</nDup><dVenc>2027-01-05</dVenc><vDup>400.01</vDup></dup></cobr>`));
  expect(out).toEqual({
    key: KEY, nNF: '1234', emitente: 'Frigorífico Boi Bom Ltda', cnpj: '12345678000199',
    duplicatas: [
      { nDup: '001', dueDate: '2026-11-05', amountCents: 40000 },
      { nDup: '002', dueDate: '2026-12-05', amountCents: 40000 },
      { nDup: '003', dueDate: '2027-01-05', amountCents: 40001 },
    ],
  });
});

it('one boleto', () => {
  expect(parseDuplicatas(xml('<cobr><dup><nDup>1</nDup><dVenc>2026-11-10</dVenc><vDup>99.9</vDup></dup></cobr>')).duplicatas).toEqual([{ nDup: '1', dueDate: '2026-11-10', amountCents: 9990 }]);
});

it('paid at once (no <cobr>): no boletos', () => {
  expect(parseDuplicatas(xml('')).duplicatas).toEqual([]);
});

it('no access key: null, the boletos are still read', () => {
  const out = parseDuplicatas(xml('<cobr><dup><nDup>1</nDup><dVenc>2026-11-10</dVenc><vDup>10.00</vDup></dup></cobr>').replace(`Id="NFe${KEY}"`, ''));
  expect(out.key).toBeNull();
  expect(out.duplicatas).toHaveLength(1);
});
