# LAO DevSpace — verificação do fluxo MCP (28/10/2026)

## Cadeia de execução verificada

1. ChatGPT -> DevSpace MCP autenticado -> `lao_status` / `lao_models`: confirmado.
2. `lao_delegate` -> Ollama local -> resultado persistido -> revisão pendente: confirmado com Granite.
3. `lao_write_prepare` -> worktree destacado -> `lao_write_run` -> patch registrado: confirmado.
4. `lao_write_validate` -> integridade / escopo: confirmado.
5. `lao_write_test` -> `node:test` em Docker offline, imagem SHA-256 local: confirmado.
6. `lao_write_assess` -> critérios estáticos/testes: confirmado.
7. Aprovação supervisionada com confirmação por fingerprint e promoção de um único
   arquivo: **validado exclusivamente em repositório descartável**, usando os
   opt-ins do teste, Granite local e Docker offline; nunca executado no checkout
   real do LAO.

## Correções incorporadas

- O RPC de modelo local tem prazo de transporte de 210 segundos (máximo de
  execução do modelo: 180 segundos), enquanto ferramentas normais DevSpace
  preservam o limite de 20 segundos. Subscrições SSE não são encerradas
  artificialmente após o handshake.
- O teste MCP HTTP passa a usar um estado LAO descartável independente:
  ele **não pode escrever tarefas de teste** na base do monitor do usuário.
- Um registro de workspace persistido é recarregado com o mesmo ID por outra
  instância de `WorkspaceRegistry`, sem criar outro worktree.
- A ativação MCP fixa o diretório do registro DevSpace em
  `%LOCALAPPDATA%\LAODevSpace\devspace-state-dir.txt` e o diretório de worktrees
  em `devspace-worktree-root.txt` antes de substituir o processo. Se qualquer
  caminho mudar, a ativação falha de forma segura. `-VerifyOnly` permite
  verificar essa proteção sem interromper o conector.
- Workspaces históricos ausentes continuam inacessíveis por segurança;
  não se inventam novos IDs para tarefas antigas, nem há aprovação automática.
- A versão base DevSpace continua fixada em 1.0.8, com SHA do overlay
  de integração revisto. Instalar/atualizar LAO não atualiza DevSpace upstream.

## Limitações explícitas

- Tarefas de teste antigas, criadas com um armazenamento de workspaces
  efêmero/diferente do atual, podem aparecer como `awaiting_review` no
  monitor mesmo sem um workspace recuperável. Devem permanecer sem aprovação;
  não há restauração segura se o registro original não existir.
- No servidor operacional, os comandos `lao_write_approve` e
  `lao_write_promote` permanecem protegidos por opt-ins independentes
  e confirmações explícitas. O smoke utiliza servidor e repositório
  **temporários**, não o projeto real.
- A garantia de transporte HTTP foi testada com um modelo simulado que
  respondeu após mais de 20 segundos, e o ciclo completo com Granite real.
  Isso não garante que um proxy externo não tenha seu próprio timeout.

## Reproduzir os testes

```text
node scripts/lao-verify-devspace-pin.mjs
node --test scripts/lao-verify-devspace-pin.test.mjs
pnpm exec tsx --test src/server.test.ts
pnpm exec tsx --test src/lao/mcp-http-e2e.test.ts
```

Para o teste real de promoção usar exclusivamente o fixture
`src/lao/mcp-http-e2e.test.ts`, `LAO_MCP_LIVE=true`,
`LAO_MCP_PROMOTION_LIVE=true` e uma imagem Docker *local*
`LAO_SANDBOX_NODE_IMAGE=<repositorio@sha256:...>`. O teste se recusa a
promover em qualquer checkout preexistente.
