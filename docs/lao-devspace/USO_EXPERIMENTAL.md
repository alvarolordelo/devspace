# LAO DevSpace — Modo experimental (somente leitura)

Este material descreve a fase experimental no worktree `feature/lao-devspace`. **Não modifica o DevSpace estável e não instala serviço ou tray.**

## Ativação

O LAO começa **OFF**. Somente a instância da branch de desenvolvimento pode recebê-lo por variável de ambiente `DEVSPACE_LAO_ENABLED=true`. O Ollama deve escutar em `http://127.0.0.1:11434` (loopback). A configuração padrão escolhe `granite4.2-8b:gpu`, com seleção opcional pelo host.

Não altere as variáveis ou portas da instância estável para testar a feature. O LAO não muda configurações globais do Ollama.

## Ferramentas MCP experimentais

| Ferramenta | Entrada | Efeito |
|---|---|---|
| `lao_status` | nenhuma | Consulta dependências sem executar modelo |
| `lao_models` | nenhuma | Lista modelos locais sem carregá-los |
| `lao_delegate` | `workspace_id`, `goal`, `acceptance_criteria`; modelo e deadline opcionais | Registra tarefa durável e solicita resposta somente-leitura ao Ollama |
| `lao_result` | `workspace_id`, `task_id` | Recupera tarefa, execuções, estados, revisão e resumo, se existir |
| `lao_review` | workspace/tarefa, decisão, critérios verificados, evidências e nota | Registra decisão **explícita** do supervisor; não altera arquivos |

As ferramentas adicionais ficam ocultas quando `DEVSPACE_LAO_ENABLED` não é exatamente `true`. Todo acesso à tarefa exige workspace acessível no `WorkspaceRegistry` autorizado e ID compatível com a tarefa.

`lao_delegate` **não tem acesso ao filesystem, shell, patch ou outras ferramentas do modelo**. Ele envia apenas instruções/objetivo/critérios recebidos para geração de texto. Portanto, seu resultado não prova que o repositório foi lido, compilado ou testado. Mesmo um resumo plausível sempre fica em `awaiting_review`.

## Validação

A partir do worktree da feature, verificar `pnpm typecheck`, `pnpm exec tsx --test src/lao/*.test.ts`, `pnpm test` e `pnpm build`. As verificações de chat nos testes usam transporte simulado; só chame de execução real quando houver resultado registrado do Granite via Ollama.

`LaoTaskStore.recoverInterrupted()` permite marcar execuções antigas como interrompidas ao reiniciar o futuro processo LAO. Isso não retoma a tarefa automaticamente. O LAO atual **ainda não possui** serviço Windows, tray, gerenciador de filas ou execução de patches.

## Segurança e rollback

Nenhuma tarefa experimental pode usar `write=isolated_worktree` ou `shell=allowlist` por meio de `lao_delegate`. A guarda de worktree foi criada separadamente para a próxima fase, não habilita escrita. Não misture código de produção com worktrees experimentais. A branch principal não deve receber merge antes do aceite de F3–F7. Instalação do serviço e autostart sempre exigirão autorização expressa.

## Evidências determinísticas em worktree

O módulo `collectLaoReviewEvidence` coleta HEAD, arquivos alterados/não rastreados, resumo do diff e erros de whitespace em worktree gerenciada, sem executar comandos fornecidos pelo modelo. Os campos `testsVerified` e `criteriaVerified` são **false**. Tarefas com escrita não podem ser marcadas aprovadas pelo store até que uma validação determinística completa esteja implementada. Essa função ainda não está conectada a uma ferramenta MCP de execução com escrita.
