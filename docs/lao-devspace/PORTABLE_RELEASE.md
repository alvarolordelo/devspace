# LAO DevSpace - Candidato portavel e plano Windows

## Entrega e limites

O gerador offline de F7 cria um candidato executavel para o DAEMON LAO,
mas NAO um instalador. Exige Node.js preinstalado com a mesma
plataforma/arquitetura e ABI nativa indicada no manifesto.
Nao instala servicos, inicializacao automatica, programas ou modelos,
nao modifica o registro e nao altera o DevSpace original.

O candidato foi testado no Windows com SQLite nativo carregado da
pasta nova, sem node_modules do checkout fonte. F5 prepara o arquivo
XML de servico para um WinSW fornecido por operador e validado por hash.
Nenhum WinSW genuino ou servico SCM foi instalado/testado.

## Requisitos e geracao

- Branch feature/lao-devspace, Node >=22.19 e <27, pnpm 11.25.0;
- pnpm build e verificador de DevSpace 1.0.8 executados antes do pacote;
- Runtime sem download: better-sqlite3 12.10.0, bindings 1.5.0,
  file-uri-to-path 1.0.0 e zod 4.4.3;
- Destino absolutamente novo, fora dos checkouts.

    cd D:\desenvolvimento\lao-devspace
    pnpm build
    node scripts/lao-verify-devspace-pin.mjs
    node src/lao/release-portable.mjs --out C:\TEMP\lao-portable-novo
    node src/lao/release-verify.mjs --dir C:\TEMP\lao-portable-novo

O manifesto contem SHA-256/tamanho de cada arquivo, versao-base,
plataforma, arquitetura, Node ABI e dependencias. O verificador nega
hash alterado, arquivo inesperado/faltante, symlink e traversal.
ATENCAO: manifesto e arquivos pertencem ao mesmo pacote; sem
assinatura externa, ambos podem ser adulterados em conjunto.
Node nao esta embutido e o pacote NAO substitui o DevSpace MCP.

## Plano opcional Windows (nao instala)

O operador deve obter WinSW autentico separadamente, validar sua
origem/licenca e fornecer SHA-256 exato. Exemplo de uso:

    powershell -NoProfile -ExecutionPolicy Bypass -File C:\TEMP\lao-portable-novo\src\lao\windows\lao-service-plan.ps1 -ReleaseDir C:\TEMP\lao-portable-novo -OutputDir C:\TEMP\lao-service-plan-novo -WinSWExe C:\TEMP\winsw-aprovado.exe -WinSWSha256 <SHA256_REAL_64_CARACTERES> -NodeExe "C:\Program Files\nodejs\node.exe"

Este comando SOMENTE gera pasta nova contendo LAODevSpaceService.exe,
LAODevSpaceService.xml e SERVICE_PLAN.json, com startmode Manual.
O XML fixa explicitamente `NT AUTHORITY\LocalService` (WinSW assume
LocalSystem, privilegiado, quando nao configurado) e timeout de parada
de 30 segundos para permitir o encerramento do daemon Node. O script
**nao cria ACLs**: antes de qualquer instalacao futura, um operador
devera provisionar `%ProgramData%\LAODevSpace\state` e conceder somente
ao `LocalService` as permissoes minimas de leitura/escrita nesse estado,
alem de validar acesso aos demais caminhos necessarios em VM descartavel.
Valida manifest, SHA-256 do WinSW, Node ABI e SQLite nativo. Nunca
chama sc.exe, WinSW install, Start-Service ou schtasks, nunca
modifica boot, registro, credenciais ou servicos do Windows.

## Gates faltantes

Validar WinSW real em VM descartavel, instalacao e desinstalacao,
healthcheck, paradas/restart, ACLs de conta dedicada sem privilegios
administrativos, backup/rollback de SQLite, assinatura, runtime Node
no instalador e teste de maquina limpa. A instalacao no Windows
estavel requer autorizacao operacional EXPLICITA.
Nao instalar sob LocalSystem por padrao para executar tarefas
envolvendo arquivos nao confiaveis.
