# Guia: Configurar Cron Job para Resetar Contadores de Transacoes

## O que faz

Este cron job executa diariamente para remover registros de contador de transacoes com mais de 30 dias. Isso:

✅ Mantém o banco de dados limpo e otimizado
✅ Remove dados de historico antigos
✅ Executa automaticamente sem intervencao manual

## Opcoes de Configuracao

### Opcao 1: Daemon/Scheduled Task (Recomendado)

Use a ferramenta `perform_subtask_daemon_management` para agendar uma chamada HTTP POST automatica.

**Configuracao:**
- **URL:** `https://seu-app.com/api/admin/cleanup-transaction-counters`
- **Metodo:** POST
- **Headers:** `X-Admin-Secret: seu-secret-aqui`
- **Frequencia:** Diariamente a meia-noite
- **Timeout:** 5 minutos

### Opcao 2: Curl com Crontab (Linux/Mac)

Adicione esta linha ao seu crontab (`crontab -e`):

```bash
0 0 * * * curl -X POST https://seu-app.com/api/admin/cleanup-transaction-counters \
  -H "X-Admin-Secret: seu-admin-secret"
```

**Explicacao:**
- `0 0` = Meia-noite (00:00)
- `* * *` = Todos os dias

### Opcao 3: GitHub Actions (Para Deploy em Prod)

Crie um arquivo `.github/workflows/cleanup-cron.yml`:

```yaml
name: Daily Cleanup

on:
  schedule:
    - cron: '0 0 * * *'  # Meia-noite UTC

jobs:
  cleanup:
    runs-on: ubuntu-latest
    steps:
      - name: Cleanup Transaction Counters
        run: |
          curl -X POST ${{ secrets.APP_URL }}/api/admin/cleanup-transaction-counters \
            -H "X-Admin-Secret: ${{ secrets.ADMIN_CLEANUP_SECRET }}"
```

## Configurar Secret de Admin

1. Defina a variavel de ambiente no `.env`:

```bash
ADMIN_CLEANUP_SECRET=seu-secret-muito-seguro-aqui
```

2. Use um secret forte (minimo 32 caracteres aleatorios):

```bash
# Gerar secret seguro
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Monitoramento

Verifique os logs para confirmar que o cron job esta funcionando:

```bash
# Teste manual a chamada
curl -X POST http://localhost:3000/api/admin/cleanup-transaction-counters \
  -H "X-Admin-Secret: seu-admin-secret"

# Resposta esperada:
# {
#   "success": true,
#   "message": "Limpeza concluida: 150 registros antigos removidos",
#   "timestamp": "2026-04-19T22:00:00.000Z",
#   "deletedCount": 150
# }
```

## Alertas e Troubleshooting

### Erro 401 (Unauthorized)
Verifique se o `X-Admin-Secret` esta correto e matches com `ADMIN_CLEANUP_SECRET` no `.env`.

### Erro 500 (Internal Server Error)
Verifique os logs do servidor para detalhes do erro.

### Nada acontece
Confirme que:
1. O cron job esta agendado corretamente
2. O secret esta correto
3. A URL esta acessivel
4. Nao ha firewall bloqueando as chamadas

## Agendamento Recomendado

- **Horario:** Meia-noite UTC (00:00 UTC)
- **Frequencia:** Diariamente
- **Timeout:** 5-10 minutos
- **Retry:** Retentar 2 vezes em caso de falha

## Impacto no Desempenho

- **Tempo de execucao:** ~500ms - 2s (dependendo de quantos registros existem)
- **Carga no banco:** Minima (apenas DELETE com WHERE)
- **Usuarios afetados:** Nenhum (operacao em background)

## Dados Preservados

Os contadores do usuario de **hoje** sao SEMPRE preservados, apenas registros com mais de 30 dias sao deletados.

## Exemplo: Primeiro Setup

1. Defina o secret:
```bash
echo "ADMIN_CLEANUP_SECRET=seu-secret-aqui" >> .env
```

2. Deploy a aplicacao

3. Configure o cron job (escolha uma opcao acima)

4. Teste manualmente:
```bash
curl -X POST https://seu-app.com/api/admin/cleanup-transaction-counters \
  -H "X-Admin-Secret: seu-secret-aqui"
```

5. Confirme a resposta:
```json
{
  "success": true,
  "message": "Limpeza concluida: X registros antigos removidos",
  "timestamp": "2026-04-19T22:00:00.000Z",
  "deletedCount": X
}
```

Pronto! O cron job esta configurado e ira executar automaticamente todos os dias a meia-noite.
