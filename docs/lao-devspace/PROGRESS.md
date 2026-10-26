# LAO DevSpace — Progresso verificável

**Atualizado:** 26/10/2026 · **Branch:** `feature/lao-devspace` · **Worktree:** `D:\desenvolvimento\lao-devspace`

Legenda: **[x]** concluído e testado no escopo declarado; **[~]** implementado parcialmente; **[ ]** pendente; **[!]** bloqueado. Nenhuma fase de produto é declarada concluída apenas por possuir arquivos ou testes unitários.

## Quadro de fases

| Fase | Estado | Situação comprovada |
|---|---|---|
| F0 Base segura | [x] | Branch/worktree separados; DevSpace base v1.0.8 fixado no commit `13c99ee` com lockfile imutavel, verificador `lao-verify-devspace-pin.mjs` e teste negativo de upgrade |
| F1 Núcleo LAO | [~] | Contratos, feature flag OFF, SQLite, tarefas, execuções, eventos, estados, health e MCP opt-in |
| F2 Ollama | [~] | Granite executado via runner e handler `lao_delegate` real, com reabertura SQLite; canal MCP autenticado de ponta a ponta ainda não verificado |
| F3 Escrita isolada | [~] | `lao_write_prepare` cria worktree gerenciado de feature autorizada; `lao_write_run` recebe patch do modelo real sem tools e aplica pelo broker com allowlist, hashes e diff persistido; transporte MCP autenticado e suites completas do projeto ainda pendentes; gate estatico de patches disponivel |
| F4 Avaliação/revisão | [~] | `lao_result` inclui diff persistido; `lao_write_validate` revalida SHA-256, HEAD, allowlist, whitespace e sintaxe TS/JS/JSON sem executar codigo; smoke Docker real validado; aceite, suites completas e MCP autenticado pendentes; aprovacao de escrita bloqueada |
| F5 Serviço e tray | [~] | Daemon experimental em primeiro plano, health local, recovery e CLI validados; serviço SCM, tray e autostart pendentes |
| F6 Painel | [~] | MVP HTTP local do dashboard, autenticação Bearer por token forte, status Ollama/DevSpace e histórico de tarefas; tray, notificações e controles pendentes |
| F7 Release | [~] | CI Windows anterior validado; adicionado gate de versao fixa ANTES de instalar dependencias e `pnpm install --frozen-lockfile`; CI Windows run `40260097979` aprovada com gate da base antes do install; instalador e rollback pendentes |
| F8 Multimodelo | [~] | Benchmark Ollama real 5x Granite vs Spark concluido; teste simples 2+2, simulacao de agente e failover pendentes |

## Requisitos funcionais (RF)

| Requisito | Estado | Implementação e evidência / pendência |
|---|---|---|
| RF-01 Opt-in | [x] | `src/lao/config.ts`, `mcp-tools.ts`, `src/server.ts`; ferramenta só exposta com `DEVSPACE_LAO_ENABLED=true`; OFF preserva tool surface |
| RF-02 Provedor/modelo | [x] | `/api/tags` e `/api/show` verificados no Ollama local; Granite executou inferência real por `/api/chat`, com resposta e modelo registrados |
| RF-03 Criar tarefa | [x] | `contracts.ts`, `task-store.ts`, `lao_delegate`; objetivo, workspace, critérios, permissões, orçamento, ID e persistência testados em read-only |
| RF-04 Escrita isolada | [~] | Criação real de worktree por tarefa via DevSpace com checkout `feature/*` limpo; modelo propõe patch e broker aplica apenas caminhos permitidos, sem alterar checkout fonte; falta ciclo completo de testes/aprovação |
| RF-05 Política de ferramentas | [~] | Modelo não recebe ferramentas; broker valida 1–5 caminhos explícitos, até 5 ações/32 KB, bloqueia symlinks e diff pré-existente fora da allowlist; shell e comandos do modelo negados, execução de testes autorizados pendente |
| RF-06 Executar agente | [~] | Granite real aplicou `src/lao-smoke.ts` em Git worktree temporário, com tarefa persistida, tempo medido, estado `awaiting_review` e nenhuma escrita no repo de origem; transporte MCP autenticado e verificações completas pendentes |
| RF-07 Avaliar com provas | [~] | `lao_result` recupera patch, hashes SHA-256, diff, arquivos, whitespace e eventos; `testsVerified=false`, `criteriaVerified=false`; verificacao estatica disponivel, mas suites de testes reais e aceite continuam pendentes |
| RF-08 Correções limitadas | [~] | `lao_retry` reexecuta tarefa read-only somente após `needs_revision`, com feedback e limite de 2 correções; orquestração automática de correções de escrita pendente |
| RF-09 Aprovação explícita | [~] | Teste MCP confirmou que `lao_review` rejeita aprovação de escrita mesmo quando critérios são alegados verdadeiros; pipeline determinístico e promoção mediante aprovação ainda pendentes |
| RF-10 Persistência/reconsulta | [~] | `lao_result` lê SQLite com runs, eventos, revisões e artefatos de escrita persistidos; reabertura testada; recuperação autônoma de tarefas no boot pendente |
| RF-11 Boot | [ ] | Não instalado |
| RF-12 Saúde | [~] | `monitor-status.ts`, `health.ts`, `lao_status`, daemon experimental testado; faltam probe MCP autenticado e serviço Windows |
| RF-13 Painel | [~] | Health endpoints locais opt-in; visual real pendente |
| RF-14 Recuperação | [ ] | Recuperação startup validada e porta duplicada rejeitada; SCM e single-instance robusto pendentes |
| RF-15 Tray | [ ] | Ícones aprovados, tray pendente |
| RF-16 Autostart configurável | [ ] | Pendente |
| RF-17 Notificações | [ ] | Pendente |
| RF-18 Dashboard/histórico | [~] | Painel local consulta o SQLite e apresenta tarefas/estados com atualização a cada 10s; filtros, detalhes e histórico visual ampliado pendentes |
| RF-19 Multimodelo | [~] | Benchmark sequencial 5x real com modelos locais, acertos e latencias documentados em BENCHMARK_20261026.md; prova de codigo pendente |
| RF-20 Failover | [ ] | Pendente |

**RF concluídos:** 3/20 - **Parciais:** 11/20 - **Pendentes:** 6/20.

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
| F7-01 | Testes Windows em GitHub Actions | Runs anteriores falharam por alias de TEMP `RUNNER~1` vs `runneradmin`; fixtures normalizadas via `await realpath()`. Run `40254905076` hospedado no Windows: **success**, todas as etapas aprovadas. | `cf0962d` (correção); run `40254905076` |
| F0-02 | `DEVSPACE_VERSION_PIN.json`, `lao-verify-devspace-pin.mjs`, teste e workflow | Travamento DevSpace v1.0.8 / `13c99ee`: fonte-base, package.json, pnpm lock e workspace, core server restrito a integracao LAO; testes negativos para versao, dependencias, lock e core; CI executa preflight antes do install. | CI Windows run `40260097979` aprovada |
| F4-03 | `lao_retry`, `task-runner.ts` e testes | Duas correções máximas com autorização e feedback; teste MCP simulado aprovado e handler real com Granite: tarefa `3ffdd197-a77c-4832-bfc3-c585ac3b0f09`, duas execuções `completed`, revisão obrigatória; **não comprova transporte autenticado**. | `38bc634`; CI `40254905076` |
| F3-03 | `write-task-runner.ts`, `mcp-tools.ts`, `task-store.ts` e broker | Teste MCP com Git worktree real (simulou modelo), rejeição de paths, origem `main`, patch malicioso, alterações prévias e autoaprovação; reabertura de evidências; teste real Granite em repo temporário: tarefa `8ef03dca-9e2a-4ec6-b544-4be6fc19244a`, 2.356 ms, conteúdo correto, origem intacta; formatação de Add File normalizada com hashes separados. | Commit e CI desta rodada |

| F4-04 | `write-validation.ts`, `review-evidence.ts`, `lao_write_validate` e testes | Valida hash completo do diff e de arquivos nao rastreados, HEAD, escopo, whitespace e sintaxe TS/JS/JSON; adulteracao posterior e sintaxe invalida reprovam; testsExecuted/criteriaVerified continuam false, sem shell. | Testado localmente 26/10, commit desta rodada |

**Baseline original:** 160 testes, 153 aprovados, 7 ignorados; `pnpm build` e `pnpm typecheck` verdes.

**Testes do LAO (rodada atual):** 66 casos, 65 aprovados, 1 ignorado (symlink sem privilégio), 0 falhas. Regressão completa: **216 testes, 208 aprovados, 8 ignorados, 0 falhas**. TypeScript e build aprovados localmente. CI Windows `40260097979` aprovada no commit `e18ddd4`; CI do novo gate F4-04 ainda pendente de publicacao/verificacao.

## Limitações importantes

- A escrita experimental exige `lao_write_prepare` no checkout `feature/*` limpo e `lao_write_run` com caminhos explícitos. A única operação de escrita disponível ao modelo é um patch textual mediado pelo broker em worktree separado. Não há shell/model tools.
- `lao_delegate` recebe apenas fontes explicitamente indicadas pelo host em `source_files` (até 3 arquivos de 4 kB). Não explora o repositório automaticamente e não habilita ferramentas de modelo.
- O modelo local nunca recebe definições de ferramentas; gera texto que passa por normalização restrita e validação de patch; nunca aprova sua própria resposta.
- Registros de revisão são atos do host autenticado; a promoção de patches exigirá controle mais rigoroso e evidências determinísticas.
- O daemon experimental é manual e opt-in. **Não** há serviço Windows SCM, tray nem autostart instalados.
- Sem merge em `main`, sem serviços Windows, sem alterações no boot, sem execução em produção.

**Proximos gates:** validar transporte MCP autenticado da feature, implementar executor de suites de testes autorizadas e isoladas e verificar criterios de aceite; aprovacao de escrita permanece bloqueada. Servico Windows e tray dependem de autorizacao operacional.


## Atualizacao F4-05 - 26/10/2026

**Status:** [~] executor de suite isolada preparado; criterio de saida da F4 NAO concluido.

- Criado `src/lao/write-test-sandbox.ts`: apenas scripts `node:test` explicitos,
  rastreados no HEAD e inalterados, dentro de container Docker de rede desativada,
  imagem SHA-256 fixa presente localmente e filesystem/worktree somente leitura.
- Nova ferramenta opt-in `lao_write_test` exige worktree, task e run corretos e
  a imagem administrativa `LAO_SANDBOX_NODE_IMAGE`. Nao aceita comando do modelo.
- Evidencias de suites em `lao_write_test_evidence`, reconsultadas em
  `lao_result`; logs guardados somente via SHA-256, sem conteudo bruto.
- Fingerprint do patch revalidado antes e apos o teste; falha de suite,
  daemon indisponivel e adulteracao nunca autorizam aprovacao.
- Testes locais de politica e simulacao de invocacao do container aprovados;
  armazenamento de evidencia comprovado por reabertura SQLite.
- **Bloqueio operacional:** Docker Desktop Linux Engine nao estava ativo
  (npipe do Docker inexistente). Nenhum servico foi iniciado ou instalado.
  Portanto, suite Docker real, isolamento em execucao e teste MCP autenticado
  ainda NAO estao verificados.
- A regra de reprovacao de escrita no `lao_review` permanece intacta.
- Documentacao de seguranca: `docs/lao-devspace/SANDBOX_TEST_EXECUTION.md`.
- Ollama local respondeu HTTP 200 na API /api/tags, modelo Granite instalado;
  smoke read-only real completou com persistencia e awaiting_review
  (task `8bb6f9b1-ba6e-4182-8813-6b1d2ebf516f`, 23853 ms), sem MCP real.
- GitHub Actions run `40324744189` (commit 6f199e1): Windows LAO regression
  **success**; a nova rodada F4-05 requer CI apos push.

**Proximos gates:** teste real do Docker em ambiente aprovado, suites TypeScript
em isolamento, criterios de aceite deterministas, MCP autenticado, regressao
Windows e autorizacao explicita para revisao/promocao. A F4 continua parcial.

**Verificacao de regressao nesta rodada (antes do ajuste final de host Docker local):**
`pnpm test`: **217 testes, 209 aprovados, 8 ignorados, 0 falhas**;
`pnpm typecheck`, `pnpm build`, verificacao da versao fixa e
teste direcionado do runner apos o ajuste: **aprovados**.
O pipeline de CI da nova branch devera validar novamente o conjunto completo.

## F4-06 - Execucao Docker real (26/10/2026)

**Status:** [x] smoke real da suite em container; **F4 segue [~]**.
Docker Desktop Linux Engine estava disponivel na verificacao subsequente. Foi usada
uma imagem Node existente e local, fixada por SHA-256, sem pull nem alteracao da
imagem. O script opt-in `src/lao/lao-sandbox-live-smoke.mjs` criou um repositorio
Git e worktree **temporarios**, executou Node `--test` em container isolado e removeu
os arquivos temporarios ao encerrar.

Resultados comprovados: suite positiva, leitura da alteracao no worktree,
proibicao de escrita no bind mount, rede externa indisponivel, suite que falha
bloqueada, digest inexistente sem pull, cancelamento, checkout de origem limpo
e `criteriaVerified=false` / `approvalAllowed=false`.

**Ainda pendentes:** autenticacao MCP ponta a ponta, mapeamento verificavel de
criterios de aceite, suites completas TypeScript, robustez de concorrencia,
recuperacao e gate para aprovacao de escrita. Nao concluir F4 prematuramente.

## F4-07 - Exclusao mutua em testes Docker (26/10/2026)

**Status:** [x] lock de execucao supervisionada por tarefa implementado em SQLite;
**F4 permanece [~]** devido a validacao de aceite e MCP autenticado pendentes.

- A nova tabela `lao_write_test_leases` impede a execucao simultanea de
  suites na mesma tarefa mesmo quando varios processos MCP usam o mesmo DB.
- O handler `lao_write_test` adquire uma lease antes da execucao do sandbox
  e a libera em `finally` tanto em sucesso quanto em erro.
- A lease usa token opaco de instancia; worker antigo nao pode apagar lease nova
  nem registrar evidencia com token vencido/trocado.
- Uma lease vencida (TTL padrao 180 segundos) pode ser assumida por novo processo,
  sem reexecutar automaticamente trabalhos interrompidos.
- Testes exercitam duas conexoes SQLite, exclusao mutua, recuperacao apos
  expiracao, token invalido e proibicao de persistencia apos liberar o lock.
- Aprovacao de escrita ainda proibida, mesmo apos suite com exit code zero.

**Verificacao desta entrega:** `pnpm typecheck` aprovado, `pnpm build`
aprovado e regressao `pnpm test` com **218 testes: 210 aprovados,
8 ignorados, 0 falhas**. Integracao live com Docker aprovada na F4-06.
CI hospedada do commit F4-07 ainda precisa ser confirmada apos push.

## F6-01 - Painel local MVP (26/10/2026)

**Status [~]:** implementado um painel HTTP local, de consulta, sem tray nem
servico Windows instalado. A rota \`/dashboard\` so e habilitada quando
\`LAO_DASHBOARD_TOKEN\` e informado explicitamente no processo do daemon.
Token: 32-256 caracteres ASCII imprimiveis; nunca impresso em logs ou URLs.

Recursos: login por Bearer, estado real das dependencias, contadores de tarefas
ativas/em revisao, historico das 200 tarefas mais recentes (ID, estado, modelo,
revisoes e data), atualizacao a cada 10 segundos, logout e layout responsivo.
Sem scripts remotos, sem CDN, sem capacidade de aprovar/editar/merge.

Seguranca: bind em loopback; valida Host, nega Origin/POST e query strings,
resposta CSP com nonce, frame deny, nosniff, no-store, token so em memoria,
comparacao timing-safe; dados sensiveis nao saem na API e valores exibidos por
textContent. API/painel seguem desligados sem token de operador.

Integracao feita somente nos modulos \`src/lao\`. Instanciacao do daemon em
foreground continua opt-in. Dashboard consome o banco indicado pelo daemon;
para visualizar tarefas MCP de outro processo, o caminho de estado deve ser
o mesmo e explicitamente configurado. Nao instalar no Windows automaticamente.

Evidencia: \`src/lao/dashboard.test.ts\` verifica opt-in, segredo invalido,
acesso negado, CSP, Host e Origin, metodos HTTP, sanitizacao e parser JavaScript.
Documentacao: \`docs/lao-devspace/DASHBOARD_MVP.md\`.

**Limites:** teste real em navegador nao comprovado; tray, servico SCM,
notificacoes e revisao visual continuam pendentes.

## F8-01 - Benchmark multimodelo basico (26/10/2026)

**Status [~]:** script local de comparacao sequencial, 5 repeticoes por modelo,
com limite de tokens e sem ativar failover. Granite e Spark tiveram 5/5
acertos no teste aritmetico trivial, com medianas de 4468 ms e 4716 ms
respectivamente. Cold starts de 20317 ms e 62014 ms. Estes dados nao validam
qualidade de codigo e nao autorizam alternar o modelo padrao. Evidencias e
ressalvas em \`docs/lao-devspace/BENCHMARK_20261026.md\`. Nenhum download.
