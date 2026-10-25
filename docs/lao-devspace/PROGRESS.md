# LAO DevSpace — Progresso (25/10/2026)

Legenda: [x] validado; [~] em desenvolvimento; [ ] pendente; [!] bloqueado.

## Fases
- [x] F0 — worktree e branch feature isolados; baseline registrado.
- [~] F1 — contratos, estados, feature flag OFF e SQLite independente; integracao MCP pendente.
- [~] F2 — adapter Ollama com discovery e API de chat somente leitura; inferencia real pendente.
- [ ] F3 — delegacao de ferramentas em worktree por tarefa.
- [~] F4 — guarda basica de revisao explicita; testes/diff e supervisor pendentes.
- [ ] F5 — servico Windows e tray (instalacao depende de aprovacao).
- [ ] F6 — painel e historico.
- [ ] F7 — release, testes Windows, instalador e rollback.
- [ ] F8 — comparacao Granite/Spark e failover.

## Requisitos funcionais
- [~] RF-01 — configuracao LAO desativada por padrao; gate MCP de status/modelos pronto; falta delegacao.
- [~] RF-02 — lista e capacidade de ferramentas Ollama; falta selecao via host.
- [~] RF-03 — contratos de task e persistencia; falta endpoint MCP.
- [ ] RF-04 — escrita isolada por worktree.
- [ ] RF-05 — autorizacao e politica de ferramentas.
- [ ] RF-06 — ciclo do agente com orcamento real.
- [~] RF-07 — guarda `criteriaVerified`; falta validacao deterministica.
- [~] RF-08 — limite de revisoes no store; falta loop real.
- [~] RF-09 — metodo de decisao explicita; falta integracao supervisor.
- [~] RF-10 — SQLite/reabertura/recovery; falta consulta MCP.
- [ ] RF-11 — boot opt-in.
- [~] RF-12 — estado do monitor e readiness Ollama; falta probe MCP autenticado.
- [~] RF-13 — health live/ready loopback opt-in; painel pendente.
- [ ] RF-14 — recuperacao e single instance.
- [ ] RF-15 — tray.
- [ ] RF-16 — configuracao autostart.
- [ ] RF-17 — notificacao.
- [ ] RF-18 — dashboard.
- [ ] RF-19 — benchmark modelos.
- [ ] RF-20 — failover seguro.

**Completos:** 0/20; **parciais:** 9/20; **pendentes:** 11/20.

## Evidencias de implementacao
- [x] F0-01: branch `feature/lao-devspace`, commits anteriores `3cca46b`, `0f31c0b`, main separada `13c99ee`.
- [x] F0-02: baseline `pnpm typecheck` + `pnpm build` verdes.
- [x] F0-03: baseline `pnpm test` 153 passaram, 7 pularam, 0 falhas.
- [x] F1-01: `src/lao/contracts.ts`, `task-state.ts` e testes.
- [x] F1-02: `config.ts` e testes (OFF por padrao).
- [x] F1-03: `task-store.ts` e testes (SQL, eventos, revisao, recovery).
- [x] F1-04: `health.ts`, `health-server.ts` e testes.
- [x] F2-01: `ollama-client.ts` e testes (list/show/chat mockado/abort/timeout).
- [x] F2-02: modelos locais `granite4.2-8b:gpu` e Spark presentes; `/api/show` Granite tem suporte tools.
- [!] F2-03: smoke de conversa real bloqueado pela ferramenta; sem prova de inferencia real.

**LAO tests:** 36 passaram; TypeScript aprovado. **Regressao apos mudancas:** 186 testes: 179 OK, 7 skip, 0 falhas. Build e typecheck aprovados.
**Nao instalado:** servico Windows, tray, autostart, nem ferramentas MCP de delegacao.
**Proximos:** concluir regressao/build; conectar flag e MCP com testes e opt-in.

- [x] F1-05: 'lao_status' e 'lao_models' somente leitura, via MCP opt-in; arquivos src/lao/mcp-tools.ts, mcp-tools.test.ts, src/server.ts. Testes OFF/ON passando.
