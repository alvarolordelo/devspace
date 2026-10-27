# F6-01 - Painel operacional local (MVP)

Estado: painel funcional somente-leitura, opt-in; tray, notificacoes,
controle da fila e UI de revisao de patches continuam pendentes.

## Abrir o painel

Este recurso nao instala nenhum servico e nao altera o DevSpace original.
Compile a feature com `pnpm build`. Inicie o processo LAO opcional
com `DEVSPACE_LAO_ENABLED=true` e `LAO_DASHBOARD_TOKEN` configurados
somente no ambiente do processo. O token deve ter 32 a 256 caracteres ASCII
imprimiveis; nunca grave ou compartilhe esse token em repositorios, logs,
scripts, URLs ou capturas de tela.

O daemon experimental pode ser iniciado pelo entrypoint
`node bin/devspace-laod.js` na branch LAO (execucao manual, foreground).
O endereco padrao, quando o daemon estiver ativo, sera
`http://127.0.0.1:7877/dashboard` (porta configuravel com
`DEVSPACE_LAO_PORT`). Para desligar, encerre o processo em foreground.
A tela pede o token e o mantem apenas na memoria JavaScript ate sair ou
fechar a aba. O token e enviado somente no cabecalho Authorization.

## Recursos disponiveis

- Status de prontidao real (Ollama/modelo + confirmacao DevSpace).
- Numero de tarefas, pendencias de revisao e tarefas em andamento.
- Lista das 200 tarefas mais recentes, com identificador, status,
  modelo, revisoes e ultima atualizacao.
- Atualizacao automatica a cada 10 segundos.
- Card "Recursos locais" com CPU, RAM, uso GPU NVIDIA e VRAM, mais
  memoria RSS do daemon. Os valores sao amostrados em cada atualizacao,
  com primeiro valor de CPU indicado como "Calculando amostra...".
- Alertas informativos somente apos **3 amostras** com pressao de recursos:
  RAM >= 90%, VRAM >= 90% ou CPU >= 95%. Amostras precisam estar
  separadas por pelo menos 8 segundos; varias abas simultaneas nao
  contam como varias observacoes. Um sinal normal limpa sua sequencia,
  e uma pausa >60 segundos reinicia a confirmacao.
- Alertas sao exibidos no card local em area `aria-live=polite`.
  Nenhum limite aciona processo, bloqueia modelo ou altera Ollama.
  Ausencia de GPU/CPU desconhecida nao gera falso alarme.
- `GET /dashboard/api/metrics` usa o mesmo Bearer/Host/CSP do painel;
  devolve somente numeros agregados de uso, sem identificadores da GPU,
  processos de terceiros, comandos, dados de tarefas ou credenciais.
- Sem permissoes de execucao, aprovacao, commit ou alteracao no Git.

## Limites e protecoes

- Servidor escuta exclusivamente em `127.0.0.1`.
- Sem token forte, a rota /dashboard e /dashboard/api/* responde 404.
- Rotas de dados exigem Authorization Bearer, validacao de Host e rejeitam
  Origin cross-site, POST/PUT, query string e URL com credenciais.
- Respostas incluem CSP com nonce, no-store, frame denial e nosniff.
- Conteudo dos registros e exibido por textContent (sem innerHTML).
- Dados sensiveis como goal, acceptanceCriteria, traceId e permissions
  nao sao retornados pela API de lista.
- Sem assets externos, CDN ou requests a servidores remotos.
- O painel nao substitui autenticacao do protocolo MCP.
- Uma GPU indisponivel, NVML nao inicializada, multipla GPU nao suportada
  ou comando `nvidia-smi` ausente e exibida como "Nao disponivel", nunca
  como consumo zero. O comando fixo `nvidia-smi` tem timeout de 1,5 s,
  argumentos imutaveis e um ambiente restrito sem secrets.
- `/dashboard/api/metrics` devolve apenas codigos estaticos de alerta
  e `advisoryOnly=true`, sem nomes de processo, comandos ou segredos.
- A interface de recursos recebeu testes de sintaxe e API, mas nao foi
  validada visualmente/interativamente num navegador real nesta etapa.

Nao instalar no boot, configurar conta Windows, gerenciar credenciais,
expor tunel, nem ativar URL publica automaticamente. Tais operacoes
dependem de uma etapa separada, de verificacao e autorizacao.
