# Backend (Google Apps Script)

- `nucleo.js` — regras do servidor (sem APIs do Google); também usado nos testes do app.
- `api.js` — `doPost` (sincronização) e adaptação das abas da planilha.
- `configurar.js` — `configurar()`: cria a planilha, as abas e mostra o **código de conexão**.

## Atualizar o código no Google

```bash
cd backend
npx @google/clasp push --force
npx @google/clasp update-deployment <ID_DA_IMPLANTACAO> --description "..."
```

`update-deployment` mantém o mesmo endereço (os aparelhos não precisam reconectar).

## Primeira configuração

1. Abra o projeto no editor do Apps Script.
2. Escolha a função `configurar` e clique em **Executar**; autorize o acesso.
3. Copie o código `AGENDA1:…` que aparece no registro de execução.
4. No app: **Ajustes → Sincronização com o Google** → cole o código → **Conectar**.

Se desconfiar que o código vazou, execute `trocarToken()` e conecte os aparelhos de novo.
