/** Knowledge: NFC-e (fiscal phase). */
export default `## Nota fiscal (NFC-e)
Menu: Fiscal > Notas fiscais (NFC-e) para configurar; Fiscal > Notas emitidas para consultar. Dono e gerente. Todos os planos.
- O Gastrux emite a NFC-e (nota do consumidor) pela Focus NFe. É preciso: CNPJ com inscrição estadual, certificado digital A1, CSC da SEFAZ e o token da Focus NFe, além dos dados fiscais de cada produto (NCM, CFOP, CSOSN) definidos pelo contador.
- Configuração guiada (aba Configuração, 5 etapas que salvam ao avançar): 1 O que ter em mãos (lista); 2 Empresa (CNPJ, IE, razão social, UF, regime; só Simples Nacional); 3 Emissor (token da Focus e ambiente Teste ou Produção; certificado A1 e CSC ficam na Focus); 4 Tributação (NCM, CFOP, origem, CSOSN, CST PIS/COFINS padrão, com texto pronto para o contador e a lista de produtos sem dados); 5 Revisar e testar (o que falta, emissão automática, série e "Emitir nota de teste" de R$ 1,00 em homologação; se o servidor não envia notas de teste, a tela diz "Nota simulada" e a confirmação real é a primeira nota em Produção). A Visão geral mostra a etapa onde parou, com "Continuar".
- A nota pode sair automaticamente ao fechar a conta. Notas rejeitadas geram aviso no sino com o motivo.
- Cancelamento de nota pelo Gastrux, dentro do prazo da SEFAZ.
- Dúvidas sobre impostos e obrigação de emitir: o contador do restaurante orienta.`;
