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
Os adaptadores ficam separados no servidor em `handoff-providers.ts`,
e são servidos por API autenticada; novos provedores podem ser
adicionados sem alterar o formato do banco ou o MCP.

**Limitação importante:** abrir uma aba de chat não faz esse chat chamar
o MCP sozinho. O operador cola e envia a instrução. O novo assistente
precisa ter o conector DevSpace habilitado. Sem essa capacidade do
aplicativo externo, prometer uma chamada automática seria incorreto.

Nenhuma etapa do botão executa alterações, aprova patches ou faz merge.
O fluxo funciona após reiniciar o Windows desde que os bancos LAO e
os registros de workspaces do DevSpace permaneçam no mesmo diretório.
