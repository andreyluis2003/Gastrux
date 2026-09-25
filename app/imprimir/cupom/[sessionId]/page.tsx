'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import QRCode from 'qrcode';
import type { Receipt } from '@/lib/print/tickets';
import { printWhenReady } from '@/lib/print/print-frame';
import '../../print.css';

const PAYMENT: Record<string, string> = {
  dinheiro: 'Dinheiro',
  'cartao de credito': 'Cartão de crédito',
  'cartao de debito': 'Cartão de débito',
  pix: 'PIX',
};

const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const groups = (key: string) => key.replace(/(.{4})/g, '$1 ').trim();
const digits = (value: string) => value.replace(/\D/g, '');
const cnpj = (value: string) =>
  digits(value).length === 14 ? digits(value).replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5') : value;
const cpf = (value: string) =>
  digits(value).length === 11 ? digits(value).replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : value;

/**
 * Customer receipt in 80 mm with the NFC-e data (number, series, access key, protocol, QR code).
 * When the fiscal provider returned its official DANFE (production), a link to it is offered:
 * that one follows the official NFC-e layout, so it is the one to hand to the customer.
 */
export default function ReceiptPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  // ?auto=1: opened by printInHiddenFrame, prints itself (read in the effect: same first render on
  // the server and in the browser, and no Suspense boundary needed as with useSearchParams)
  const [auto, setAuto] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const isAuto = new URLSearchParams(window.location.search).get('auto') === '1';
    setAuto(isAuto);
    fetch(`/api/print/receipt/${sessionId}`)
      .then(async (res) => {
        const data: Receipt & { error?: string } = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erro ao carregar a conta');
        if (data.nfce?.qrCodeData) setQr(await QRCode.toDataURL(data.nfce.qrCodeData, { margin: 0, width: 200 }));
        setReceipt(data);
        if (isAuto) printWhenReady();
      })
      .catch((e) => setError(e.message));
  }, [sessionId]);

  if (error) return <p className="p-4 text-red-700">{error}</p>;
  if (!receipt) return <p className="p-4">Carregando...</p>;

  const nfce = receipt.nfce;
  return (
    <div className="p-4">
      {!auto && (
        <div className="no-print mb-4 flex gap-2">
          <button type="button" className="px-4 py-2 rounded bg-blue-600 text-white" onClick={() => window.print()}>
            Imprimir
          </button>
          {nfce?.officialDanfeUrl && (
            <a className="px-4 py-2 rounded border" href={nfce.officialDanfeUrl} target="_blank" rel="noopener">
              DANFE oficial (PDF)
            </a>
          )}
        </div>
      )}
      <div className="print-ticket">
        <h1>{receipt.restaurant.name}</h1>
        {receipt.restaurant.cnpj && <div className="center muted">CNPJ {cnpj(receipt.restaurant.cnpj)}</div>}
        {receipt.restaurant.stateRegistration && <div className="center muted">IE {receipt.restaurant.stateRegistration}</div>}
        {receipt.restaurant.address && <div className="center muted">{receipt.restaurant.address}</div>}
        <hr />
        <div className="center">
          {nfce?.status === 'authorized' ? 'Documento Auxiliar da Nota Fiscal de Consumidor Eletrônica' : 'CUPOM NÃO FISCAL'}
        </div>
        {nfce?.homologation && (
          <div className="center" style={{ fontWeight: 700 }}>
            EMITIDA EM AMBIENTE DE HOMOLOGAÇÃO - SEM VALOR FISCAL
          </div>
        )}
        <div className="center muted">{receipt.title}</div>
        <hr />
        {receipt.lines.map((line, i) => (
          <div key={i}>
            <div>{line.name}</div>
            <div className="row">
              <span>
                {line.quantity} x {money(line.unitPrice)}
              </span>
              <span>{money(line.total)}</span>
            </div>
            {line.modifiers.map((m, j) => (
              <div key={j} className="muted">
                &nbsp;&nbsp;+ {m.name}
                {m.price !== 0 ? ` (${money(m.price)} cada)` : ''}
              </div>
            ))}
          </div>
        ))}
        <hr />
        <div className="row big">
          <span>TOTAL</span>
          <span>{money(receipt.total)}</span>
        </div>
        {receipt.paymentMethod && (
          <div className="row">
            <span>Forma de pagamento</span>
            <span>{PAYMENT[receipt.paymentMethod] ?? receipt.paymentMethod}</span>
          </div>
        )}
        <hr />
        {receipt.customerCPF ? <div>CONSUMIDOR CPF: {cpf(receipt.customerCPF)}</div> : <div>CONSUMIDOR NÃO IDENTIFICADO</div>}
        {nfce ? (
          <>
            <hr />
            <div>
              NFC-e nº {String(nfce.number).padStart(9, '0')} Série {nfce.series}
            </div>
            {nfce.authorizedAt && <div>{new Date(nfce.authorizedAt).toLocaleString('pt-BR')}</div>}
            {nfce.status !== 'authorized' && (
              <div style={{ fontWeight: 700 }}>NFC-e EM PROCESSAMENTO: reimprima depois de autorizada</div>
            )}
            {nfce.accessKey && (
              <>
                <div className="center">Chave de acesso</div>
                <div className="center break">{groups(nfce.accessKey)}</div>
              </>
            )}
            {nfce.protocolNumber && <div>Protocolo de autorização: {nfce.protocolNumber}</div>}
            {qr && (
              <div className="center" style={{ marginTop: '2mm' }}>
                <img src={qr} alt="QR code de consulta da NFC-e" style={{ width: '40mm', height: '40mm', display: 'block', margin: '0 auto' }} />
                <div className="muted">Consulte pela chave de acesso ou pelo QR code</div>
              </div>
            )}
          </>
        ) : (
          <>
            <hr />
            <div className="center">Sem NFC-e para esta conta</div>
          </>
        )}
      </div>
    </div>
  );
}
