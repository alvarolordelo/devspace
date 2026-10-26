# F4-05 - Testes supervisionados em sandbox (experimental)

**Estado:** implementado com gate fail-closed; **nao validado com Docker real nesta maquina**.

A ferramenta MCP opcional `lao_write_test` executa apenas um conjunto
explicito de 1 a 5 arquivos `*.test.js` ou `*.test.mjs` do commit-base.
Ela so aparece com LAO habilitado, registry de workspaces autorizado e
worktree root gerenciado. Nao aceita comandos, imagens, shell scripts nem
flags Docker fornecidos pelo modelo local.

## Precondicoes

1. Tarefa de escrita em `awaiting_review` com worktree gerenciado e destacado.
2. Evidencia persistida do patch; validacao estatica positiva.
3. Arquivos de teste rastreados no HEAD, nao modificados, sem symlinks,
   caminhos normalizados e com limite individual de 64 KiB.
4. Docker Engine Linux operacional e uma imagem Node ja disponivel localmente,
   referenciada por digest SHA-256. Nao ha instalacao ou download automatico.
5. O administrador define `LAO_SANDBOX_NODE_IMAGE` no processo do MCP com
   referencia de imagem no formato `node@sha256:<64 hex>` ou referencia
   qualificada equivalente. Nao use tags mutaveis, como `node:22`.

## Isolamento e limites

- `docker run --pull=never`; image digest obrigatorio.
- Rede desativada, filesystem do container read-only, mount do worktree
  read-only; sem capacidades Linux e com no-new-privileges.
- Usuario sem privilegios (UID/GID 65534), /tmp em tmpfs,
  memoria 512 MiB, 1 CPU, 64 processos e timeout de 60 segundos.
- O binario de entrada e fixo: `node --test --test-reporter=tap`.
- Docker executado via argv, sem shell do host ou fallback local.
- Nome de container unico por tentativa; limpeza restrita a esse nome.
- Falhas do daemon/imagem/timeout nao liberam execucao no host.

## Evidencias e seguranca de aprovacao

A tentativa e registrada na tabela `lao_write_test_evidence`, ligada a
task/run; `lao_result` lista as evidencias. Sao gravados suite, caminhos,
digest da imagem, estado, codigo de saida, SHA-256 dos logs e integridade
do patch reavaliada apos o teste. O conteudo bruto de stdout/stderr nao e
persistido para reduzir o risco de vazamento de informacoes.

**Um teste com exit code zero nao comprova criterios de aceite.** O retorno
mantem `criteriaVerified=false` e `approvalAllowed=false`.
A aprovacao de escrita no `lao_review` continua bloqueada.

## Pendencias para concluir F4

- Validar Docker Engine real e imagem local, inclusive testes de sucesso,
  falha, timeout e re-execucao apos falhas de infraestrutura.
- Cobrir suites TypeScript/projeto completas em ambiente isolado, sem
  executar hooks de dependencias nao confiaveis no Windows.
- Vincular suite e criterios de aceite com avaliacao deterministica,
  guardar relatorios estruturados, e adicionar protecoes de concorrencia.
- Executar MCP autenticado de ponta a ponta e revisar a seguranca do
  isolamento na plataforma Windows.

**Nao instalar Docker, iniciar servicos Windows ou alterar o boot
automaticamente para desbloquear estes testes.**
