# Guia de Emails Segmentados por Campanha

## Visão Geral

O sistema de emails segmentados permite enviar campanhas customizadas para diferentes grupos de usuários:

1. **Early Adopters** - Usuários antigos e ativos (30+ dias, login nos últimos 7 dias)
2. **Inactive Users** - Usuários inativos (sem login 30+ dias)
3. **New Users** - Usuários novos (últimos 7 dias)

---

## APIs de Segmentação

### 1. Obter Early Adopters

**Endpoint:** `GET /api/email/segments/early-adopters`

Retorna lista de usuários que:
- Foram cadastrados há mais de 30 dias
- Fizeram login nos últimos 7 dias

**Resposta:**
```json
{
  "success": true,
  "segment": "early_adopters",
  "count": 15,
  "users": [
    {
      "id": "user-id",
      "email": "usuario@email.com",
      "name": "João Silva",
      "createdAt": "2025-01-01T00:00:00Z",
      "lastSignInAt": "2026-04-15T10:30:00Z"
    }
  ]
}
```

---

### 2. Obter Usuários Inativos

**Endpoint:** `GET /api/email/segments/inactive-users`

Retorna lista de usuários que:
- Não fizeram login há 30+ dias
- Ou nunca fizeram login
- Mas a conta está ativa

**Resposta:**
```json
{
  "success": true,
  "segment": "inactive_users",
  "count": 8,
  "users": [...]
}
```

---

### 3. Obter Novos Usuários

**Endpoint:** `GET /api/email/segments/new-users`

Retorna lista de usuários que:
- Foram cadastrados nos últimos 7 dias

**Resposta:**
```json
{
  "success": true,
  "segment": "new_users",
  "count": 5,
  "users": [...]
}
```

---

## APIs de Envio

### 1. Enviar Email Early Adopter VIP

**Endpoint:** `POST /api/email/send-early-adopter`

**Opção A: Enviar para um usuário específico**
```bash
curl -X POST http://localhost:3000/api/email/send-early-adopter \
  -H "Content-Type: application/json" \
  -d '{"userId": "user-id-uuid"}'
```

**Opção B: Enviar para todos os early adopters**
```bash
curl -X POST http://localhost:3000/api/email/send-early-adopter \
  -H "Content-Type: application/json" \
  -d '{"sendToAll": true}'
```

**Resposta:**
```json
{
  "success": true,
  "message": "Emails enviados para early adopters",
  "sent": 15,
  "failed": 0,
  "total": 15
}
```

---

### 2. Enviar Email de Reativação (Inativos)

**Endpoint:** `POST /api/email/send-inactive`

**Opção A: Enviar para um usuário específico**
```bash
curl -X POST http://localhost:3000/api/email/send-inactive \
  -H "Content-Type: application/json" \
  -d '{"userId": "user-id-uuid"}'
```

**Opção B: Enviar para todos os inativos**
```bash
curl -X POST http://localhost:3000/api/email/send-inactive \
  -H "Content-Type: application/json" \
  -d '{"sendToAll": true}'
```

---

### 3. Enviar Email Boas-vindas (Novos Usuários)

**Endpoint:** `POST /api/email/send-new-user`

**Opção A: Enviar para um usuário específico**
```bash
curl -X POST http://localhost:3000/api/email/send-new-user \
  -H "Content-Type: application/json" \
  -d '{"userId": "user-id-uuid"}'
```

**Opção B: Enviar para todos os novos usuários**
```bash
curl -X POST http://localhost:3000/api/email/send-new-user \
  -H "Content-Type: application/json" \
  -d '{"sendToAll": true}'
```

---

## Templates de Email

### 1. Early Adopter (VIP)

**Assunto:** 🎉 Você é um dos nossos melhores - Acesso VIP!

**Conteúdo:**
- Agradecimento por ser pioneer
- Benefícios VIP exclusivos (acesso beta, suporte premium, desconto)
- CTA para acessar recursos VIP
- Convite para feedback direto

---

### 2. Inactive User (Reactivation)

**Assunto:** 🙋 Restaurantes: Melhoramos muito! Volta pra ver

**Conteúdo:**
- Saudade do usuário
- Resumo das melhorias (Dashboard 2.0, Analytics, Offline Mode, etc)
- Garantia de que a conta e dados estão seguros
- CTA para voltar ao dashboard

---

### 3. New User (Getting Started)

**Assunto:** 🊗 Restaurantes: Bem-vindo! 3 dicas para começar

**Conteúdo:**
- Saudação calorosa
- 3 primeiros passos:
  1. Cadastre seus ingredientes
  2. Crie suas receitas
  3. Acompanhe suas métricas
- Dica sobre o plano Starter
- Link para documentação
- CTA para dashboard

---

## Automação via Daemon

Você pode agendar o envio automático de emails usando um daemon. Exemplos:

```javascript
// Enviar para early adopters toda segunda-feira às 10:00 AM
POST /api/email/send-early-adopter { sendToAll: true }

// Enviar para inativos toda sexta-feira às 3:00 PM
POST /api/email/send-inactive { sendToAll: true }

// Enviar para novos usuários diariamente às 8:00 AM
POST /api/email/send-new-user { sendToAll: true }
```

---

## Rastreamento

Os emails segmentados são rastreados automaticamente via:
- `EmailDeliveryLog` - Registra envio, abertura, cliques
- `EmailVariant` - Usa A/B testing se configurado
- `ConversionFunnel` - Rastreia conversão de cada segmento

Acesse `/dashboard/email-analytics` para ver métricas.

---

## Permissões

- ✅ OWNER: Pode enviar para qualquer segmento
- ✅ MANAGER: Pode visualizar segmentos (implementar conforme necessário)
- ❌ COOK: Sem acesso

---

## Checklist de Implementação

✅ APIs de segmentação (GET)
✅ Endpoints de envio (POST)
✅ Templates customizados por segmento
✅ Notificações registradas (NOTIF_ID)
❌ UI para gerenciar campanhas (a implementar)
❌ Daemon de envio automático (a implementar)
❌ Analytics por segmento (a implementar)
