// @ts-nocheck
import { NFeProvider, NFeEmitPayload, NFeEmitResult } from './types';

/**
 * Mock/sandbox provider — simula respostas SEFAZ sem chamar provider real.
 * Usado quando não há apiKey configurada ou quando environment='sandbox' e FORCE_REAL não estiver setado.
 */
export class MockNFeProvider implements NFeProvider {
  name = 'mock';

  private generateAccessKey(uf: string, cnpj: string, series: number, number: number, documentType: 'NFCe' | 'NFe'): string {
    // Formato 44 dígitos: UF(2) + AAMM(4) + CNPJ(14) + MOD(2) + SERIE(3) + NUMERO(9) + TP_EMISSAO(1) + COD_NUM(8) + DV(1)
    const ufCodes: any = { AC: '12', AL: '27', AP: '16', AM: '13', BA: '29', CE: '23', DF: '53', ES: '32', GO: '52', MA: '21', MT: '51', MS: '50', MG: '31', PA: '15', PB: '25', PR: '41', PE: '26', PI: '22', RJ: '33', RN: '24', RS: '43', RO: '11', RR: '14', SC: '42', SP: '35', SE: '28', TO: '17' };
    const ufCode = ufCodes[uf] || '35';
    const now = new Date();
    const aamm = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const cleanCnpj = (cnpj || '').replace(/\D/g, '').padStart(14, '0').slice(0, 14);
    const mod = documentType === 'NFCe' ? '65' : '55';
    const serStr = String(series).padStart(3, '0');
    const numStr = String(number).padStart(9, '0');
    const tpEmi = '1';
    const codNum = String(Math.floor(Math.random() * 100000000)).padStart(8, '0');
    const partial = `${ufCode}${aamm}${cleanCnpj}${mod}${serStr}${numStr}${tpEmi}${codNum}`;
    // DV módulo 11
    const weights = [2, 3, 4, 5, 6, 7, 8, 9];
    let sum = 0;
    for (let i = partial.length - 1, j = 0; i >= 0; i--, j++) {
      sum += parseInt(partial[i], 10) * weights[j % weights.length];
    }
    let dv = 11 - (sum % 11);
    if (dv >= 10) dv = 0;
    return `${partial}${dv}`;
  }

  async emitNFCe(p: NFeEmitPayload): Promise<NFeEmitResult> {
    const accessKey = this.generateAccessKey(p.uf, p.cnpj, p.series, p.number, 'NFCe');
    const qrCodeData = `https://www.fazenda.${p.uf.toLowerCase()}.gov.br/nfce/consulta?chNFe=${accessKey}&nVersao=100&tpAmb=2&cDest=&dhEmi=${encodeURIComponent(new Date().toISOString())}&vNF=${p.totalAmount.toFixed(2)}&vICMS=0.00&digVal=SIMULADO&cIdToken=000001&cHashQRCode=SIMULADO`;
    return {
      ok: true,
      status: 'authorized',
      accessKey,
      protocolNumber: `SIM${Date.now()}`,
      qrCodeData,
      qrCodeUrl: qrCodeData,
      danfeUrl: undefined,
      xmlUrl: undefined,
      statusDescription: 'Autorizado (modo sandbox/simulado)',
      raw: { mock: true, payload: p },
    };
  }

  async emitNFe(p: NFeEmitPayload): Promise<NFeEmitResult> {
    const accessKey = this.generateAccessKey(p.uf, p.cnpj, p.series, p.number, 'NFe');
    return {
      ok: true,
      status: 'authorized',
      accessKey,
      protocolNumber: `SIM${Date.now()}`,
      statusDescription: 'Autorizado (modo sandbox/simulado)',
      raw: { mock: true, payload: p },
    };
  }

  async getStatus(providerRef: string): Promise<NFeEmitResult> {
    return {
      ok: true,
      status: 'authorized',
      statusDescription: 'Autorizado (modo sandbox/simulado)',
      raw: { mock: true, providerRef },
    };
  }

  async cancelNFCe(providerRef: string, justificativa: string): Promise<NFeEmitResult> {
    if (!justificativa || justificativa.length < 15) {
      return {
        ok: false,
        status: 'rejected',
        rejectionReason: 'Justificativa deve ter pelo menos 15 caracteres',
      };
    }
    return {
      ok: true,
      status: 'cancelled',
      protocolNumber: `CAN${Date.now()}`,
      statusDescription: 'Cancelado (modo sandbox/simulado)',
      raw: { mock: true, providerRef, justificativa },
    };
  }
}
