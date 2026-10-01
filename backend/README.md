# Backend (Google Apps Script)

- `nucleo.js` — regras do servidor (sem APIs do Google); também usado nos testes do app.
- `api.js` — `doPost` (sincronização) e adaptação das abas da planilha.
- `configurar.js` — `configurar()`: cria a planilha, as abas e mostra o **código de conexão**.

## Conta do Google (importante)

Este backend pertence à conta **iristenio@unilab.edu.br**. O `clasp` do computador pode estar logado em outra
conta (outros projetos usam o Gmail pessoal), então use sempre o login nomeado:

```bash
npx @google/clasp login --user unilab      # uma vez (abre o navegador; escolher a conta UNILAB)
npx @google/clasp --user unilab show-authorized-user
```

e acrescente `--user unilab` aos comandos abaixo. Sem isso o Google responde "The caller does not have permission".

## Atualizar o código no Google

```bash
cd backend
npx @google/clasp --user unilab push --force
npx @google/clasp --user unilab update-deployment <ID_DA_IMPLANTACAO> --description "..."
```

`update-deployment` mantém o mesmo endereço (os aparelhos não precisam reconectar).

> O endereço público fica fixo em `URL_PUBLICA` (configurar.js): `ScriptApp.getService().getUrl()`, executado
> no editor, devolve o endereço de teste `/dev`, que exige login e não funciona no app.

## Primeira configuração

1. Abra o projeto no editor do Apps Script.
2. Escolha a função `configurar` e clique em **Executar**; autorize o acesso.
3. Copie o código `AGENDA1:…` que aparece no registro de execução.
4. No app: **Ajustes → Sincronização com o Google** → cole o código → **Conectar**.

Se desconfiar que o código vazou, execute `trocarToken()` e conecte os aparelhos de novo.
