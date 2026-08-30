// @ts-nocheck
import { NFeProvider, NFeEmitPayload, NFeEmitResult } from './types';

/**
 * Focus NFe REST API client.
 *
 * Docs: https://focusnfe.com.br/doc/
 * - Auth: Basic (token as user, password empty) — token:
 * - Sandbox base: https://homologacao.focusnfe.com.br
 * - Prod base:    https://api.focusnfe.com.br
 */
export class FocusNFeClient implements NFeProvider {
  name = 'focusnfe';
  baseUrl: string;
  apiKey: string;

  constructor(apiKey: string, environment: 'sandbox' | 'production' = 'sandbox') {
    this.apiKey = apiKey;
    this.baseUrl = environment === 'production'
      ? 'https://api.focusnfe.com.br'
      : 'https://homologacao.focusnfe.com.br';
  }

  private authHeader(): string {
    const token = Buffer.from(`${this.apiKey}:`).toString('base64');
    return `Basic ${token}`;
  }

  private buildNFCePayload(p: NFeEmitPayload): any {
    // Natureza da operação + ambiente inferido por baseUrl
    const items = p.items.map((item, idx) => ({
      numero_item: idx + 1,
      codigo_produto: `PROD-${idx + 1}`,
      descricao: item.description?.slice(0, 120) || 'Produto',
      cfop: item.cfop || '5102',
      unidade_comercial: item.unit || 'UN',
      quantidade_comercial: Number(item.quantity).toFixed(4),
      valor_unitario_comercial: Number(item.unitPrice).toFixed(4),
      valor_bruto: Number(item.totalPrice).toFixed(2),
      unidade_tributavel: item.unit || 'UN',
      quantidade_tributavel: Number(item.quantity).toFixed(4),
      valor_unitario_tributavel: Number(item.unitPrice).toFixed(4),
      ncm: item.ncm || '21069090',
      origem: item.icmsOrigin || '0',
      icms_situacao_tributaria: item.icmsCST || '102', // Simples Nacional sem permissão de crédito
      pis_situacao_tributaria: '07',
      cofins_situacao_tributaria: '07',
    }));

    return {
      natureza_operacao: p.naturezaOperacao || 'Venda ao consumidor',
      data_emissao: new Date().toISOString().slice(0, 19) + '-03:00',
      presenca_comprador: '1', // Operação presencial
      cnpj_emitente: (p.cnpj || '').replace(/\D/g, ''),
      uf_emitente: p.uf,
      municipio_emitente: '', // Focus NFe usa dados cadastrais do emitente
      cpf_destinatario: p.customerCPF ? p.customerCPF.replace(/\D/g, '') : undefined,
      nome_destinatario: p.customerName || undefined,
      items,
      formas_pagamento: [
        {
          forma_pagamento: this.mapPaymentMethod(p.paymentMethod),
          valor_pagamento: Number(p.paymentAmount || p.totalAmount).toFixed(2),
        },
      ],
    };
  }

  private mapPaymentMethod(method?: string): string {
    const m = (method || '').toLowerCase();
    if (m.includes('dinheiro') || m === 'cash') return '01';
    if (m.includes('cartao de credito') || m.includes('credit')) return '03';
    if (m.includes('cartao de debito') || m.includes('debit')) return '04';
    if (m.includes('pix')) return '17';
    if (m.includes('cheque')) return '02';
    if (m.includes('vale')) return '10';
    return '99'; // Outros
  }

  async emitNFCe(p: NFeEmitPayload): Promise<NFeEmitResult> {
    const payload = this.buildNFCePayload(p);
    const url = `${this.baseUrl}/v2/nfce?ref=${encodeURIComponent(p.providerRef)}`;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': this.authHeader(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        return {
          ok: false,
          status: 'rejected',
          rejectionReason: json?.mensagem || json?.erros?.[0]?.mensagem || `HTTP ${res.status}`,
          statusDescription: json?.status_sefaz || `Erro HTTP ${res.status}`,
          raw: json,
        };
      }

      return this.parseResponse(json);
    } catch (err: any) {
      return {
        ok: false,
        status: 'rejected',
        rejectionReason: err?.message || 'Erro de rede',
        raw: { error: err?.message },
      };
    }
  }

  async emitNFe(p: NFeEmitPayload): Promise<NFeEmitResult> {
    // NF-e segue endpoint /v2/nfe — implementação simplificada reutilizando lógica similar
    return this.emitNFCe(p); // fallback em Fase 53 (foco = NFC-e)
  }

  async getStatus(providerRef: string, documentType: 'NFCe' | 'NFe' = 'NFCe'): Promise<NFeEmitResult> {
    const endpoint = documentType === 'NFCe' ? 'nfce' : 'nfe';
    const url = `${this.baseUrl}/v2/${endpoint}/${encodeURIComponent(providerRef)}`;

    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: { 'Authorization': this.authHeader() },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        return {
          ok: false,
          status: 'rejected',
          rejectionReason: json?.mensagem || `HTTP ${res.status}`,
          raw: json,
        };
      }
      return this.parseResponse(json);
    } catch (err: any) {
      return {
        ok: false,
        status: 'rejected',
        rejectionReason: err?.message || 'Erro de rede',
        raw: { error: err?.message },
      };
    }
  }

  async cancelNFCe(providerRef: string, justificativa: string): Promise<NFeEmitResult> {
    if (!justificativa || justificativa.length < 15) {
      return {
        ok: false,
        status: 'rejected',
        rejectionReason: 'Justificativa deve ter pelo menos 15 caracteres',
      };
    }
    const url = `${this.baseUrl}/v2/nfce/${encodeURIComponent(providerRef)}?justificativa=${encodeURIComponent(justificativa)}`;

    try {
      const res = await fetch(url, {
        method: 'DELETE',
        headers: { 'Authorization': this.authHeader() },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        return {
          ok: false,
          status: 'rejected',
          rejectionReason: json?.mensagem || `HTTP ${res.status}`,
          raw: json,
        };
      }
      return {
        ok: true,
        status: 'cancelled',
        statusDescription: json?.mensagem_sefaz || 'Cancelado',
        protocolNumber: json?.numero_protocolo,
        raw: json,
      };
    } catch (err: any) {
      return {
        ok: false,
        status: 'rejected',
        rejectionReason: err?.message || 'Erro de rede',
        raw: { error: err?.message },
      };
    }
  }

  private parseResponse(json: any): NFeEmitResult {
    const rawStatus = (json?.status || '').toLowerCase();
    let status: NFeEmitResult['status'] = 'pending';
    if (rawStatus === 'autorizado') status = 'authorized';
    else if (rawStatus === 'processando_autorizacao') status = 'processing';
    else if (rawStatus === 'cancelado') status = 'cancelled';
    else if (rawStatus === 'denegado' || rawStatus === 'erro_autorizacao' || rawStatus === 'rejeitado') status = 'rejected';
    else if (rawStatus) status = 'submitted';

    return {
      ok: status === 'authorized' || status === 'processing' || status === 'submitted',
      status,
      accessKey: json?.chave_nfe || json?.chave_nfce,
      protocolNumber: json?.numero_protocolo,
      qrCodeData: json?.qrcode_url || json?.url_consulta_nfce || json?.url_consulta,
      qrCodeUrl: json?.qrcode_url, // pode ser mesma string
      danfeUrl: json?.caminho_danfe ? `${this.baseUrl}${json.caminho_danfe}` : json?.url_danfe,
      xmlUrl: json?.caminho_xml_nota_fiscal ? `${this.baseUrl}${json.caminho_xml_nota_fiscal}` : json?.url_xml,
      rejectionReason: status === 'rejected' ? (json?.mensagem_sefaz || json?.mensagem || 'Rejeitado pela SEFAZ') : undefined,
      statusDescription: json?.mensagem_sefaz || json?.status,
      raw: json,
    };
  }
}
