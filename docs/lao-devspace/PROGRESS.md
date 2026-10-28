# LAO DevSpace — Progresso verificável

## Verificação MCP autenticada — 27/10/2026

O daemon standalone agora consulta `tools/list` no endpoint MCP local com um token OAuth dedicado. Ele usa `LAO_DEVSPACE_MCP_TOKEN_FILE` quando definido ou, no Windows, o arquivo autorizado em `%LOCALAPPDATA%\LAODevSpace\devspace-mcp-token.txt`. Um HTTP 200 só marca **Conectado** se a resposta MCP autenticada contém as ferramentas esperadas. Falha de autenticação, token ausente, resposta inesperada ou timeout mantém **Não verificado**. Duas conexões recusadas marcam **Offline**. O Monitor e o Dashboard mostram os três estados sem alterar o layout aprovado.

O lançador Windows aceita automaticamente `%LOCALAPPDATA%\LAODevSpace\devspace-mcp-token.txt` quando ele já existe; não cria nem copia credenciais. `node scripts/authorize-lao-devspace.mjs` prepara um cliente OAuth exclusivo e abre a página oficial do DevSpace, onde o operador aprova o acesso com sua senha. O script guarda tokens fora do repositório e o probe renova o acesso pelo endpoint OAuth local, persistindo a rotação do refresh token. A autorização inicial na instalação ativa foi concluída pelo operador.

Teste de integração passou contra um servidor DevSpace MCP real de teste, protegido por OAuth, além dos testes de estados e UI. A porta 7676 retorna HTTP 401 sem credencial; com a credencial OAuth autorizada, o probe real retorna **Conectado**. Portas 7676/7877/11434 estão ouvindo, Ollama `/api/version` e LAO `/health/live` retornaram 200, e não há serviços Windows Ollama/DevSpace/LAO instalados. Ollama usa um atalho na pasta Inicializar da conta; DevSpace é um processo Node sem serviço Windows identificado. Nenhum processo externo foi reiniciado.

Validação da primeira rodada: `pnpm typecheck` e `pnpm build` aprovados; `pnpm test`: **266 testes, 258 aprovados, 8 ignorados, 0 falhas**; verificador da versão fixa `1.0.8` aprovado. O smoke do probe sem credencial retornou **unverified**; depois, a conexão positiva, a rotação OAuth e a autorização interativa foram comprovadas contra o DevSpace ativo.

Validação adicional do provisionamento: **6 testes direcionados aprovados**, incluindo fluxo de autorização completo em servidor local de ensaio, probe autenticado, rotação real do refresh token pelo servidor DevSpace de teste e estados negativos. `pnpm typecheck` e `pnpm build` aprovados após essa alteração. A autorização interativa no DevSpace ativo foi concluída na página oficial pelo operador.

**Autorização real concluída:** o operador aprovou o cliente OAuth dedicado na página local do DevSpace. O script gravou a credencial renovável somente em `%LOCALAPPDATA%\LAODevSpace\devspace-mcp-token.txt`. O probe contra a instância MCP ativa retornou **connected**. Um daemon LAO temporário e isolado, usando o Ollama e o DevSpace reais, respondeu `ready=true`, `blockingReasons=[]`, `activeTasks=0`; ele foi encerrado. Após autorização operacional, somente o LAO foi reiniciado. O primeiro reinício revelou que o supervisor antigo não recarregava o caminho da credencial; o probe passou a localizá-la diretamente no Windows. Depois do segundo reinício, o daemon atual respondeu `ready=true`, `blockingReasons=[]`, `activeTasks=0`, `restartAvailable=true`. DevSpace (PID 8896) e Ollama (PID 36276) permaneceram ativos, sem reinício.

**Verificação final desta rodada:** 23 testes direcionados passaram, inclusive recuperação simulada no SCM; o teste adicional de descoberta da credencial passou (5 testes do probe ao todo). `pnpm typecheck`, `pnpm build`, `git diff --check` e verificador da base DevSpace `1.0.8` passaram.

**Regressao consolidada apos os controles de 27/10:** `pnpm test` executou inicialmente 269 testes (261 aprovados, 8 ignorados) e, apos lifecycle do servico + historico/notificacoes, **271 testes, 263 aprovados, 8 ignorados e 0 falhas**. `pnpm typecheck`, `pnpm build`, `git diff --check` e `node scripts/lao-verify-devspace-pin.mjs` tambem passaram. O daemon ativo respondeu `ready=true` sem bloqueios, o Ollama respondeu localmente e o MCP permaneceu protegido por OAuth.

**Recuperação gerenciada:** o Monitor agora reconsulta `/dashboard/api/status` autenticado após a confirmação, usa a contagem de todas as tarefas ativas (sem limite da página de 200), verifica as transições `Stopped` e `Running` no SCM, aguarda a dependência responder e persiste resultado sanitizado em `%LOCALAPPDATA%\LAODevSpace\recovery-history.jsonl`. O teste funcional usa serviços SCM simulados e não toca nos processos atuais. Sem serviço Windows explicitamente vinculado, os controles permanecem indisponíveis. A instalação de um gerenciador de ciclo de vida para Ollama/DevSpace ainda requer decisão operacional do usuário; não foi feita.

**Atualizado:** 27/10/2026 · **Branch:** `feature/lao-devspace` · **Worktree:** `D:\desenvolvimento\lao-devspace`

**Design:** popup da bandeja em seu estado de atenção **aprovado visualmente pelo usuário em 27/10**, a partir de captura real do Windows. Não alterar a interface sem novo pedido. Para lacunas operacionais e evidências históricas, consultar [STATUS_FUNCIONAL_20261027.md](STATUS_FUNCIONAL_20261027.md). O bloqueio P0 da conexão MCP não verificada foi resolvido na instalação ativa pelo probe OAuth autenticado.

**Controles solicitados em 27/10:** switch de inicialização automática por usuário, combo com modelos locais do Ollama e controles de reinício de dependências foram acrescentados mantendo a interface principal. Os dois comandos externos só podem ficar habilitados quando houver Windows Services gerenciados, atualmente ausentes nesta máquina. Ver [CONTROLES_INTERATIVOS_20261027.md](CONTROLES_INTERATIVOS_20261027.md).

Legenda: **[x]** concluído e testado no escopo declarado; **[~]** implementado parcialmente; **[ ]** pendente; **[!]** bloqueado. Nenhuma fase de produto é declarada concluída apenas por possuir arquivos ou testes unitários.

## Quadro de fases

| Fase | Estado | Situação comprovada |
|---|---|---|
| F0 Base segura | [x] | Branch/worktree separados; DevSpace base v1.0.8 fixado no commit `13c99ee` com lockfile imutavel, verificador `lao-verify-devspace-pin.mjs` e teste negativo de upgrade |
| F1 Núcleo LAO | [x] | Schemas, estados, SQLite, tarefas/runs/eventos, health e MCP opt-in; LAO OFF manteve tool surface e regressao DevSpace sem falhas |
| F2 Ollama | [x] | Granite real executou leitura pelo MCP HTTP OAuth de teste (2026-07-28), tarefa persistida e aguardando revisao; configuracao padrao preservada |
| F3 Escrita isolada | [x] | Granite real escreveu patch em worktree destacado via MCP HTTP OAuth de teste; integridade/sintaxe conferidas, checkout original intacto e aprovacao negada |
| F4 Avaliacao/revisao | [~] | OAuth MCP, Granite, Docker, aprovacao deterministica e promocao supervisionada de arquivo foram validados no mesmo E2E; resta apenas fechar a prova real de duas correcoes sucessivas do modelo |
| F5 Serviço e tray | [~] | Daemon, tray, autostart da conta e lifecycle WinSW explicito implementados; instalacao SCM/boot real e teste operacional em Windows limpo continuam pendentes |
| F6 Painel | [x] | Dashboard claro aprovado, OAuth MCP real, modelos locais, metricas CPU/RAM/GPU/VRAM, historico persistente sanitizado e smoke real 100/125/150% com F5/logout/mobile |
| F7 Release | [~] | Candidato standalone, integridade/assinatura externa e lifecycle reversivel preparados; falta executar WinSW autentico, instalacao/rollback e boot em Windows limpo antes do release final |
| F8 Multimodelo | [~] | Benchmark Ollama real 5x Granite vs Spark concluido; teste simples 2+2, simulacao de agente e failover pendentes |

## Requisitos funcionais (RF)

| Requisito | Estado | Implementação e evidência / pendência |
|---|---|---|
| RF-01 Opt-in | [x] | `src/lao/config.ts`, `mcp-tools.ts`, `src/server.ts`; ferramenta só exposta com `DEVSPACE_LAO_ENABLED=true`; OFF preserva tool surface |
| RF-02 Provedor/modelo | [x] | `/api/tags` e `/api/show` verificados no Ollama local; Granite executou inferência real por `/api/chat`, com resposta e modelo registrados |
| RF-03 Criar tarefa | [x] | `contracts.ts`, `task-store.ts`, `lao_delegate`; objetivo, workspace, critérios, permissões, orçamento, ID e persistência testados em read-only |
| RF-04 Escrita isolada | [x] | Worktree gerenciado e destacado, escrita bounded com allowlist 1-5 paths. Patch Granite real via OAuth MCP preservou checkout fonte |
| RF-05 Política de ferramentas | [x] | Modelo não recebe ferramentas; broker valida 1–5 caminhos explícitos, até 5 ações/32 KB, bloqueia symlinks/diff fora da allowlist e shell; testes autorizados executam somente no sandbox Docker fixado |
| RF-06 Executar agente | [x] | Granite real executou leitura e escrita supervisionadas via MCP autenticado em HTTP local, persistiu run e aguardou review; sem ferramentas no modelo |
| RF-07 Avaliar com provas | [x] | lao_write_assess vincula criterios declarativos a fingerprint/sintaxe e suite Docker real; promocao exige a mesma evidencia aprovada e revalidacao imediatamente antes da escrita |
| RF-08 Correcoes limitadas | [~] | lao_retry read-only e lao_write_retry para escrita, ambos com feedback explicito e maximo de 2 revisoes; teste Granite de duas correcoes pendente |
| RF-09 Aprovacao explicita | [x] | lao_review segue negando escrita; lao_write_approve separado exige confirmacao por task/run/fingerprint e evidencia Docker; promocao continua uma segunda acao explicita e auditada |
| RF-10 Persistência/reconsulta | [x] | `lao_result` lê SQLite com runs, eventos, revisões e artefatos persistidos; reabertura e recuperação de execuções interrompidas foram testadas sem retomada automática insegura |
| RF-11 Boot | [ ] | Não instalado |
| RF-12 Saúde | [~] | Health local, Ollama e probe MCP OAuth autenticado reais aprovados; falta somente o ciclo de vida do daemon como serviço Windows para fechar o requisito operacional |
| RF-13 Painel | [x] | Dashboard real no design aprovado, sessao autenticada, F5/logout, dados reais, mobile 390 px e renderizacao Chrome em 100/125/150% validados |
| RF-14 Recuperacao | [~] | SQLite lease impede dois daemons no mesmo stateDir, heartbeat/TTL/reclamacao apos crash testados; SCM e reinicio operacional pendentes |
| RF-15 Tray | [x] | Monitor Windows WinForms com icones/layout aprovados, mutex, polling assincrono, popup real e acoes seguras; linhas de dependencia nao abrem configuracoes e controles so habilitam quando seguros |
| RF-16 Autostart configurável | [x] | Switch por usuario habilita/desabilita somente os atalhos LAO na pasta Inicializar, reversivel e sem residuos; boot antes do login pertence separadamente ao RF-11/servico SCM |
| RF-17 Notificações | [x] | Tray opt-in notifica indisponibilidade, nova revisao, tarefa concluida/falha e pressao sustentada CPU/RAM/VRAM, usando apenas mensagens estaticas sanitizadas |
| RF-18 Dashboard/histórico | [x] | Painel consulta SQLite, filtros, runs, eventos, testes/diffs, revisao e metricas; alertas de recursos possuem JSONL persistente sanitizado e aparecem na secao Eventos |
| RF-19 Multimodelo | [~] | Benchmark sequencial 5x real com modelos locais, acertos e latencias documentados em BENCHMARK_20261026.md; prova de codigo pendente |
| RF-20 Failover | [ ] | Pendente |

**RF concluídos:** 14/20 - **Parciais:** 4/20 - **Pendentes:** 2/20.

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
servico Windows instalado. A rota `/dashboard` so e habilitada quando
`LAO_DASHBOARD_TOKEN` e informado explicitamente no processo do daemon.
Token: 32-256 caracteres ASCII imprimiveis; nunca impresso em logs ou URLs.

Recursos: login por Bearer, estado real das dependencias, contadores de tarefas
ativas/em revisao, historico das 200 tarefas mais recentes (ID, estado, modelo,
revisoes e data), atualizacao a cada 10 segundos, logout e layout responsivo.
Sem scripts remotos, sem CDN, sem capacidade de aprovar/editar/merge.

Seguranca: bind em loopback; valida Host, nega Origin/POST e query strings,
resposta CSP com nonce, frame deny, nosniff, no-store, token so em memoria,
comparacao timing-safe; dados sensiveis nao saem na API e valores exibidos por
textContent. API/painel seguem desligados sem token de operador.

Integracao feita somente nos modulos `src/lao`. Instanciacao do daemon em
foreground continua opt-in. Dashboard consome o banco indicado pelo daemon;
para visualizar tarefas MCP de outro processo, o caminho de estado deve ser
o mesmo e explicitamente configurado. Nao instalar no Windows automaticamente.

Evidencia: `src/lao/dashboard.test.ts` verifica opt-in, segredo invalido,
acesso negado, CSP, Host e Origin, metodos HTTP, sanitizacao e parser JavaScript.
Documentacao: `docs/lao-devspace/DASHBOARD_MVP.md`.

**Limites:** teste real em navegador nao comprovado; tray, servico SCM,
notificacoes e revisao visual continuam pendentes.

## F8-01 - Benchmark multimodelo basico (26/10/2026)

**Status [~]:** script local de comparacao sequencial, 5 repeticoes por modelo,
com limite de tokens e sem ativar failover. Granite e Spark tiveram 5/5
acertos no teste aritmetico trivial, com medianas de 4468 ms e 4716 ms
respectivamente. Cold starts de 20317 ms e 62014 ms. Estes dados nao validam
qualidade de codigo e nao autorizam alternar o modelo padrao. Evidencias e
ressalvas em `docs/lao-devspace/BENCHMARK_20261026.md`. Nenhum download.

## F2-07 - Transporte MCP autenticado em HTTP real (26/10/2026)

**Status [~]:** integracao testada no listener HTTP real do DevSpace
com OAuth/Bearer e transporte MCP moderno 2026-07-28. O teste
`src/lao/mcp-http-e2e.test.ts` inicia um servidor Ollama mock em loopback,
registra OAuth temporario e executa o fluxo autenticado:
tools/list -> open_workspace -> lao_delegate -> lao_result. Confirma
que a tarefa ficou awaiting_review, a execucao persistiu no SQLite,
o modelo mock nao recebeu definicoes de tools, e chamada sem token
retornou HTTP 401. Workspace falso negado.

**Distincao essencial:** autenticacao/roteamento real MCP foram
comprovados; o modelo nesta suite e simulado. Inferencia real Granite
foi validada separadamente em smoke anterior sem passagem por OAuth/MCP.
Ainda falta executar o caminho combinado (OAuth MCP + Granite real)
em um teste live opt-in antes de declarar F2 concluida.

## F2-08 / F3-04 - MCP OAuth HTTP + Granite real (26/10/2026)

**Conclusao das fases F2/F3 dentro do escopo de smoke autenticado local:**
`src/lao/mcp-http-e2e.test.ts` registra um cliente OAuth e bearer
temporarios no storage de teste, inicia o servidor DevSpace MCP HTTP real,
cria workspace Git feature temporario e executa:

1. `tools/list` autorizado e negacao HTTP 401 sem token.
2. `open_workspace` com root autorizado, sem acesso a workspace falso.
3. `lao_delegate` com Granite real, status `awaiting_review`;
   `lao_result` comprova run `completed` persistido.
4. `lao_write_prepare` cria worktree destacado com allowlist restrita.
5. `lao_write_run` usa o Granite real para produzir patch proposto, com
   execucao pelo broker em worktree separado. Resultado `awaiting_review`.
6. `lao_write_validate` reavalia fingerprints, escopo e sintaxe:
   `staticChecksPassed=true`.
7. `lao_review` rejeita a aprovacao prematura da escrita; a fonte Git
   permanece limpa e nao possui o arquivo inserido no worktree.

Teste de CI usa Ollama fake no mesmo HTTP/OAuth real para reproducibilidade.
O modo manual `LAO_MCP_LIVE=true` substitui somente o modelo fake por
`granite4.2-8b:gpu` local; a rodada live foi aprovada. Nao houve merge,
push do patch, instalacao de servicos ou alteracao do DevSpace original.

**Limitacao:** a prova usa OAuth temporario na maquina, NAO login real de
ChatGPT no conector de producao. A validacao de testes de suite completos e
criterios de aceite continua na F4, sem aprovacao de escrita.

## F5-01 - Tray Windows opt-in (26/10/2026)

**Status [~]:** `src/lao/windows/lao-tray.ps1` implementa monitor
manual Windows PowerShell 5.1/STA/WinForms, com os arquivos ICO aprovados,
mutex por SID (uma instancia por conta), health em loopback a cada 15s,
icone e tooltip conforme status real, menu Abrir painel, Copiar diagnostico
sanitizado e Sair do monitor sem encerrar o daemon. Uma sessao com daemon
indisponivel nao e confundida com status pronto.

Parser PowerShell, carregar todos os ICO e modo `-CheckOnly` passaram
no Windows com politica de execucao apenas no processo e sem mostrar GUI.
Teste `src/lao/windows-tray.test.ts` aprovou no Windows. Integracao
visual GUI manual, notificacoes, autostart, servico Windows SCM,
instalacao/desinstalacao e rollback continuam pendentes. Nenhuma
configuracao de boot/registro/servico foi alterada.

Manual: `docs/lao-devspace/TRAY_MVP.md`.

## Regressoes consolidadas apos F2/F3/F5/F6/F8 - 26/10/2026

`pnpm test`: **223 testes, 215 aprovados, 8 ignorados, 0 falhas**.
`pnpm typecheck`: aprovado. `pnpm build`: aprovado.
`node scripts/lao-verify-devspace-pin.mjs`: aprovado, DevSpace base v1.0.8
fixado sem alterar dependencias do upstream.
Teste live adicional de OAuth/MCP HTTP e Granite read-only + write:
aprovado em fixture descartavel, sem alterar o checkout.
`LAO_DASHBOARD_TOKEN` nao configurado por padrao.
Nenhum servico SCM/autostart/boot, instalador ou tray interativo iniciado.
CI Windows do novo HEAD requer validacao apos push.

## F4-08 - Avaliacao de criterios declarativos (26/10/2026)

**Status [~]:** nova ferramenta `lao_write_assess`, somente leitura,
com revalidacao da integridade atual antes de relatar os criterios de aceite.
`src/lao/write-acceptance.ts` aceita **apenas** os formatos exatos:

- `static: integrity`: corresponde ao verificador de HEAD, fingerprint,
  allowlist, whitespace e sintaxe do patch atual.
- `node:test tests/example.test.mjs`: corresponde a um teste baseline
  rastreado e executado no container isolado. Precisa ser a ultima tentativa
  daquele arquivo, mesmo task/run, fingerprint identico, exit 0,
  `passed=true`, logs com SHA-256 e imagem Docker fixada por digest.

Cada criterio retorna passed, failed ou unverified, com motivo claro.
Criterios de linguagem natural ou nomes de teste sem provas adequadas
continuam `unverified`. Uma execucao falhada posteriormente invalida
sucesso anterior do mesmo teste; prova de outra tarefa/run ou de patch
adulterado e rejeitada.

**Importante:** mesmo quando `allCriteriaVerified=true` nas regras
declarativas, `humanReviewRequired=true`, `approvalAllowed=false`,
`promotionAllowed=false`. Este endpoint nao grava decisao, nao aprova,
nao comita e nao modifica worktree/checkout. Ele **nao** substitui a
revisao humana de objetivos de negocio. Gate de aprovacao e promocao
continuam pendentes para a F4.

Teste unitario e integracao MCP com criterio natural nao-verificado
foram acrescentados e aprovados.

## F5-02 - Exclusao mutua real do daemon por SQLite (26/10/2026)

**Status [~]:** tabela `lao_daemon_lease` no banco independente do LAO,
com token opaco, TTL de 45s e heartbeat de 15s. Duas instancias do
daemon apontadas ao MESMO stateDir nao podem iniciar, mesmo com portas
diferentes. Ao fechar, o dono libera a lease; apos queda abrupta a lease
expira para que novo processo autorizado assuma. Worker antigo nao
consegue renovar ou retirar a lease de outro dono. Perda de lease
encerra o listener de health ao proximo heartbeat.

Teste de duas instancias com portas diferentes, concorrencia de SQLite,
expiracao, token invalido e abertura apos encerramento: aprovado.
Daemon permanece foreground/opt-in; sem servico Windows SCM,
autostart ou alteracoes de credenciais ou instalacao do sistema.

## F4-09 - Correcoes de escrita supervisionadas (26/10/2026)

**Status [~]:** ferramenta MCP `lao_write_retry` acrescentada ao
modo de escrita isolada. Somente task em `needs_revision` com revisao
explicita do supervisor e saldo no orcamento pode ser reexecutada.
Mantem o mesmo worktree gerenciado, modelo, criterio e lista exata
de paths, nao oferece shell ao modelo e insere feedback da revisao
no prompt. Gera novo run e evidencia de patch; exige nova revisao.
Limite de **2 correcoes** imposto pelo task-store e pelo handler.
Nao existe repeticao automatica, merge, commit ou push do patch.

Teste MCP com worktree Git temporario simulou dois patches Update File
sequenciais; checou novos runs e fingerprints, checkout origem intocado,
terceira tentativa rejeitada e ausencia de autoaprovacao.
O banco agora impede transicao de revisao durante lease ativa de
suite isolada para evitar escrever enquanto testes ainda executam.
**Pendente:** teste com Granite real de duas correcoes e metrica de
qualidade; orquestracao de aprovacao/promocao continua bloqueada.

**Hardening F4-09:** uma nova correcao agora confirma HEAD e
contentFingerprint exatos da evidencia mais recente ANTES de consultar
o modelo. Se usuario/processo alterar mesmo um caminho permitido depois
da revisao, a operacao falha fechada, preserva needs_revision e nao
executa o modelo. Teste de adulteracao + restauracao do patch aprovado.

## F4-10 - Integracao MCP OAuth + Granite real + Docker + aceite (26/10/2026)

**Status [x] do smoke de integracao, F4 ainda [~].** Em fixture Git
temporaria e descartavel, o teste `mcp-http-e2e.test.ts` executou:

- OAuth/Bearer no listener HTTP MCP real, autenticacao obrigatoria.
- `lao_write_prepare` em feature checkout e worktree destacado.
- `lao_write_run` com o Granite real, produzindo `src/fixture.ts`
  sem alterar o checkout de origem.
- `lao_write_validate` passou no patch atual.
- `lao_write_test` executou `tests/fixture.test.mjs` REAL em Docker
  Linux existente, imagem local fixada por digest, sem rede e read-only.
- `lao_write_assess` marcou os criterios **declarativos**
  `static: integrity` e `node:test tests/fixture.test.mjs` como
  verificados, com task/run/fingerprint coincidentes.
- `approvalAllowed=false` e `promotionAllowed=false`, e o
  `lao_review approved` foi rejeitado. Nenhum commit/merge no checkout.
- No CI, o mesmo teste usa Ollama simulado e ignora etapa Docker se
  `LAO_SANDBOX_NODE_IMAGE` nao estiver explicitamente configurada.

**Regressao da entrega anterior ao ultimo ajuste do fixture:**
`pnpm test` 230 testes, 222 aprovados, 8 ignorados, zero falhas.
Typecheck e build passaram. O E2E com Docker e Granite real foi
reexecutado e passou apos ajuste do prompt/fixture de teste.

**Gate nao concluido:** validacao semantica universal de criterios
de negocio, aprovacao auditada e promocao segura, SCM Windows, GUI tray
interativa, instalador/rollback e release candidate.

## F7-02 - Preparacao de release candidate sem instalacao (26/10/2026)

**Status [~]:** criado `src/lao/release-package.mjs`, capaz de montar um
diretorio novo de release candidate a partir da compilacao local existente,
sem executar instalacao, copiar dependencias, criar servico, alterar registro,
habilitar boot ou publicar artefatos. Sao incluidos o launcher, o nucleo
compilado LAO, lockfile e manifest de versao fixa, documentos de operacao e
icones do tray. O manifest registra SHA-256 e tamanho de todos os arquivos
copiados, `serviceInstalled=false` e `autostartEnabled=false`.
Testes confirmaram copia em pasta temporaria, 35 arquivos, hashes corretos,
ausencia de node_modules e bloqueio de sobrescrita do pacote.

**F7 nao concluida:** o pacote e somente um estagio auditavel; falta
instalador real, bootstrap de dependencias offline confiavel, assinatura,
SCM Windows, permissao explicita para instalar, backup, desinstalacao e
rollback, alem de testes em maquina limpa.

**Validacao da retomada:** `pnpm test` executou 231 casos: 223 aprovados,
8 ignorados e 0 falhas; `pnpm typecheck`, `pnpm build` e
`node scripts/lao-verify-devspace-pin.mjs` passaram. O verificador
confirmou DevSpace 1.0.8 no commit fixo `13c99eec5ed43eb9aba3fdc457bd912d3ce82211`.
O staging continua nao instalavel: nenhum teste de maquina limpa foi
executado e nenhuma alteracao de servico/boot foi realizada.

## F6-02 / F7-03 - Detalhes protegidos e integridade de pacote (26/10/2026)

**F6 segue [~]:** dashboard recebeu filtros de tarefas e consulta autenticada
por UUID que retorna historico de estados, execucoes, suites isoladas,
fingerprints/resumos de alteracao e resultado de revisao. Nao retorna
prompts, codigo de patches, notas de revisao, outputs do modelo ou segredos.
O navegador usa exclusivamente textContent. Testes especificos de API,
privacidade, rejeicao de acesso indevido e sintaxe do script passaram.

**F7 segue [~]:** src/lao/release-verify.mjs verifica o staging sem gravar
arquivos ou instalar componentes: versao-base 1.0.8, manifesto, lista estrita,
SHA-256, tamanhos, arquivos extras/ausentes, links simbolicos e paths
inseguros. O script tambem passa a integrar o staging como arquivo auditavel.
Testes validaram pacote intacto e negaram corrupcao, arquivos extras,
exclusao de arquivo e path traversal. **Manifesto sem assinatura nao
autentica a origem contra adulteracao coordenada**; instalador, cadeia de
confianca, dependencias offline e teste em maquina limpa continuam pendentes.

**Regressao desta rodada F6-02/F7-03:** pnpm test executou **233 testes,
225 aprovados, 8 ignorados, zero falhas**; pnpm typecheck, pnpm build,
verificador de pin e git diff --check aprovados. Testes de navegador GUI,
instalador e maquina limpa nao executados.

## F4-11 - Aprovacao auditada sem promocao (26/10/2026)

**Status F4 [~]:** aprovacao de escrita isolada pode ser registrada pela
ferramenta MCP lao_write_approve, **desativada por padrao** e exposta
somente com DEVSPACE_LAO_ENABLED=true e LAO_WRITE_APPROVAL_ENABLED=true.
Requer confirmacao especifica por taskId + SHA-256 e nota do supervisor.
O handler revalida HEAD, hash, escopo, whitespace, sintaxe e criterios
declarativos, incluindo ao menos uma suite node:test isolada verde do run.

Uma lease SQLite por tarefa impede concorrencia com suites ou revisoes
durante a checagem. A transicao approved e o registro da decisao sao
atomicos, vinculados ao run/fingerprint; o lao_review antigo continua
recusando aprovacoes de escrita sem esse fluxo.
Teste com worktree e SQLite reais verificou recusa de confirmacao errada,
adulteracao posterior, lease invalida e prova insuficiente; aprovacao
positiva preservou a origem sem modificacoes.

**Limite:** confirmacao fornecida pelo host MCP nao e autenticacao
humana independente. O operador precisa revisar o diff deliberadamente.
Aprovacao nao significa promocao: sem copia, commit, push ou merge
automatico. Revalidacao na promocao ainda e obrigatoria e pendente.

**Regressao apos F4-11:** pnpm test: **234 testes, 226 aprovados,
8 ignorados, zero falhas**. Typecheck e verificador da versao fixa
1.0.8 aprovados. Build de producao executado na mesma rodada.

## F4-12 - Promocao supervisonada de um arquivo (26/10/2026)

**F4 permanece [~]**: disponibilizada ferramenta MCP lao_write_promote
somente com opt-in adicional LAO_WRITE_PROMOTION_ENABLED=true. Exige tarefa
ja aprovada, worktree gerenciado e intacto, revisao vinculada ao run
e fingerprint SHA-256, origem em branch feature/* com HEAD identico ao
worktree, checkout original limpo e confirmacao exata PROMOTE <task> <sha>.
Somente **um arquivo autorizado por tarefa** pode ser aplicado ao checkout
feature: suporta adicao, modificacao e exclusao. Nao atua em main.

Antes de alterar, a rotina grava backup de conteudo original, copia do
conteudo aprovado e recibo no stateDir/lao/promotion-backups. Ledger
SQLite marca operacao pending antes da escrita e applied apos checagem.
Uma tentativa perdida por crash nao e repetida automaticamente: requer
inspecao humana e recuperacao usando o backup. Nao executa commit,
push nem merge. A API lao_result expoe status do recibo, sem caminho
privado de backup.

Testes com Git/SQLite reais provaram update, add e delete, recusa por
confirmacao errada, origem suja e adulteracao do worktree, nao alteracao
do HEAD/commit da origem e bloqueio de repeticao. Avaliacao de testes
Docker neste teste e uma evidencia simulada persistida; integracao real
OAuth+Granite+Docker existe em F4-10 mas ainda nao foi combinada com
promocao no mesmo E2E. Promocao multiplos arquivos, recuperacao
assistida e controle de edicoes externas concorrentes ainda pendentes.

## F7-04 / F5-03 - Runtime offline e plano de servico (26/10/2026)

**F7 permanece [~]:** o gerador release-portable.mjs empacota
bibliotecas fixadas (better-sqlite3, bindings, file-uri-to-path, zod),
todos os SHA-256 e dados de ABI/plataforma. Sem npm/pnpm install nem rede.
Teste carregou SQLite nativo na pasta publicada, sem node_modules fonte.
Manifesto continua sem assinatura independente e nao inclui Node.

**F5 permanece [~]:** o script lao-service-plan.ps1 prepara um XML
WinSW somente com wrapper informado e validado por SHA-256 exato.
Testa pacote, arquitetura, ABI e SQLite antes de criar pasta nova.
O XML e manual; nada foi instalado, iniciado, registrado ou adicionado
ao boot. O teste Windows usou um binario FAKE so para verificar
geracao de plano e rejeicao de SHA incorreto, nao um WinSW genuino.

**Restam:** VM limpa, conta Windows nao privilegiada, wrapper real,
testes SCM, Node runtime empacotado, instalador, autenticidade
criptografica externa, desinstalacao e rollback. Ver PORTABLE_RELEASE.md.

**Verificacao desta retomada:** regressao completa executou 236 testes,
228 aprovados, 8 ignorados, zero falhas; pnpm build, pnpm typecheck e
verificador da versao fixa DevSpace 1.0.8 passaram. A checagem adicional
de sintaxe PowerShell do plano de servico tambem passou em teste isolado.
Nao foi feita instalacao de servico, boot nem promocao em projetos reais.

## F5-04 / F7-05 - CI Windows do plano de servico (26/10/2026)

**F5 e F7 permanecem [~].** A consulta ao GitHub Actions confirmou que a
execucao `40438264282` no commit `cf0a856` **falhou**, apesar da regressao
local verde: o teste do pacote portavel nao encontrou o cmdlet `Get-FileHash`
na sessao PowerShell do Windows runner. Typecheck, build, pin DevSpace e
instalacao de dependencias congeladas no CI passaram antes da falha.

O plano de servico offline passou a calcular SHA-256 do wrapper WinSW
diretamente pela API criptografica .NET, sem depender do cmdlet opcional.
Continua exigindo hash exato e recusando wrapper adulterado, e permanece
um **gerador de plano**, sem instalacao SCM, boot, registro ou credenciais.
O teste especifico de pacote portavel e geracao de plano passou localmente
(4/4), assim como o gate DevSpace 1.0.8, typecheck, build e a regressao
completa (`pnpm test`: **237 casos, 229 aprovados, 8 ignorados, 0 falhas**).
**CI Windows hospedada confirmada verde:** run `40440299950` no commit
`531adab` concluiu com `success`, incluindo o teste anteriormente quebrado.

## F4-13 - Fluxo real com aprovacao e promocao no mesmo E2E (26/10/2026)

**Smoke de integracao [x] em repositorio DESCARTAVEL; F4 segue [~].**
O teste opt-in `src/lao/mcp-http-e2e.test.ts` foi ampliado para exercitar
MCP HTTP com OAuth/Bearer, Granite 4.2 real via Ollama local, patch gerado
em worktree gerenciado, verificacao estatica, node:test real em Docker
offline fixado por SHA-256, criterios declarativos, confirmacao de
aprovacao por run/fingerprint, promocao supervisionada de um unico arquivo
e consulta posterior ao ledger. Cada operacao passa pela API MCP real.

O fixture foi criado numa branch feature temporaria, **fora do LAO e do
DevSpace original**, e foi eliminado ao fim do teste. Foram comprovadas
recusa de aprovacao/promocao com confirmacao incorreta, origem limpa
antes da promocao, arquivo promovido sem commit nem merge, retencao de
backup e recusa de repetir a operacao. Saida final:
`MCP + real Granite + offline Docker + scripted review + single-file promotion: passed`.

O supervisor neste teste e **simulado por roteiro deterministico** e nao
constitui aprovacao humana operacional. O teste local nao prova recuperacao
apos corte de energia, edicoes externas concorrentes durante rename, WinSW,
instalador ou seguranca de producao. A suite normal nao habilita os flags
de aprovacao e promocao e o smoke isolado exige opt-in explicito.
**Validacao desta rodada:** smoke live opt-in 1/1, regressao completa
`pnpm test` 237 testes (229 aprovados, 8 ignorados, 0 falhas),
`pnpm typecheck`, `pnpm build` e gate DevSpace 1.0.8 aprovados.
CI hospedada das novas alteracoes F4-13 ainda depende do push.

## F5-05 - Privilegios minimos e parada no plano WinSW (26/10/2026)

**F5 permanece [~].** O XML gerado pelo plano offline passa a especificar
`NT AUTHORITY\LocalService` em vez de usar o default perigoso `LocalSystem`
do WinSW. Adicionado `stoptimeout=30sec` para parada graciosa do Node;
o recibo declara conta e tempo de parada. O teste de staging verifica
o XML/JSON, ausencia de senha e que nenhuma instalacao/boot foi alterado.
O gerador nao muda ACL, registro, servicos nem autostart. Uma futura
instalacao exigira ACL explicita do estado para LocalService, wrapper WinSW
genuino/versionado, teste SCM em ambiente descartavel e autorizacao
operacional separada. Nao ha evidencia de stop real pelo Windows SCM.
Testes direcionados Windows de release e plano: 4/4 aprovados;
`pnpm typecheck` e pin da base verificados. O pacote permanece sem
instalador e sem validacao WinSW genuina.

## F7-06 - Autenticidade de release destacada (26/10/2026)

**F7 permanece [~].** Criados `release-auth-sign.mjs` e
`release-auth-verify.mjs`: ferramentas offline que assinam o manifesto
verificado com Ed25519 e conferem assinatura e integridade usando chave
publica **externa e previamente confiavel**. Chave privada, chave publica
e assinatura ficam fora do candidato; nenhuma chave real e versionada.
Nao requer download, instalacao, boot ou mudanca no DevSpace original.

O teste `release-auth.test.ts` gerou uma chave efemera e aprovou o
fluxo positivo, recusando sobrescrita, assinatura interna, chave publica
incorreta, assinatura adulterada, manifesto modificado e arquivo
adulterado: **1/1 aprovado**. A etapa de autenticidade e ainda opcional;
um instalador futuro devera exigi-la com chave publica distribuida por
canal confiavel. **Pendencias F7:** runtime Node integrado, instalador,
politica de chaves, assinatura Windows e validacao em maquina limpa.
**Regressao desta entrega:** `pnpm test`: **238 casos, 230 aprovados,
8 ignorados, 0 falhas**; `pnpm typecheck`, `pnpm build`, verificador
de pin DevSpace 1.0.8 e `git diff --check` aprovados. CI da nova entrega
precisa ser conferida apos o push.

## F6-03 - Diagnostico autenticado de CPU/RAM/GPU/VRAM (26/10/2026)

**F6 permanece [~].** O dashboard local inclui agora um card de recursos
que consulta `GET /dashboard/api/metrics` sob o Bearer existente:
amostragem de CPU (sem inventar carga no primeiro ponto), RAM, memoria
do proprio daemon, GPU NVIDIA e VRAM. GPU ausente/NVML indisponivel
retorna `null`; nunca zero enganoso. A chamada `nvidia-smi` e fixa,
sem shell, sem comandos de modelo, timeout de 1,5 s e ambiente restrito.

Testes de calculo CPU, parser GPU, ausencia de GPU e API HTTP autenticada
passaram; tokens e detalhes privados nao sao devolvidos. Uma consulta
real `nvidia-smi` no Windows local confirmou numeros de GPU/VRAM;
o card nao recebeu teste de interacao em navegador real.
**Pendentes F6:** alertas/notificacoes, integracao visual com bandeja,
diagnostico do modelo, testes GUI e UX de longa duracao.
**Regressao desta entrega F6:** `pnpm test` 241 testes (233 aprovados,
8 ignorados, zero falhas), `pnpm typecheck`, `pnpm build`,
`lao-verify-devspace-pin.mjs` e `git diff --check` aprovados.
O teste real do monitor confirmou leituras de GPU NVIDIA e VRAM via
NVML no Windows local; CI hospedada precisa ser confirmada apos push.

## F5-06 - Monitor Windows: tarefas autenticadas e notificacoes (27/10/2026)

**F5 permanece [~]**. O tray PowerShell/WinForms existente agora interpreta
as consultas de /health/live, /health/ready e (somente quando houver
LAO_DASHBOARD_TOKEN no ambiente) /dashboard/api/tasks. A API privada
usa Bearer no loopback, impede seguir redirects e nao retorna tokens,
prompts ou conteudo de tarefas ao monitor. A bandeja distingue
operacional, degradado, indisponivel e aguardando revisao.

O menu de leitura indica contagem de execucoes e revisoes. Sem
autenticacao, exibe contagens desconhecidas, nao zeros falsos.
A nova flag opt-in -EnableNotifications emite alertas locais apenas
apos uma mudanca detectada (perda do daemon/aumento de revisoes).
A flag -ProbeOnly permite aferir status sanitizado sem iniciar GUI.
Nenhuma chamada de start/stop, SCM, boot ou configuracao global foi feita.

Quatro testes Windows do tray passaram, incluindo status com Bearer
verdadeiro/falso, falha de daemon, validacao de assets/STA e rejeicao
de redirect que poderia vazar segredo. Regressao completa LOCAL
com 245 testes: 237 aprovados, 8 ignorados, zero falhas;
o total inclui um teste F8 ainda nao versionado na mesma worktree.
Build, typecheck e pin fixo da versao 1.0.8 tambem passaram.
**Teste GUI interativo, alerta
visual, painel com controle
de servico e autostart ainda pendentes.** Este modulo nao esta pronto
para instalacao final.

GitHub Actions da ultima entrega publicada, F6-03 commit f222657:
run 40443284011 concluiu com success. Os resultados deste F5-06
dependem da regressao e do CI apos o push correspondente.

## F8-02 - Benchmark funcional de programacao (27/10/2026)

**F8 permanece [~].** Preparado o roteiro experimental opt-in
lao-coding-benchmark-live.mjs para comparar, sequencialmente, Granite
e Spark em duas tarefas de JavaScript identicas, com criterios
deterministicos. O candidato textual fica em pasta temporaria
descartavel e so executa dentro de Docker sem rede, read-only,
com imagem local pinada por SHA-256, memoria/CPU/PIDs limitados.
Um container com nome exclusivo e removido forcadamente ate no
timeout da CLI. O parser do candidato e bounded e tem teste.

**Nao foram produzidas metricas comparativas nesta etapa:**
Ollama em 127.0.0.1:11434 nao respondeu na verificacao real,
embora o Docker Linux Engine estivesse online. Nao iniciar o Ollama
ou trocar o modelo automaticamente. O estudo simples nao valida
multi-arquivos, taxas de sucesso de agentes MCP nem failover.
Ver BENCHMARK_CODING.md para procedimento de reproducao.

## F5-07 - Monitor responsivo durante falhas de rede (27/10/2026)

**F5 continua parcial.** O monitor manual na bandeja deixou de fazer
chamadas Invoke-RestMethod **sincronas no timer WinForms**. A nova
maquina de estados dirige chamadas HttpClient assincronas em etapas
health/live, health/ready e API autenticada de tarefas (quando ativa).
Timeout por etapa, sem requests concorrentes; atualizacao da UI
continua restrita ao thread STA. Na saida cancela e descarta clientes.

Testes Windows direcionados passaram (6/6), incluindo:
sondagem assincrona com atraso de 1250 ms, comprovando seis ou mais
eventos do timer durante a espera; contagens autenticadas; exclusao
de token em redirecionamento; daemon indisponivel e parser/ativos.
A flag -AsyncProbeOnly valida a mesma logica sem abrir icone.
**Ainda faltam:** testes GUI manuais de icone/menus/baloes,
integracao com servico Windows real, inicializacao apos login e
instalador/rollback. Nenhum componente SCM, tarefa agendada ou
autostart foi alterado nesta entrega.

## F6-04 - Alertas locais de pressao de memoria/CPU (27/10/2026)

**F6 continua parcial.** O endpoint ja autenticado
`/dashboard/api/metrics` agora acrescenta alertas orientativos de
pressao: RAM >=90%, VRAM >=90% ou CPU >=95%. Sao exigidas 3 amostras
consecutivas com intervalo minimo de 8 segundos; chamadas repetidas
rapidamente nao fabricam alertas. Uma leitura abaixo do limite limpa
o estado, e interrupcao maior que 60 segundos reinicia a contagem.
CPU desconhecida e GPU indisponivel nao viram falso zero.

O navegador mostra os avisos no card de recursos usando exclusivamente
`textContent` e mensagens estaticas, sem HTML injetavel, dados brutos
de processos ou tokens. A API marca `advisoryOnly=true`, sem comando
automatico para desligar, iniciar ou alterar sistemas externos.
Testes de subida, manutencao, limpeza, amostras invalidas, intervalo
minimo, API autenticada e sintaxe do script de dashboard foram aprovados.

**Pendencias F6:** teste interativo visual com o browser do usuario,
notificacoes de recurso na bandeja, preferencias configuraveis e
historico persistente de alertas.

**Validacao consolidada F5-07 e F6-04:** `pnpm test` no Windows local:
**251 testes, 243 aprovados, 8 ignorados, zero falhas**.
`pnpm build`, `pnpm typecheck`, verificacao DevSpace v1.0.8
e `git diff --check`: todos aprovados. O CI remoto devera
ser conferido apos o push.

## F7-07 - Runtime Node offline no candidato Windows (27/10/2026)

**F7 continua parcial; nenhum instalador foi executado.** Criado
`release-standalone.mjs`, staging Windows de candidato autonomo com
`node.exe` fornecido explicitamente pelo operador e preso a hash
SHA-256 exato. O projeto preserva o candidato portavel sem Node
como alternativa. O novo tipo `lao-devspace-standalone-candidate`
inclui o executavel no manifesto, com metadados de versao, ABI,
arquitetura e digest. O verificador nega binario alterado, extras,
metadata incoerente e runtime inexistente, sem executar scripts
do candidato recebido.

O fluxo de staging verifica o binario ANTES de criar pasta de release;
entao monta dependencias nativas de versao fixa, copia runtime,
revalida hashes e executa um smoke de SQLite a partir do
`runtime/node.exe` copiado, sem npm/pnpm install, downloads ou rede.
A assinatura Ed25519 destacada permanece exigencia futura para
distribuicao confiavel; SHA-256 de binario sozinho nao prova origem.

**Pendencias F7:** cadeia de confianca e assinatura Windows do Node,
WinSW genuino/versionado, instalador, desinstalacao/rollback, prova
com conta LocalService, verificacao autentica do originador do release,
VM Windows limpa e testes SCM/boot. O DevSpace 1.0.8 permanece fixo.

**Validacao F7-07:** regressao completa no Windows local: **252 testes,
244 aprovados, 8 ignorados, 0 falhas**. O teste Windows do standalone
executou o Node copiado e carregou SQLite nativo do pacote;
assinatura Ed25519 externa foi aceita somente com chave independente,
adulteracao de Node e metadados foi recusada, e o plano manual WinSW
aceitou somente `runtime/node.exe` embutido, negando Node externo.
Nenhum servico Windows foi instalado ou iniciado pelo roteiro.

## F5-08 e F6-05 - Design visual de referencia implementado (27/10/2026)

**Prioridade solicitada pelo usuario:** entregar a interface aprovada
ANTES de voltar a instalador, servico e novas funcionalidades do
orquestrador. Implementado em duas superfícies:

1. **Tray nativo WinForms**: popup 420 DIP, branco, Segoe UI, logo
   original, cantos arredondados, quatro estados contextuais,
   oito linhas de componente/uso, tarefa/revisao e quatro acoes.
   Clique esquerdo alterna popup; Esc/clique fora fecham;
   links abrem secoes especificas do dashboard. Acoes SCM nao
   implementadas ficam desabilitadas e nao reiniciam processos.
   Faz sondagem assincrona autenticada de status/metricas/tarefas
   sem expor token. `-UiCheckOnly` testou dimensoes, transicoes de
   cor e revisao com controles nativos sem janela visivel.
2. **Dashboard**: substituida interface escura anterior pelo design
   claro referenciado em `dashboard-panel.png`, com sidebar de
   5 secoes, 4 cards de dependencias, CPU/RAM/GPU/VRAM, tarefas,
   modelo configurado, eventos sanitizados e configuracoes.
   Logo aprovado servido localmente com CSP. Nao exibimos nomes de
   tarefas inventados nem confundimos modelo configurado com loaded.

**Prova de renderizacao real:** teste com Chrome headless autenticado
em 100%, 125% e 150%, screenshot do painel branco e inspecao DOM de
5 secoes, 4 cards e logo, sem overflow em viewport de 390px;
arquivos apenas em TEMP do usuario,
nao no checkout Git. Popup WinForms renderizado em janela offscreen
e inspecionado lado a lado com a hierarquia da referencia.
Pacote portavel inclui novo script nativo do popup.

**Nao marcar como aceite final ainda:** testes manuais de interacao
com o icone, ancora em barra Windows movida/multiplos monitores,
legibilidade DPI real do Windows 11, rolamento em telas pequenas e
avaliacao do usuario. Nao instalar service, nao habilitar autostart.

## F5-09 / F7-08 - Lifecycle reversivel do servico Windows (27/10/2026)

Foi acrescentado `lao-service-lifecycle.ps1`. O comando padrao e
`Action Validate` e nao altera SCM, ACL, boot ou processos. Ele revalida
hash do wrapper/configuracao, integridade do release, conta LocalService,
variaveis do daemon e modo de inicio antes de permitir qualquer mutacao.

O plano WinSW agora pode declarar `Manual` ou `Automatic`; inicio atrasado
so e aceito com `Automatic`. Um plano automatico exige ainda a confirmacao
explicita `-ConfirmAutomaticStart` no momento da instalacao. O lifecycle
possui acoes separadas de `Install` e `Uninstall`, exige administrador,
faz backup de `lao.sqlite*`/preferencia de modelo, concede apenas `Modify`
ao SID LocalService no stateDir e preserva o estado na desinstalacao.
Falha durante a instalacao tenta remover o servico e restaurar a ACL
anterior. `-StartAfterInstall` exige `/health/live` antes de declarar
sucesso. O historico de operacoes fica em ProgramData, sem tokens.

**Limite desta etapa:** os testes exercitam geracao de planos manual e
Automatic+Delayed, hashes e `Action Validate`, alem da sintaxe do script.
Nenhuma chamada real `WinSW install/start/stop/uninstall` foi executada
nesta maquina. F5/F7 so podem fechar apos teste com WinSW autentico em
Windows descartavel/limpo, incluindo reboot e rollback.

## F5-10 / F6-06 - Historico e notificacoes operacionais (27/10/2026)

Os alertas sustentados de CPU/RAM/VRAM agora possuem historico JSONL
sanitizado e limitado dentro do stateDir do LAO. So sao persistidas
transicoes com timestamp e nomes fixos de alertas; nao entram prompts,
tokens, nomes de processos, caminhos ou conteudo das tarefas. Recuperacao
para estado normal tambem e registrada. O Dashboard reutiliza a secao
existente de Eventos para exibir essas transicoes junto aos eventos de
tarefas, sem adicionar cards nem alterar o layout aprovado.

O Monitor passa a notificar, quando o opt-in de notificacoes estiver
habilitado, novas revisoes, indisponibilidade do daemon, pressao confirmada
de recursos, tarefas concluidas e tarefas com falha. As notificacoes de
tarefa usam somente contagem/estado e orientam abrir o painel; nunca exibem
objetivo, prompt, saida ou diff. O estado anterior e mantido em memoria para
nao repetir o mesmo aviso a cada sondagem.

**QA visual real:** uma instancia temporaria do daemon em porta isolada
passou o smoke do Dashboard com Chrome real em escalas 100%, 125% e 150%:
5 secoes, 4 cards, largura movel de 390 px, F5 mantendo sessao, logout,
17 assets locais, 22 modelos no combo e nenhum token em URL/output. O
daemon de QA e seu stateDir temporario foram encerrados/removidos ao fim.
