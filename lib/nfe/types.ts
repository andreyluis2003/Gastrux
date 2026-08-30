// @ts-nocheck

export interface NFeEmitItem {
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  totalPrice: number;
  ncm?: string;
  cfop?: string;
  cest?: string;
  icmsOrigin?: string;
  icmsCST?: string; // CST/CSOSN
}

export interface NFeEmitPayload {
  providerRef: string;
  documentType: 'NFCe' | 'NFe';
  cnpj: string;
  uf: string;
  series: number;
  number: number;
  naturezaOperacao?: string; // default: "Venda de mercadoria"
  environment: 'sandbox' | 'production';
  customerCPF?: string;
  customerCNPJ?: string;
  customerName?: string;
  customerEmail?: string;
  items: NFeEmitItem[];
  totalAmount: number;
  paymentMethod?: string; // dinheiro, cartao, pix...
  paymentAmount?: number;
}

export interface NFeEmitResult {
  ok: boolean;
  status: 'pending' | 'submitted' | 'authorized' | 'rejected' | 'cancelled' | 'processing';
  accessKey?: string;
  protocolNumber?: string;
  qrCodeData?: string;
  qrCodeUrl?: string;
  danfeUrl?: string;
  xmlUrl?: string;
  rejectionReason?: string;
  statusDescription?: string;
  raw?: any;
}

export interface NFeProvider {
  name: string;
  emitNFCe(payload: NFeEmitPayload): Promise<NFeEmitResult>;
  emitNFe(payload: NFeEmitPayload): Promise<NFeEmitResult>;
  getStatus(providerRef: string, documentType: 'NFCe' | 'NFe'): Promise<NFeEmitResult>;
  cancelNFCe(providerRef: string, justificativa: string): Promise<NFeEmitResult>;
}
