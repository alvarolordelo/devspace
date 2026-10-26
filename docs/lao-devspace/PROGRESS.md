# LAO DevSpace — Progresso verificável

**Atualizado:** 25/10/2026 · **Branch:** `feature/lao-devspace` · **Worktree:** `D:\desenvolvimento\lao-devspace`

Legenda: **[x]** concluído e testado no escopo declarado; **[~]** implementado parcialmente; **[ ]** pendente; **[!]** bloqueado. Nenhuma fase de produto é declarada concluída apenas por possuir arquivos ou testes unitários.

## Quadro de fases

| Fase | Estado | Situação comprovada |
|---|---|---|
| F0 Base segura | [x] | Branch e worktree separados, commits no fork, baseline e rollback documentados |
| F1 Núcleo LAO | [~] | Contratos, feature flag OFF, SQLite, tarefas, execuções, eventos, estados, health e MCP opt-in |
| F2 Ollama | [~] | Modelos reais e Granite validado em inferência read-only com persistência e reabertura SQLite; transporte MCP com modelo real ainda não verificado |
| F3 Escrita isolada | [~] | Guarda de worktree gerenciado e broker interno de patch com arquivos permitidos, diff e sem shell; delegação via modelo/MCP ainda pendente |
| F4 Avaliação/revisão | [~] | Revisão explícita e `lao_retry` com até duas correções supervisionadas e feedback registrado; diff de worktree disponível, mas testes determinísticos e promoção pendentes |
| F5 Serviço e tray | [~] | Daemon experimental em primeiro plano, health local, recovery e CLI validados; serviço SCM, tray e autostart pendentes |
| F6 Painel | [ ] | Assets e layouts aprovados; painel funcional, notificações e histórico UI pendentes |
| F7 Release | [~] | CI Windows expôs alias `RUNNER~1` diferente de `runneradmin` no TEMP; testes ajustados para realpath assíncrono e novo run pendente; instalador e release pendentes |
| F8 Multimodelo | [ ] | Benchmark de Granite vs Spark com cinco repetições e failover pendentes |

## Requisitos funcionais (RF)

| Requisito | Estado | Implementação e evidência / pendência |
|---|---|---|
| RF-01 Opt-in | [x] | `src/lao/config.ts`, `mcp-tools.ts`, `src/server.ts`; ferramenta só exposta com `DEVSPACE_LAO_ENABLED=true`; OFF preserva tool surface |
| RF-02 Provedor/modelo | [x] | `/api/tags` e `/api/show` verificados no Ollama local; Granite executou inferência real por `/api/chat`, com resposta e modelo registrados |
| RF-03 Criar tarefa | [x] | `contracts.ts`, `task-store.ts`, `lao_delegate`; objetivo, workspace, critérios, permissões, orçamento, ID e persistência testados em read-only |
| RF-04 Escrita isolada | [~] | `write-boundary.ts` e `worktree-patch.ts` aplicam patch real apenas em worktree detached gerenciado e caminhos autorizados; criação do worktree por tarefa/MCP pendente |
| RF-05 Política de ferramentas | [~] | Guardas para leitura seletiva e para patch de até 5 ações em arquivos explicitamente listados, shell negado; broker de comandos/execução do modelo pendente |
| RF-06 Executar agente | [~] | `task-runner.ts`: execução real Granite somente-leitura (resultado persistido e reaberto); ferramentas supervisionadas e execução MCP real pendentes |
| RF-07 Avaliar com provas | [~] | Resposta entra em `awaiting_review` e revisão exige evidências; `review-evidence.ts` coleta diff real em worktree; faltam testes automatizados e critérios ponta a ponta |
| RF-08 Correções limitadas | [~] | `lao_retry` reexecuta tarefa read-only somente após `needs_revision`, com feedback e limite de 2 correções; orquestração automática de correções de escrita pendente |
| RF-09 Aprovação explícita | [~] | `lao_review` registra decisão; aprovações de tarefas com escrita são bloqueadas até existir pipeline determinístico completo |
| RF-10 Persistência/reconsulta | [~] | `lao_result` lê SQLite de tarefas/execuções/eventos/revisões, testes de reabertura e interrupção; recuperação automática no boot pendente |
| RF-11 Boot | [ ] | Não instalado |
| RF-12 Saúde | [~] | `monitor-status.ts`, `health.ts`, `lao_status`, daemon experimental testado; faltam probe MCP autenticado e serviço Windows |
| RF-13 Painel | [~] | Health endpoints locais opt-in; visual real pendente |
| RF-14 Recuperação | [ ] | Recuperação startup validada e porta duplicada rejeitada; SCM e single-instance robusto pendentes |
| RF-15 Tray | [ ] | Ícones aprovados, tray pendente |
| RF-16 Autostart configurável | [ ] | Pendente |
| RF-17 Notificações | [ ] | Pendente |
| RF-18 Dashboard/histórico | [ ] | Persistência de execuções existente; dashboard pendente |
| RF-19 Multimodelo | [ ] | Benchmark 5x pendente |
| RF-20 Failover | [ ] | Pendente |

**RF concluídos:** 3/20 · **Parciais:** 9/20 · **Pendentes:** 8/20.

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
| F2-06 | `read-context.ts`, `task-runner.ts`, `mcp-source-context.test.ts` | Leitura real de fontes escolhidas no workspace, limite 3 x 4 kB, hashes SHA-256 persistidos; geração do modelo simulada | `6743d4f` |
| F7-00 | `.github/workflows/lao-feature-ci.yml` | Matriz Windows com LAO OFF, typecheck, build e testes; YAML verificado localmente, workflow remoto ainda não executado | `1487448` |
| F5-00 | `daemon.ts`, `daemon-main.ts`, `bin/devspace-laod.js` | Health loopback, recovery, porta ocupada e smoke real do CLI compilado; **não instalado no Windows** | `206cfa4` |
| F3-02 | `worktree-patch.ts`, `contracts.ts`, testes | Patch real em Git worktree temporário, allowlist por arquivo, limites, bloqueios de traversal e diff após patch; checkout-fonte permaneceu limpo; **não exposto ao modelo/MCP** | `5a0e4f1` |
| F3-01 | `write-boundary.ts` e teste | Root de worktree, canonical path, managed/detached e shell negado | `30c2b2c` |
| F4-02 | `review-evidence.ts`, `task-store.ts`, testes | Git diff, untracked, whitespace e HEAD coletados em worktree temporário; não declara testes/verificação e bloqueia aprovação de escrita | `3e65541` |
| F2-03 | Granite real, `scripts/lao-live-smoke.mjs` | `/api/chat` real, `think: false`, tarefa `4b1d9a53-d1df-456e-93f3-821c8158ea1a`, estado `awaiting_review`, run `completed`, SQLite reaberto, hash SHA-256 e seis eventos; 2.027 ms. Sem MCP real ou critérios aprovados. | Evidência local 25/10/2026 |
| F7-01 | Testes Windows em GitHub Actions | Runs `40252484850`, `40254006895` e `40254263498`: 3 falhas; log isolou TEMP `RUNNER~1` vs `runneradmin`; `realpathSync` mantém alias, corrigido com `await realpath()` como resolução de produção. | Nova execução remota pendente |
| F4-03 | `lao_retry`, `task-runner.ts` e testes | Correção pelo supervisor com nota/evidência no novo prompt, até 2 reexecuções, workspace autorizado e estado exigido; saída sempre em revisão; 1 teste de integração MCP simulado adicionado. | Aguardando CI |

**Baseline original:** 160 testes, 153 aprovados, 7 ignorados; `pnpm build` e `pnpm typecheck` verdes.

**Testes do LAO (rodada atual):** 64 casos, 63 aprovados, 1 ignorado (symlink sem privilégio), 0 falhas. Regressão completa: **214 testes, 206 aprovados, 8 ignorados, 0 falhas**. TypeScript e build aprovados localmente. Nova execução GitHub Actions Windows pendente após correção do alias de TEMP.

## Limitações importantes

- Não foi criada uma autorização geral de escrita, shell ou execução de comandos via agente local.
- `lao_delegate` recebe apenas fontes explicitamente indicadas pelo host em `source_files` (até 3 arquivos de 4 kB). Não explora o repositório automaticamente e não habilita ferramentas de modelo.
- O modelo local nunca recebe definições de ferramentas nessa fase e nunca aprova sua própria resposta.
- Registros de revisão são atos do host autenticado; a promoção de patches exigirá controle mais rigoroso e evidências determinísticas.
- O daemon experimental é manual e opt-in. **Não** há serviço Windows SCM, tray nem autostart instalados.
- Sem merge em `main`, sem serviços Windows, sem alterações no boot, sem execução em produção.

**Próximos gates:** executar delegação real via transporte MCP da feature, implementar broker limitado, worktree por tarefa e evidências determinísticas; confirmar CI hospedada; depois serviço Windows e tray, sujeitos a testes e autorização operacional.
