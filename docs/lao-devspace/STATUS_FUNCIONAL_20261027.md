# LAO DevSpace — auditoria funcional após aprovação do design

**Data:** 27/10/2026 · **Branch:** `feature/lao-devspace` · **Escopo:** observação e diagnóstico sem modificar instalações, serviços, credenciais ou DevSpace original.

## Aceite visual e limites

O usuário aprovou o popup **real** mostrado no Windows, no estado **Atenção · parcialmente disponível**. O layout, marca, ícones e organização do monitor não precisam mais de mudanças não solicitadas. A aprovação da aparência **não equivale** à aprovação de operações de escrita, instalação de serviço Windows ou uso automático de credenciais. Ainda é necessária verificação dos estados offline/revisão e do Dashboard em uso normal.

## Evidência local coletada

| Verificação | Resultado |
| --- | --- |
| Daemon LAO em `127.0.0.1:7877` | **Online**; `/health/live` respondeu; reinício anunciado como disponível pela API |
| Monitor na bandeja | **Executando**: mutex por SID detectado |
| Sessão do Dashboard | Chrome autenticado na **porta oficial 7877**, F5 preserva sessão, logout e abertura automática simulada aprovados; 17 imagens carregadas |
| DevSpace original | Porta TCP `7676` ouvindo; `GET /mcp` respondeu **HTTP 401**, demonstrando endpoint protegido, **não conexão autenticada** |
| Prontidão do LAO | **Falsa**, motivo único `devspace_unverified` |
| Causa identificada no código | `src/lao/daemon.ts` usa `options.devspaceReady ?? (() => false)`; `daemon-main.ts` **não fornece** a callback. Portanto, a instância standalone **nunca poderá afirmar MCP conectado**, mesmo com o servidor ativo |
| Ollama | API local respondeu, versão 0.40.11; Granite `granite4.2-8b:gpu` instalado, porém **não carregado em memória no instante da consulta** (permitido: carregamento sob demanda) |
| Métricas | GPU e memória do processo detectadas; o Monitor consulta valores reais |
| Tarefas | 0 registradas no stateDir atual do daemon; 0 executando; 0 em revisão |
| Serviço SCM LAO | **Não instalado** |
| Qualidade/CI | CI da branch no commit `d0db055` **success**, run `40579726666`; suíte local anterior com 108 testes: 107 aprovados, 1 ignorado, 0 falhas |
| Gate local de versão fixa | **Regressão encontrada e corrigida nesta auditoria:** os novos scripts de execução LAO estavam fora da lista explícita aceita pelo validador, embora não alterassem o core. A lista foi ampliada somente com os 5 scripts LAO conhecidos, sem liberar outros caminhos; verificação de DevSpace 1.0.8 e teste negativo novamente aprovados. |

O `/health/ready` pode responder **503** enquanto o MCP estiver não verificado. Os dados de GPU/VRAM do mockup são **ilustrativos** e não devem ser usados para mascarar o estado.

## Próximas entregas — MVP funcional

| Ordem | Prioridade | Entrega real faltante | Critério de aceite |
| --- | --- | --- | --- |
| 1 | **P0** | **Verificação autenticada do DevSpace MCP**, mantendo OAuth e isolamento. Uma porta aberta ou HTTP 401 não pode ser interpretada como `Conectado`. Integrar um adaptador/probe autenticado explicitamente ao callback `devspaceReady`; não copiar nem inventar credenciais. | Um teste real autenticado marca `Conectado` apenas após sucesso; com falha/expiração mostra `Não verificado` ou `Indisponível`. DevSpace upstream permanece intacto |
| 2 | **P0** | **Vincular execução de tarefas à instância LAO que alimenta o painel**, usando o fluxo MCP opt-in existente em worktree isolado. O Dashboard atual só lê o SQLite local; criar tarefa no painel ainda está desabilitado | Delegar uma tarefa de teste segura via MCP autorizado, ver estado em execução, resultado e revisão **no mesmo Monitor/Dashboard**; não editar checkout estável |
| 3 | **P0** | **Validar os quatro botões em cenário real**: abrir painel sem token, logs, reinício confirmado só do LAO e configurações; comportamento após F5 e recuperação de desconexão. | Cliques GUI no Windows real reproduzíveis; reinício retorna com status atualizado e não encerra DevSpace/Ollama |
| 4 | **P1 / instalação consentida** | **Ciclo de vida Windows**: instalar e remover serviço LAO, iniciar no boot, iniciar apenas o tray ao login e restaurar após reinicialização. Projeto contém apenas launcher manual e plano WinSW, sem serviço instalado | VM limpa primeiro: SCM como conta restrita, permissões mínimas, recuperação, desinstalação e rollback; instalação no Windows do usuário somente após autorização |
| 5 | **P1** | **Eventos e notificações úteis**: histórico real, mensagens sanitizadas, transições offline/online, revisão e tarefa concluída; filtros e contadores coerentes | Sem exibir segredo/prompt privado; alertas não falsos; notificações habilitadas pelo usuário |
| 6 | **P1** | **Pacote distribuível**: runtime verificado, integridade, licenças, instalador reversível, backup do SQLite, atualização preservando DevSpace fixo na v1.0.8 | Instalar, atualizar, reverter e remover em Windows limpo, sem alterar o DevSpace original; CI e regressão end-to-end aprovados |
| 7 | **P2 — evolução** | Multimodelo, comparação, failover, edição/aprovação avançada, promoção segura e recuperação de tarefas após reboot | Testes com modelos reais e autorizações explícitas; não é requisito para o monitor MVP apenas observar |

## Regras para prosseguir

1. **Design aprovado está congelado**; corrigir lógica e integrações mantendo SVG/PNG, layout, nomenclatura e ações já aceitos.
2. Reutilizar o DevSpace disponível via MCP **com autenticação formal**. Não modificar `D:\desenvolvimento\devspace-upstream-test`, atualizar suas dependências ou afetar seu processo por causa do LAO.
3. Não instalar serviço, agendamento ou auto-start nesta máquina sem autorização explícita. Diagnóstico e testes em branch/worktree LAO podem continuar.
4. Validar cada etapa com teste de regressão, evidência real e commit semântico na feature branch; não confundir API HTTP 200 com fluxo de usuário aprovado.
