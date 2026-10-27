# Critérios de aceitação dos assets e do Monitor

## Identidade e referência

- [ ] Ícone de bandeja reconhecível nos tamanhos 16/20/24/32 px, claro e escuro.
- [ ] Verde/vermelho/amarelo/cinza representados em `.svg`, `.png`, `.ico` sem artefatos de antialiasing.
- [ ] Popup ativo reproduz a hierarquia visual de `tray-active-panel.png`.
- [ ] Popup parado reproduz a hierarquia visual de `tray-offline-panel.png`.
- [ ] Popup aguardando revisão reproduz `tray-review-panel.png`.
- [x] Dashboard apresenta quatro cards de resumo, recursos, tarefas, modelos e logs segundo `dashboard-panel.png` (Chrome autenticado 100/125/150%).
- [x] Nenhuma imagem de Windows/Tailscale é embutida como interface funcional.

## Comportamento

- [ ] Serviço Windows e Tray Monitor separados; iniciar automaticamente nos contextos apropriados.
- [ ] Clique no ícone da bandeja expande/recolhe o menu; click-away/Esc fecham.
- [ ] Verde somente para saúde validada; vermelho em falha real; amarelo para revisão; cinza desconhecido.
- [ ] Offline e reconnect não provocam reinício automático não solicitado de DevSpace ou Ollama.
- [x] Modelo selecionado distinto de modelo efetivamente carregado em VRAM.
- [x] GPU (%) distinguida de porcentagem de camadas do modelo na GPU.
- [ ] Métricas indisponíveis mostram `—` com timestamp e motivo, sem valores inventados.
- [ ] Ações de iniciar/parar/reiniciar possuem confirmação quando pertinente e mostram resultado efetivo.
- [ ] Operações que alteram arquivos são feitas apenas em worktree aprovado e aguardam revisão.

## Compatibilidade, segurança e acessibilidade

- [ ] DevSpace inicia normalmente com LAO desabilitado.
- [ ] Endpoints MCP e configurações existentes permanecem compatíveis.
- [ ] Não publicar serviços locais em 0.0.0.0 sem design e autorização explícitos.
- [ ] Não incluir tokens/senhas nos logs nem notificações.
- [ ] Testes de CI: typecheck, testes existentes e regressão MCP.
- [ ] Verificação real no Windows 11 com 100%, 125% e 150% de escala, além de vários monitores.
- [ ] Acessibilidade: foco, teclado, tooltips e status não dependentes somente da cor.
- [ ] Instalação, rollback e remoção do monitor documentados sem alterar o DevSpace estável.

## Git

- [ ] Branch `feature/lao-devspace` criada no fork `alvarolordelo/devspace`.
- [ ] Worktree isolado e checkout estável inalterado.
- [ ] Assets adicionados em `docs/lao-devspace` para revisão.
- [ ] Nenhum commit, push de conteúdo, merge ou serviço instalado sem etapa explícita de aprovação.
