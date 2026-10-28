# LAO DevSpace — Modo experimental (leitura e escrita isolada sob supervisão)

Este material descreve a operação controlada no worktree `feature/lao-devspace`. **Não modifica o DevSpace estável.** Tray, dashboard, staging standalone e lifecycle de serviço já existem; a instalação SCM real continua separada e elevada. Escrita de modelo ocorre somente no worktree isolado gerenciado; promoção para checkout `feature/*` exige gates adicionais e nunca faz commit/push/merge.

## Ativação

O LAO começa **OFF**. Somente a instância da branch de desenvolvimento pode recebê-lo por variável de ambiente `DEVSPACE_LAO_ENABLED=true`. O Ollama deve escutar em `http://127.0.0.1:11434` (loopback). A configuração padrão escolhe `granite4.2-8b:gpu`, com seleção opcional pelo host. Um segundo modelo local pode ser configurado explicitamente em `DEVSPACE_LAO_FALLBACK_MODEL`; entradas `cloud` sao recusadas e o fallback nunca mascara outage global do Ollama.

Não altere as variáveis ou portas da instância estável para testar a feature. O LAO não muda configurações globais do Ollama.

## Ferramentas MCP experimentais

| Ferramenta | Entrada | Efeito |
|---|---|---|
| `lao_status` | nenhuma | Consulta dependências sem executar modelo |
| `lao_models` | nenhuma | Lista modelos locais sem carregá-los |
| `lao_delegate` | `workspace_id`, `goal`, `acceptance_criteria`; `source_files` (opcional, máximo 3), modelo e deadline | Envia snapshots limitados de arquivos autorizados para análise read-only, sem ferramentas do modelo |
| `lao_retry` | `workspace_id`, `task_id`, `source_files` opcionais | Reexecuta somente tarefa em `needs_revision` após decisão explícita de revisão, com feedback e até 2 correções |
| `lao_write_prepare` | `source_workspace_id`, objetivo, critérios, `allowed_write_paths`, modelo e deadline | Cria worktree gerenciado de checkout `feature/*` limpo, sem executar modelo |
| `lao_write_run` | `workspace_id` isolado, `task_id`, arquivos opcionais | Solicita patch textual ao modelo, valida e aplica somente no worktree; exige revisão, sem testes nem shell |
| `lao_result` | `workspace_id`, `task_id` | Recupera tarefa, execuções, estados, revisão e resumo, se existir |
| `lao_review` | workspace/tarefa, decisão, critérios verificados, evidências e nota | Registra decisão **explícita** do supervisor; não altera arquivos |

As ferramentas adicionais ficam ocultas quando `DEVSPACE_LAO_ENABLED` não é exatamente `true`. Todo acesso à tarefa exige workspace acessível no `WorkspaceRegistry` autorizado e ID compatível com a tarefa.

`lao_delegate` permite apenas leitura explícita de até 3 arquivos regulares pequenos (4.000 bytes cada) por `source_files`, validados pela raiz canônica do DevSpace. Nega traversal, segmentos sensíveis e extensões binárias; persiste nomes de fontes e SHA-256 no histórico. O modelo não recebe ferramentas de filesystem, shell ou patch. A resposta permanece em `awaiting_review` e nunca comprova execução de testes. Uma revisão com `needs_revision` permite `lao_retry` (máximo duas correções), que reaproveita critérios, modelo e permissões imutáveis da tarefa, inclui a nota/evidências da revisão e exige uma nova revisão. Não executa shell ou escrita.

## Validação

A partir do worktree da feature, verificar `pnpm typecheck`, `pnpm exec tsx --test src/lao/*.test.ts`, `pnpm test` e `pnpm build`. As verificações de chat nos testes usam transporte simulado; só chame de execução real quando houver resultado registrado do Granite via Ollama.

`LaoTaskStore.recoverInterrupted()` marca execuções antigas como interrompidas e nunca as retoma automaticamente. O daemon pode rodar em foreground ou no plano WinSW preparado, sempre em `127.0.0.1:7877` por padrão, porta configurável em `DEVSPACE_LAO_PORT` e SQLite independente em `DEVSPACE_LAO_STATE_DIR`. A prontidão exige MCP autenticado e Ollama real. O tray WinForms e o autostart por usuario foram implementados/testados; serviço SCM/boot exige elevação e permanece uma operação separada do build.

## CI da branch

O workflow `.github/workflows/lao-feature-ci.yml` executa a suíte LAO e a regressão do DevSpace em `windows-latest`, além de build e typecheck. A presença do YAML não comprova que a execução hospedada passou; conferir o status do GitHub Actions após o push.

## Segurança e rollback

Nenhuma tarefa experimental pode usar `write=isolated_worktree` ou `shell=allowlist` por meio de `lao_delegate`. A guarda não permite escrita por `lao_delegate`; exclusivamente as duas ferramentas `lao_write_*` fazem delegação de patch limitado. Não misture código de produção com worktrees experimentais. A branch principal não deve receber merge antes do aceite de F3–F7. Instalação do serviço e autostart sempre exigirão autorização expressa.

## Patch seguro interno (F3, delegação experimental isolada)

O módulo interno `applyLaoWorktreePatch` pode aplicar um patch delimitado em worktree **gerenciado e desanexado**, desde que o supervisor tenha autorizado cada caminho em `allowedWritePaths`, o estado seja `running`, o patch tenha até 5 ações/32 kB, e `requireReview` seja verdadeiro. O módulo reutiliza `applyPatch` e coleta diff e arquivos não rastreados, mas não executa comandos, testes ou commits. As ferramentas MCP `lao_write_prepare` e `lao_write_run` permitem propor e aplicar patches do modelo no worktree gerenciado, com bloqueios de escopo e sem shell. Não executam testes, commits, merge nem promoção. A validação e aprovação de escrita continuam bloqueadas até o pipeline determinístico de testes e revisão estar completo.

## Evidências determinísticas em worktree

O módulo `collectLaoReviewEvidence` coleta HEAD, arquivos alterados/não rastreados, resumo do diff e erros de whitespace em worktree gerenciada, sem executar comandos fornecidos pelo modelo. Os campos `testsVerified` e `criteriaVerified` são **false**. Tarefas com escrita não podem ser marcadas aprovadas pelo store até que uma validação determinística completa esteja implementada. Essa função é utilizada pela execução experimental `lao_write_run`, sem alegar que testes foram executados.

## Smoke real de Granite (somente leitura)

Após `pnpm build`, execute **apenas no worktree da feature**, com Ollama local já disponível:

```cmd
cd /d D:\desenvolvimento\lao-devspace
set DEVSPACE_LAO_ENABLED=true&& node scripts/lao-live-smoke.mjs
```

O script cria tarefa somente-leitura, consulta `/api/tags` e `/api/show`, faz **inferência real** via `/api/chat`, grava o resultado no banco SQLite LAO temporário, reabre e verifica a persistência e os hashes. Nenhuma ferramenta de modelo, escrita no repositório, aprovação ou execução de shell pelo agente é habilitada. O estado esperado é `awaiting_review`, não `approved`. Esta evidência não constitui validação de transporte MCP autenticado, critérios determinísticos ou instalação Windows. `think: false` mantém a geração dentro do orçamento de resposta e evita conteúdo vazio em modelos com raciocínio interno. O banco descartável é removido após a prova.


## Escrita experimental no worktree

- `lao_write_prepare` recebe `source_workspace_id`, objetivo, critérios, modelo, deadline e `allowed_write_paths` (1–5 arquivos). Exige workspace autorizado em checkout na branch `feature/*`, limpo, e utiliza a API de worktree gerenciado do DevSpace. Retorna ID da tarefa e **novo** workspace isolado; não executa modelo.
- `lao_write_run` recebe o workspace de trabalho, ID da tarefa e até 3 arquivos de contexto opcionais. Modelo Ollama só produz texto, não recebe ferramentas. O broker valida formato, até 5 operações/32 KB, allowlist, symlinks e alterações alheias. O patch fica exclusivamente no worktree. `lao_result` expõe evidência persistida, hashes do output bruto e patch normalizado, diff, alterações e revisões.
- Uma normalização de formato aceita somente um `*** Add File` com corpo sem prefixos `+`, adicionando os prefixos do diff; outras saídas inválidas são rejeitadas. A aplicação não comprova testes ou critérios.
- Aprovação de escrita permanece bloqueada mesmo que `lao_review` alegue critérios verificados. O estado após sucesso é `awaiting_review`. Testes determinísticos, transporte MCP autenticado ponta a ponta e promoção dependem de novo gate.

Após `pnpm build`, com Ollama disponível, a prova real isolada pode ser repetida sem tocar no projeto original:
```cmd
cd /d D:\desenvolvimento\lao-devspace
set DEVSPACE_LAO_ENABLED=true&& node scripts/lao-write-live-smoke.mjs
```
O script cria repositório e worktree temporários, executa Granite de verdade, valida somente o arquivo permitido, reabre SQLite e descarta apenas sua própria área temporária.

## Atualizacao do fluxo de revisao (F4-11, 26/10/2026)

As observacoes de bloqueio de aprovacao acima descrevem as fases historicas.
Atualmente o fluxo isolado e:

1. Preparar e executar patch em worktree autorizado.
2. Executar validacao estatica e suite node:test isolada no Docker.
3. Avaliar os criterios declarativos e revisar manualmente o diff.
4. Somente se o operador decidir aprovar aquele patch especifico,
   iniciar a instancia da feature com dois opt-ins:
   DEVSPACE_LAO_ENABLED=true e LAO_WRITE_APPROVAL_ENABLED=true.
5. Chamar lao_write_approve com workspace_id, task_id, review_note e
   confirmation exatamente no formato APPROVE <task_id> <sha256>.
   O SHA-256 aparece no resultado lao_write_assess.

Sem o segundo opt-in a ferramenta nao existe no catalogo. A confirmacao
exigida pelo servidor e fornecida pelo host supervisor; nao e prova
criptografica de presenca humana, portanto requer procedimento humano
explicito de revisao. O modelo local nao recebe ferramentas MCP.
Aprovacao so muda o estado SQLite da tarefa. O patch **nao e aplicado
ao checkout original**, nao e promovido nem recebe commit/push/merge.
Nenhuma autorizacao de instalacao ou alteracao de servico e implicada.

## Promocao opcional para checkout feature (F4-12)

Uma tarefa de escrita JA aprovada pode ser promovida apenas com
LAO_WRITE_PROMOTION_ENABLED=true (separado dos flags de habilitacao
e aprovacao). A ferramenta lao_write_promote exige workspace_id,
task_id e confirmation exatamente PROMOTE <task_id> <sha256>.
O SHA-256 e o fingerprint do resultado lao_write_assess, nao o hash
do arquivo isolado. Verifique antecipadamente o diff e o checkout destino.

Na versao atual o limite e um unico arquivo por tarefa, branch feature/*
limpa e HEAD identico ao do patch isolado. A operacao torna o checkout
feature sujo intencionalmente; nao faz commit, push nem merge.
Backups e receipts ficam no stateDir/lao/promotion-backups e o ledger
da tarefa pode ser consultado com lao_result. Em queda de energia, nao
repetir a operacao: inspecionar arquivos de backup e o Git manualmente.
O fluxo nao altera o DevSpace main e nao esta pronto para uso em
repositorios de producao sem testes adicionais de recovery/concorrencia.

## Prova ponta a ponta de promocao (F4-13, repositorio descartavel)

O teste `src/lao/mcp-http-e2e.test.ts` possui modo **opt-in** que cria
um Git checkout `feature/*` temporario e executa: OAuth MCP -> Granite
local -> patch isolado -> Docker offline -> avaliacao declarativa ->
confirmacao de aprovacao -> promocao de um arquivo -> auditoria -> limpeza.

No CMD Windows, com Ollama/Docker ja em execucao, selecione uma imagem
**local** com Node, fixada pelo SHA-256 exato (nunca usar `latest`):

```cmd
cd /d D:\desenvolvimento\lao-devspace
set "LAO_MCP_LIVE=true"
set "LAO_MCP_PROMOTION_LIVE=true"
set "LAO_SANDBOX_NODE_IMAGE=<imagem-local>@sha256:<digest-confirmado>"
pnpm exec tsx --test src/lao/mcp-http-e2e.test.ts
```

O smoke recusa execucao sem ambos os flags de teste e um digest de imagem.
A confirmacao de aprovacao nesse fixture e **roteirizada**, nao equivale a
uma revisao humana operacional. Nenhum servico WinSW, autostart ou
instalador e ativado; o DevSpace original permanece intocado.
