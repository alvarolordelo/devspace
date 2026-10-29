# Resume Work — continuação multiagente (MVP)

## Regra central

**O LAO é a fonte da verdade; o chat não é a memória da tarefa.**
Cada tarefa registra `requestedBy` (origem que a solicitou, por exemplo
`chatgpt`, `claude`, `gemini`, `grok` ou outro identificador curto), além
do pedido original, critérios, modelo executor, histórico, resultados,
testes, arquivos modificados e revisão. A origem é **informativa**,
declarada pelo cliente MCP ou inferida quando o host fornece metadados
específicos; não é identidade de usuário autenticada.

Tarefas antigas sem esse campo continuam válidas e exibem `unknown`.
Não se armazenam URLs externas, tokens nem IDs privados de sessão em
`requestedBy`.

## MCP comum, independente do provedor

- **`lao_continue`**: comando direto, sem ID ou contexto de conversa.
  Ativado pela solicitação natural `continue LAO` / `continuar o LAO`,
  retorna até dez tarefas com pedido, origem, resultado da última
  execução, evidências de testes e arquivos alterados, **somente leitura**.
  Contrato e fallback: `CONTINUE_LAO.md`.

- `lao_pending`: lista até 100 tarefas em revisão, com revisões solicitadas
  ou interrompidas, incluindo título resumido, ID e origem. Verifica se
  o workspace original ainda está autorizado/recuperável.
- `lao_resume` com `task_id`: recupera contexto completo de revisão,
  resultados, testes e arquivos alterados. Não executa modelo nem aprova.
- `lao_review`, `lao_write_assess` e as ferramentas de escrita mantêm
  suas autorizações e confirmações separadas.

Qualquer cliente com conexão válida ao MCP pode executar as mesmas
ferramentas. Não há estado de conversa amarrado a ChatGPT, Claude,
Gemini ou outro cliente.

## Botão Revisar / Continuar

No painel, o operador abre a tarefa, vê quem a solicitou e escolhe
um destino. O botão **copia uma instrução que referencia a tarefa** e
abre o aplicativo escolhido por um adaptador da UI.
**No Monitor Windows**, o mesmo fluxo pode ser iniciado sem abrir o
Dashboard: quando existir tarefa com status `awaiting_review`,
`needs_revision` ou `interrupted`, a ação existente do popup passa a
mostrar **Revisar / Continuar**. Ela abre uma janela WinForms nativa com
lista de tarefas recuperadas do SQLite por API local autenticada,
origem/modelo, seleção do cliente e instrução legível. A opção também
aparece no menu de contexto do ícone da bandeja. A lista é reconsultada
no clique, sem reutilizar um resultado potencialmente desatualizado.
O botão de continuidade **copia a instrução** e pode abrir o aplicativo
da IA escolhida, sem abrir o Dashboard nem enviar/autorizar comandos.
Os adaptadores ficam separados no servidor em `handoff-providers.ts`,
e são servidos por API autenticada; novos provedores podem ser
adicionados sem alterar o formato do banco ou o MCP.
O Monitor mantém uma lista de destinos HTTPS explícitos, sincronizada
por teste de contrato com os URLs dos adaptadores do Dashboard.

**Limitação importante:** abrir uma aba de chat não faz esse chat chamar
o MCP sozinho. O operador cola e envia a instrução. O novo assistente
precisa ter o conector DevSpace habilitado. Sem essa capacidade do
aplicativo externo, prometer uma chamada automática seria incorreto.

Nenhuma etapa do botão executa alterações, aprova patches ou faz merge.
O fluxo funciona após reiniciar o Windows desde que os bancos LAO e
os registros de workspaces do DevSpace permaneçam no mesmo diretório.

Quando o monitor ou daemon é iniciado, o bootstrap local agora verifica
DevSpace e Ollama e tenta iniciar apenas as dependências sem listener.
Isso é independente de qual cliente de IA havia solicitado a tarefa.
Os registros de trabalho permanecem no SQLite, e o botão
**Revisar / Continuar** do Monitor recupera os IDs após o reboot.
O bootstrap não aprova, mescla, remove ou reexecuta tarefas e não liga a
inicialização com Windows sem o switch explícito das Configurações.

### Verificações no Monitor (29/10/2026)

- A tarefa real `c84f8450-5d9a-4f38-9dfb-711760cda558`, criada em
  28/10, continuou no SQLite após a queda de energia. `lao_result`
  recuperou pedido, execução Granite, fonte e eventos da tarefa.
- `src/lao/windows/lao-tray.ps1` continua com quatro ações principais
  e o layout aprovado. A ação de revisão não navega mais para `#tarefas`.
- Teste nativo WinForms verificou janela, seleção de três estados de
  atenção, validação de IDs e montagem do prompt sem abrir clientes
  externos, alterar a área de transferência ou aprovar tarefas.
- O teste de clique humano no monitor instalado, após recarregamento da
  versão e envio ao cliente externo, permanece uma confirmação operacional
  separada do teste automatizado.
- `pnpm typecheck`, `pnpm build`, `git diff --check` e o verificador de
  DevSpace fixo `1.0.8` passaram. A regressão completa encontrou uma falha
  em `src/local-agent-pi-sandbox.test.ts` (esperado `provider-env`, recebido
  `(no output)`). O mesmo teste isolado falhou também no checkout estável
  `devspace-upstream-test`, sem mudanças do LAO: é uma pendência do baseline
  e não deve ser apresentada como regressão aprovada.

## Verificação de recuperação entre processos — 28/10/2026

O teste `src/lao/mcp-http-e2e.test.ts` agora encerra de verdade seu servidor
MCP OAuth descartável, cria outro processo lógico de servidor usando **os
mesmos arquivos persistentes** e refaz chamadas HTTP autenticadas. Um cliente
de teste identificado como `claude` consulta `lao_pending` e `lao_resume` para
uma tarefa originalmente marcada `requested_by=gemini` e confirma a preservação
do ID de tarefa, workspace, run e estado `awaiting_review`. O mesmo teste
recupera o diff de uma tarefa escrita em worktree isolado e verifica que
o checkout de origem continua intocado. Não aprova nem promove código.

Além do MCP simulado, o smoke `LAO_MCP_LIVE=true` executou o fluxo com
Granite real através de OAuth em servidor de teste e armazenamento temporário.
Isso não constitui prova de um aplicativo Claude real nem de reinicialização
física do Windows: esses são gates operacionais distintos.

Na instalação ativa, uma chamada OAuth direta a `tools/list` confirmou que
`lao_pending` e `lao_resume` **já estão publicados** no servidor. Uma consulta
autenticada confirmou que ambos respondem sobre uma tarefa histórica pendente.
Entretanto, o catálogo de ferramentas disponibilizado ao ChatGPT nesta sessão
ainda não inclui essas duas funções. O próximo gate de integração com o host
é atualizar/reconectar o catálogo do conector; não é preciso recriar as
ferramentas no núcleo. Tarefas anteriores sem `requestedBy` continuam como
`unknown`, conforme o contrato.
