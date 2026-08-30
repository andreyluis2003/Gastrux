// @ts-nocheck
export interface PdfGenerationRequest {
  html_content: string;
  pdf_options?: {
    format?: string;
    landscape?: boolean;
    margin?: {
      top?: string | number;
      right?: string | number;
      bottom?: string | number;
      left?: string | number;
    };
    print_background?: boolean;
    scale?: number;
  };
  css_stylesheet?: string;
  base_url?: string;
}

export async function generatePdfFromHtml(
  request: PdfGenerationRequest
): Promise<Buffer> {
  try {
    // Step 1: Create the PDF generation request
    const createResponse = await fetch(
      'https://apps.abacus.ai/api/createConvertHtmlToPdfRequest',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          deployment_token: process.env.ABACUSAI_API_KEY,
          html_content: request.html_content,
          pdf_options: request.pdf_options || { format: 'A4' },
          base_url: request.base_url || process.env.NEXTAUTH_URL || '',
          css_stylesheet: request.css_stylesheet,
        }),
      }
    );

    if (!createResponse.ok) {
      const error = await createResponse.json().catch(() => ({
        error: 'Falha ao criar requisição de PDF',
      }));
      throw new Error(
        error.error || 'Falha ao criar requisição de PDF'
      );
    }

    const { request_id } = await createResponse.json();
    if (!request_id) {
      throw new Error('ID de requisição não retornado');
    }

    // Step 2: Poll for status until completion
    const maxAttempts = 300;
    let attempts = 0;

    while (attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const statusResponse = await fetch(
        'https://apps.abacus.ai/api/getConvertHtmlToPdfStatus',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            request_id: request_id,
            deployment_token: process.env.ABACUSAI_API_KEY,
          }),
        }
      );

      const statusResult = await statusResponse.json();
      const status = statusResult?.status || 'FAILED';
      const result = statusResult?.result || null;

      if (status === 'SUCCESS') {
        if (result && result.result) {
          const pdfBuffer = Buffer.from(result.result, 'base64');
          return pdfBuffer;
        } else {
          throw new Error('PDF foi gerado mas sem dados de resultado');
        }
      } else if (status === 'FAILED') {
        const errorMsg = result?.error || 'Falha na geração do PDF';
        throw new Error(errorMsg);
      }
      attempts++;
    }

    throw new Error('Geração de PDF expirou');
  } catch (error) {
    console.error('Erro ao gerar PDF:', error);
    throw error;
  }
}

export const PDF_STYLES = `
  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }
  
  body {
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    line-height: 1.6;
    color: #333;
    background: white;
  }
  
  .page {
    page-break-after: always;
    padding: 40px;
  }
  
  .page:last-child {
    page-break-after: avoid;
  }
  
  h1 {
    font-size: 32px;
    margin-bottom: 10px;
    color: #1a1a1a;
  }
  
  h2 {
    font-size: 24px;
    margin: 30px 0 15px 0;
    color: #333;
    border-bottom: 2px solid #007bff;
    padding-bottom: 8px;
  }
  
  h3 {
    font-size: 18px;
    margin: 20px 0 10px 0;
    color: #555;
  }
  
  p {
    margin-bottom: 10px;
  }
  
  .header {
    text-align: center;
    border-bottom: 3px solid #007bff;
    padding-bottom: 20px;
    margin-bottom: 30px;
  }
  
  .header-title {
    font-size: 28px;
    font-weight: bold;
    color: #1a1a1a;
    margin-bottom: 5px;
  }
  
  .header-subtitle {
    font-size: 14px;
    color: #666;
  }
  
  .footer {
    text-align: center;
    font-size: 12px;
    color: #999;
    margin-top: 40px;
    padding-top: 20px;
    border-top: 1px solid #ddd;
  }
  
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 20px 0;
  }
  
  table th {
    background-color: #007bff;
    color: white;
    padding: 12px;
    text-align: left;
    font-weight: 600;
  }
  
  table td {
    padding: 10px 12px;
    border-bottom: 1px solid #ddd;
  }
  
  table tr:nth-child(even) {
    background-color: #f8f9fa;
  }
  
  .stats {
    display: flex;
    gap: 20px;
    margin: 20px 0;
    flex-wrap: wrap;
  }
  
  .stat-card {
    flex: 1;
    min-width: 200px;
    background: #f8f9fa;
    padding: 15px;
    border-radius: 8px;
    border-left: 4px solid #007bff;
  }
  
  .stat-label {
    font-size: 12px;
    color: #666;
    text-transform: uppercase;
    margin-bottom: 5px;
  }
  
  .stat-value {
    font-size: 24px;
    font-weight: bold;
    color: #1a1a1a;
  }
  
  .alert {
    padding: 12px 15px;
    margin: 15px 0;
    border-radius: 6px;
    border-left: 4px solid;
  }
  
  .alert-critical {
    background-color: #fff5f5;
    border-left-color: #dc2626;
  }
  
  .alert-high {
    background-color: #fffbeb;
    border-left-color: #d97706;
  }
  
  .badge {
    display: inline-block;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 600;
  }
  
  .badge-active {
    background-color: #d1fae5;
    color: #065f46;
  }
  
  .badge-inactive {
    background-color: #fee2e2;
    color: #991b1b;
  }
  
  .badge-success {
    background-color: #d1fae5;
    color: #065f46;
  }
  
  .badge-warning {
    background-color: #fef3c7;
    color: #92400e;
  }
  
  .badge-error {
    background-color: #fee2e2;
    color: #991b1b;
  }
  
  .section {
    margin: 30px 0;
    page-break-inside: avoid;
  }
  
  .date-generated {
    text-align: right;
    font-size: 11px;
    color: #999;
    margin-top: 20px;
  }
  
  ol {
    margin: 20px 0 20px 20px;
  }
  
  ol li {
    margin-bottom: 8px;
  }
`;
