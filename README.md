# Agenda

Agenda pessoal para tablet: compromissos, tarefas e eventos (aniversários e férias),
funcionando offline e sincronizando com Google Calendar e Google Tasks.

- Especificação: [ESPECIFICACAO.md](ESPECIFICACAO.md)
- Plano de implementação: [PLANO.md](PLANO.md)

## Desenvolvimento

```bash
cd app
npm install
npm run dev      # servidor local em http://localhost:5173/agenda/
npm test         # testes das regras de negócio
npm run build    # gera a versão de produção em app/dist
```

Cada `push` na branch `main` publica automaticamente no GitHub Pages.
