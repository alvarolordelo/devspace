# Critérios de aceitação dos assets e do Monitor

## Identidade e referência

- [ ] Ícone de bandeja reconhecível nos tamanhos 16/20/24/32 px, claro e escuro.
- [ ] Verde/vermelho/amarelo/cinza representados em `.svg`, `.png`, `.ico` sem artefatos de antialiasing.
- [x] Popup ativo usa a hierarquia aprovada, comparada ao mockup em captura WinForms (27/10).
- [x] Popup parado usa a hierarquia aprovada, comparada ao mockup em captura WinForms (27/10).
- [x] Popup aguardando revisão usa a hierarquia aprovada, comparada ao mockup em captura WinForms (27/10).
- [x] Dashboard apresenta quatro cards de resumo, recursos, tarefas, modelos e logs segundo `dashboard-panel.png` (Chrome autenticado 100/125/150%).
- [x] Dashboard: navegação nas cinco seções, botões indisponíveis, ausência de overflow horizontal em 390px, 100/125/150% no Chrome (27/10).
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
- [ ] Acessibilidade: foco, teclado, tooltips e status não dependentes somente da cor (contratos verificados; falta interação real via bandeja).
- [ ] Instalação, rollback e remoção do monitor documentados sem alterar o DevSpace estável.

## Git

- [x] Branch `feature/lao-devspace` criada no fork `alvarolordelo/devspace`.
- [ ] Worktree isolado e checkout estável inalterado.
- [x] Assets adicionados em `docs/lao-devspace` para revisão.
- [x] Commits e push na branch de desenvolvimento autorizados expressamente no prompt de 27/10; sem merge ou instalação automática.

## Evidência da etapa de design — 27/10/2026

- Mockups originais preservados; foram inspecionados os quatro PNGs de painel. **Atenção:** `tray-offline-panel.png` mostra visualmente o estado **revisão**, enquanto `tray-review-panel.png` mostra o estado **parado**. Na implementação, prevalece a semântica visual/conteúdo de cada captura, sem renomear assets oficiais.
- Popup nativo inspecionado por `Form.DrawToBitmap` nos estados ativo, revisão e parado; linhas mais legíveis, ações sem espaços artificiais, bloco contextual arredondado e verificação de largura mínima 340 DIP. São **capturas de controle**, não prova de clique real na bandeja.
- Dashboard autenticado validado em instância experimental **isolada** (`127.0.0.1:7878`), com captura local externa ao Git em escalas de 100%, 125% e 150%. O processo previamente existente em `7877` não foi interrompido.
- Existe monitor na bandeja detectado por mutex de sessão, mas **a sessão já estava em execução antes destas mudanças**; o aceite de clique/ESC, reposicionamento, múltiplos monitores e escalas reais do Windows permanece pendente.
- Para testar o popup atualizado sem instalar serviços: encerrar apenas o monitor antigo pelo menu da bandeja e executar manualmente `scripts/launch-lao-monitor.cmd`. O lançador lê o token local, não o exibe e não altera a inicialização do Windows.
- Chrome headless com DPR simulado não é validação física de escala do Windows. A verificação obrigatória em Windows 11 e múltiplos monitores permanece aberta.
- O pipeline GitHub Actions do commit `379b8f6` consta como **success** (run `40554695186`); o commit anterior `c532a18` consta como **failure** (run `40543039502`). Após novo push, validar o pipeline desse novo SHA.
