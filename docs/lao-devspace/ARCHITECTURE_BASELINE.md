# LAO DevSpace — Inventario e baseline (25/10/2026)

O desenvolvimento ocorre no worktree `D:\desenvolvimento\lao-devspace`, branch `feature/lao-devspace`. O DevSpace estavel segue em `D:\desenvolvimento\devspace-upstream-test` na `main` (HEAD `13c99ee`). O checkout estavel continha arquivos nao rastreados, que nao foram modificados.

## Modulos e estrategia de reuso

| Base existente | Uso futuro LAO |
|---|---|
| `src/server.ts`, `src/tool-surfaces/` | Novos tools MCP apenas com flag e autenticacao |
| `src/config.ts`, `src/config-schema.ts` | Preservar esquema legado; LAO OFF |
| `src/local-agent-*.ts` | Reutilizar runtime, perfis e sessao, nao duplicar agente |
| `src/git-worktrees.ts`, `src/roots.ts` | Isolamento para qualquer tarefa com escrita |
| `src/process-sessions.ts` | Limites e cancelamento |
| `src/review-checkpoints.ts` | Diffs e decisao supervisionada |
| `src/db/` | Manter persistencia DevSpace intacta; BD LAO separado |
| `src/ui/` | Painel/tray posterior, fiel aos mockups |

## Ferramentas e testes reais

- Node v24.16.0, pnpm 11.25.0. Dependencias instaladas apenas no worktree da feature.
- `pnpm typecheck` aprovado na baseline.
- `pnpm test` baseline: **160 testes, 153 passaram, 7 ignorados, 0 falhas**.
- `pnpm build` baseline aprovado, com aviso de chunk Vite grande.
- `/api/tags` do Ollama: HTTP 200 com Granite e Spark presentes.
- `/api/show` Granite: `tools`, `thinking`, `completion`; `ollama ps` sem modelo carregado.
- Inferencia real com Granite **nao comprovada**; a tentativa foi bloqueada pelas configuracoes da ferramenta. Teste do adaptador de chat foi simulado.

## Permissoes e rollback

`open_workspace` nao permite abrir diretamente o worktree LAO pelas raizes atuais. Executamos comandos com caminhos explicitos no workspace autorizado, sem ampliar raizes nem alterar seguranca.

O LAO nao e iniciado automaticamente, nao altera banco legado e nao instala servico, tray ou autostart. Commits da branch feature oferecem marcos reversiveis; qualquer rollback deve ser feito sem reset destrutivo, preservando main e credenciais locais. Nao realizar merge/PR sem aprovacao.

## F2/F5 experimentais, sem alteracao na instalacao estavel

- Leitura de 3 arquivos explicitamente selecionados (4 kB cada) por `lao_delegate`; hashes SHA-256 de cada fonte no registro de execucao, sem expor ferramentas ao modelo.
- Daemon foreground compilado, validado em processo real com porta dinamica local: `/health/live` HTTP 200, `/health/ready` HTTP 503 sem MCP autenticado; processo encerrado ao fim.
- Sem inferencia real validada com Granite, servico SCM ou boot alterado.

## Regressao atualizada

Suite final apos mudancas (25/10/2026): 213 testes, 205 OK, 8 skip, 0 falhas. Typecheck e build validados na feature. Um caso de symlink foi ignorado por falta de privilegio da conta Windows.
