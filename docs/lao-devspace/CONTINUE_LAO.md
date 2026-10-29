# Comando oficial: Continue LAO

**Comando em linguagem natural:** `continue LAO` (ou `continuar LAO`,
`continuar o LAO`, `revisar tarefas do LAO`). Quando o contexto já
identificar o produto LAO DevSpace, a transcrição de voz `continue lá`
também pode ser entendida como esse comando.

## Ação esperada da IA conectada

1. Chamar a ferramenta MCP **`lao_continue`**, **sem argumentos**.
   É a entrada única do projeto para recuperar até dez tarefas recentes
   pendentes, em revisão, interrompidas ou precisando de correção.
2. Ler as tarefas retornadas do **banco persistente do LAO**; não perguntar
   ao usuário para repetir os IDs e não depender da conversa anterior.
3. Apresentar o pedido original, a IA solicitante, o modelo que executou,
   os resultados e o que precisa ser conferido. Se o usuário solicitar
   análise detalhada de uma tarefa, chamar `lao_resume` com o ID recebido.
4. **Nunca** aprovar, executar novamente, publicar, mesclar ou modificar
   arquivos apenas por receber o comando `continue LAO`.

O comando independe do cliente: ChatGPT, Claude, Gemini, Grok e outras IAs
podem usá-lo quando autorizadas a acessar as ferramentas MCP do DevSpace.
O serviço filtra workspaces sem autorização e não concede permissões de
escrita.

## Compatibilidade para catálogos MCP ainda desatualizados

Se o host não apresentar `lao_continue`, mas apresentar `lao_pending`,
usar `lao_pending` seguido de `lao_resume` para cada tarefa selecionada.
**Não afirmar que a ferramenta está disponível se ela não aparecer no
catálogo do host.** Um host pode precisar de atualização/reconexão do
conector após o novo registro no servidor DevSpace.

Como alternativa **local** quando o host oferece execução de comandos
autorizada no checkout do LAO, é possível executar:

```powershell
cd D:\desenvolvimento\lao-devspace
node scripts/lao-continue.mjs
```

Esse script **abre o SQLite exclusivamente para leitura**, devolve o
mesmo tipo de resumo e não precisa conhecer a sessão do chat. Por ser
executado localmente sob a conta do Windows, ele não implementa o filtro
de workspaces do MCP; use-o somente com as permissões locais do operador.

## Teste de aceitação após desligar o computador

1. Iniciar o LAO e suas dependências pelo Monitor.
2. Em **nova conversa**, dizer apenas: **“continue LAO”**.
3. Confirmar que a IA encontra as tarefas persistidas, inclusive uma
   criada antes do desligamento, mostra a origem e o resultado armazenado
   e aguarda a revisão do usuário.
4. Confirmar que nenhuma tarefa muda de estado, nenhum patch é
   aprovado e nenhum arquivo é modificado sem uma decisão separada.

O teste de nova conversa **precisa confirmar a exposição da ferramenta
no cliente ChatGPT/Claude/etc.**, não apenas no servidor MCP de teste.
