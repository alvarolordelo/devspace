# LAO DevSpace — Progresso verificável

**Data:** 25/10/2026 · **Branch:** `feature/lao-devspace` · **Worktree:** `D:\desenvolvimento\lao-devspace`

Legenda: **[x]** concluído e testado no escopo declarado; **[~]** implementado parcialmente; **[ ]** pendente; **[!]** bloqueado. Nenhuma fase de produto é declarada concluída apenas por possuir arquivos ou testes unitários.

## Quadro de fases

| Fase | Estado | Situação comprovada |
|---|---|---|
| F0 Base segura | [x] | Branch e worktree separados, commits no fork, baseline e rollback documentados |
| F1 Núcleo LAO | [~] | Contratos, feature flag OFF, SQLite, tarefas, execuções, eventos, estados, health e MCP opt-in |
| F2 Ollama | [~] | Listagem real de modelos e inspeção Granite; execução read-only mockada, inferência real não validada |
| F3 Escrita isolada | [~] | Guarda explícita de worktree gerenciado/desanexado; execução de patches por agente pendente |
| F4 Avaliação/revisão | [~] | Revisões explícitas e limite de duas correções; ainda sem validação determinística de testes e diff |
| F5 Serviço e tray | [ ] | Serviço Windows, autostart e tray pendentes; instalação exige autorização explícita |
| F6 Painel | [ ] | Assets e layouts aprovados; painel funcional, notificações e histórico UI pendentes |
| F7 Release | [ ] | Instalação reversível, validações Windows, CI, rollback e release candidate pendentes |
| F8 Multimodelo | [ ] | Benchmark de Granite vs Spark com cinco repetições e failover pendentes |

## Requisitos funcionais (RF)

| Requisito | Estado | Implementação e evidência / pendência |
|---|---|---|
| RF-01 Opt-in | [x] | `src/lao/config.ts`, `mcp-tools.ts`, `src/server.ts`; ferramenta só exposta com `DEVSPACE_LAO_ENABLED=true`; OFF preserva tool surface |
| RF-02 Provedor/modelo | [~] | `ollama-client.ts`, descoberta via `/api/tags`, `/api/show`, seleção por `lao_delegate`; falta execução real validada |
| RF-03 Criar tarefa | [x] | `contracts.ts`, `task-store.ts`, `lao_delegate`; objetivo, workspace, critérios, permissões, orçamento, ID e persistência testados em read-only |
| RF-04 Escrita isolada | [~] | `write-boundary.ts` valida worktree gerenciado, detached e containment; patch real ainda não ligado |
| RF-05 Política de ferramentas | [~] | Guardas de workspace e shell proibido no fluxo read-only; allowlist/broker real pendente |
| RF-06 Executar agente | [~] | `task-runner.ts`: execução de chat sem tools, deadline, cancelamento, resultado e erros SQL; execução real com Granite pendente |
| RF-07 Avaliar com provas | [~] | Resposta entra em `awaiting_review`; não é aprovação; faltam testes/diff determinísticos |
| RF-08 Correções limitadas | [~] | Estado `needs_revision`, máximo 2; repetição automática limitada pendente |
| RF-09 Aprovação explícita | [~] | `lao_review`, decisão e evidência persistidas; promoção segura de patches não implementada |
| RF-10 Persistência/reconsulta | [~] | `lao_result` lê SQLite de tarefas/execuções/eventos/revisões, testes de reabertura e interrupção; recuperação automática no boot pendente |
| RF-11 Boot | [ ] | Não instalado |
| RF-12 Saúde | [~] | `monitor-status.ts`, `health.ts` e `lao_status`; faltam probes autenticados e daemon real |
| RF-13 Painel | [~] | Health endpoints locais opt-in; visual real pendente |
| RF-14 Recuperação | [ ] | Serviço/single instance pendentes |
| RF-15 Tray | [ ] | Ícones aprovados, tray pendente |
| RF-16 Autostart configurável | [ ] | Pendente |
| RF-17 Notificações | [ ] | Pendente |
| RF-18 Dashboard/histórico | [ ] | Persistência de execuções existente; dashboard pendente |
| RF-19 Multimodelo | [ ] | Benchmark 5x pendente |
| RF-20 Failover | [ ] | Pendente |

**RF concluídos:** 2/20 · **Parciais:** 10/20 · **Pendentes:** 8/20.

## Histórico técnico e evidências

| ID | Arquivos | Testes/evidências | Commit |
|---|---|---|---|
| F0-01 | Git worktree, design assets e roadmap | `git worktree list`, `git status`, commits no fork, `main` preservada | `3cca46b` |
| F1-00 | `monitor-status.ts`, teste | 10 testes de estado de serviço, dependências, TTL e revisão | `0f31c0b` |
| F1-01 | `contracts.ts`, `task-state.ts` | Schemas e transições ilegais rejeitados | `869ed4c` |
| F1-02 | `config.ts` | OFF por padrão e URL Ollama restrita a loopback | `869ed4c` |
| F1-03 | `task-store.ts` | Tarefa, revisão, eventos, SQLite isolado e recuperação | `869ed4c` |
| F1-04 | `health.ts`, `health-server.ts` | Tests de saúde local, indisponível e opt-in | `fc6fee5` |
| F2-01 | `ollama-client.ts` | Discovery, capabilities, chat simulado sem tools, timeout e abort | `fc6fee5` |
| F1-05 | `mcp-tools.ts`, `src/server.ts` | Registro das ferramentas somente no modo ON | `fc6fee5` |
| F2-02 | Ollama local | GET `/api/tags` HTTP 200 e `/api/show` Granite tools confirmado | Verificação real |
| F1-06/F2-04 | `task-runner.ts`, `task-store.ts`, testes | Execução simulada com status, traces, persistência, timeout, cancelamento e revisão | `5a9b913` |
| F2-05 | `mcp-tools.ts`, `mcp-delegation.test.ts` | Delegate, result, review, workspace negado, no auto-approval | `5a9b913` |
| F3-01 | `write-boundary.ts` e teste | Root de worktree, canonical path, managed/detached e shell negado | `30c2b2c` |
| F2-03 | Modelo Granite local | Inferência **não validada**: ferramenta bloqueou chamada real por configuração de segurança; NÃO atribuir sucesso | [!] |

**Baseline original:** 160 testes, 153 aprovados, 7 ignorados; `pnpm build` e `pnpm typecheck` verdes.

**Testes do LAO (última rodada específica):** 50 aprovados, 0 falhas. Suite completa após as últimas alterações: **200 testes, 193 aprovados, 7 ignorados e 0 falhas**. **TypeScript e build aprovados**.

## Limitações importantes

- Não foi criada uma autorização geral de escrita, shell ou execução de comandos via agente local.
- `lao_delegate` não lê arquivos automaticamente: ele analisa apenas o objetivo e os critérios explicitamente enviados pelo host. Não atribuir a ele inspeção real do workspace.
- O modelo local nunca recebe definições de ferramentas nessa fase e nunca aprova sua própria resposta.
- Registros de revisão são atos do host autenticado; a promoção de patches exigirá controle mais rigoroso e evidências determinísticas.
- O servidor LAO de saúde é código opt-in, **não** um serviço Windows instalado.
- Sem merge em `main`, sem serviços Windows, sem alterações no boot, sem execução em produção.

**Próximos gates:** concluir a validação full suite/build; executar leitura real com Granite quando permitido; integrar broker de ferramentas limitado, worktree por tarefa e verificador de diff/testes; depois serviço Windows e tray com aprovação do usuário.
