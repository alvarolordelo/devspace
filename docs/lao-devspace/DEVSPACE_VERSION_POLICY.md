# LAO DevSpace — Politica de versao fixa do DevSpace

## Contrato aprovado

- **DevSpace base:** `@waishnav/devspace` **1.0.8**.
- **Codigo-base imutavel:** commit `13c99eec5ed43eb9aba3fdc457bd912d3ce82211` do fork sincronizado, documentado em `DEVSPACE_VERSION_PIN.json`.
- **Gerenciador:** `pnpm@11.25.0`; dependencias efetivas fixadas no `pnpm-lock.yaml` dessa mesma base.
- **Worktree LAO:** `feature/lao-devspace`; **stable**: `main` em checkout separado.

O LAO atualmente e uma extensao no **mesmo repositorio fonte** do DevSpace, nao um pacote npm que possa ser atualizado de modo independente. Assim, a politica de versao fixa e aplicada ao commit-base, aos arquivos de dependencia e a todos os arquivos-fonte do nucleo. O package.json do fork permanece na versao 1.0.8; a unica adicao autorizada a ele e o binario opt-in `devspace-laod`.

## Regra obrigatoria para cada atualizacao LAO

1. Alteracoes comuns ficam exclusivamente em `src/lao/`, `docs/lao-devspace/`, nos scripts LAO de **lista explicita** do verificador (`lao-*`, `launch-lao-*`, `build-lao-action-icons.ps1` e `install-lao-shortcuts.ps1` atualmente enumerados por nome), `bin/devspace-laod.js` e o workflow especifico da feature. A lista explicita NAO permite novos scripts arbitrarios.
2. `src/server.ts` pode conter **apenas** as integracoes LAO explicitamente revisadas. O verificador compara o arquivo inteiro com a versao-base mais a integracao esperada.
3. Modificar `package.json` (alem da unica entrada de binario), `pnpm-lock.yaml`, `pnpm-workspace.yaml` ou qualquer arquivo do core **falha a verificacao**.
4. O GitHub Actions faz `node scripts/lao-verify-devspace-pin.mjs` e os testes negativos **antes de instalar dependencias**. A instalacao usa `pnpm install --frozen-lockfile`.
5. O atualizador futuro do LAO deve substituir **somente artefatos proprios do LAO**; nunca executar `git pull` da `main`, `pnpm update`, `npm update` ou instalar a ultima versao do DevSpace automaticamente.
6. Qualquer upgrade de DevSpace exige decisao e autorizacao separadas, novo commit-base aprovado, revisao da integracao, alteracao explicita do manifesto e do verificador, testes completos e rollback documentado.

### Comando local de verificacao

```powershell
cd D:\desenvolvimento\lao-devspace
node scripts/lao-verify-devspace-pin.mjs
node --test scripts/lao-verify-devspace-pin.test.mjs
```

Nao ha instalacao de servico, alteracao do autostart nem atualizacao do DevSpace ao executar esses comandos. O script nao modifica os arquivos; apenas consulta Git e compara a arvore de trabalho com a base aprovada.

**Limitacao:** isso bloqueia upgrades acidentais no fluxo de CI/build do fork. A distribuicao separada do LAO e o futuro mecanismo de atualizacao ainda precisam de testes de instalacao/rollback antes do release.
