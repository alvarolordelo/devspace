# F6-01 - Painel operacional local (MVP)

Estado: painel funcional somente-leitura, opt-in, agora com layout
visual de referencia implementado. Controle de fila e UI de aprovacao/
edicao de patches continuam pendentes.

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
- Lista das 200 tarefas mais recentes, com descricao do pedido (resumo de
  240 caracteres), status, modelo, tipo de tarefa e ultima atualizacao.
- Ao clicar em `Ver`, painel legivel com o pedido integral, criterios de
  aceite, resposta do modelo, tentativas anteriores, arquivos consultados
  ou alterados, testes, revisao e historico de estados. IDs tecnicos ficam
  recolhidos; nenhum JSON bruto e apresentado na interface.
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
- Apenas no endpoint autenticado de lista retorna `goalPreview` limitado
  a 240 caracteres; `acceptanceCriteria`, `traceId` e `permissions` nao
  sao retornados. O endpoint autenticado de detalhe retorna pedido integral,
  criterios e resposta da execucao porque o operador precisa inspecionar
  a tarefa antes da revisao. Respostas sao `no-store`, nunca entram em
  HTML estatico, logs, URL ou historico publico. Textos nao confiaveis sao
  inseridos com `textContent`, nunca executados como HTML.
- Sem assets externos, CDN ou requests a servidores remotos.
- O painel nao substitui autenticacao do protocolo MCP.
- Uma GPU indisponivel, NVML nao inicializada, multipla GPU nao suportada
  ou comando `nvidia-smi` ausente e exibida como "Nao disponivel", nunca
  como consumo zero. O comando fixo `nvidia-smi` tem timeout de 1,5 s,
  argumentos imutaveis e um ambiente restrito sem secrets.
- `/dashboard/api/metrics` devolve apenas codigos estaticos de alerta
  e `advisoryOnly=true`, sem nomes de processo, comandos ou segredos.
- O layout foi testado em Chrome headless autenticado, mas a interacao
  humana e o aceite visual final permanecem pendentes.

Nao instalar no boot, configurar conta Windows, gerenciar credenciais,
expor tunel, nem ativar URL publica automaticamente. Tais operacoes
dependem de uma etapa separada, de verificacao e autorizacao.

## F6-05 - Dashboard com o design aprovado (27/10/2026)

Interface reconstruida de acordo com
`docs/lao-devspace/assets/references/dashboard-panel.png`:
paleta e fontes da especificacao, sidebar com Status, Tarefas, Modelos,
Logs e Configuracoes; quatro cards de saude, recursos com barras reais,
resumos de tarefas, modelos, eventos e rodape de acoes.

O logo original e servido por `/dashboard/assets/logo.png` com
`img-src 'self'` na CSP. Continua no loopback e somente-leitura,
com API Bearer e texto de registros colocado por `textContent`.
Modelo selecionado nao implica carregado. Botoes que exigem escrita
ou integracao com servico Windows aparecem explicitamente desabilitados.
Hash links permitem abrir secoes a partir da bandeja.

Smoke visual REAL em Chrome headless autenticado, sem gravar token em
capturas ou URLs, validou 5 secoes, 4 cards, logo e painel branco
nas escalas 100%, 125% e 150%, alem de verificar que a pagina
nao extravasa horizontalmente em viewport movel de 390 px.
PNGs locais de evidencia ficam
somente no TEMP do usuario: `lao-approved-dashboard-visual-27oct2026.png`,
`lao-approved-dashboard-dpi125-27oct2026.png` e
`lao-approved-dashboard-dpi150-27oct2026.png`.
Reproducao via `src/lao/dashboard-visual-smoke.mjs` (Chrome
ja instalado, nenhuma instalacao adicional ou processo persistente).

Falta aceite visual/interativo em uma sessao normal, testes com varias
tarefas, conteudo longo e experiencia tatil real em dispositivos moveis.
