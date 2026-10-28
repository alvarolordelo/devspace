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

## F7-07 - Candidato autonomo offline com Node empacotado

Para deixar de depender do Node preinstalado na maquina de destino,
existe agora uma **opcao de staging exclusiva do Windows**, sem
instalacao: `release-standalone.mjs`. Ela aproveita o pacote portavel
e copia um `node.exe` explicitamente aprovado (versao e ABI
compativeis com o build), identificado por **SHA-256 completo**.
Nao baixa, atualiza ou executa instaladores.

Exemplo no CMD, usando um executavel Node local previamente
**autenticado por canal independente** e um digest confirmado pelo
operador:

```cmd
cd /d D:\desenvolvimento\lao-devspace
pnpm build
node scripts/lao-verify-devspace-pin.mjs
node src/lao/release-standalone.mjs --out C:\TEMP\lao-autonomo-novo --node-exe "C:\Program Files\nodejs\node.exe" --node-sha256 <SHA256_AUTENTICADO_64_HEXA>
node src/lao/release-verify.mjs --dir C:\TEMP\lao-autonomo-novo
```

O arquivo `runtime/node.exe` fica no novo candidato e tem hash e
tamanho validados pelo verificador, alem de metadados de versao, ABI e
arquitetura em `runtime.embeddedNode`. O script executa smoke
com **esse Node copiado** e com SQLite nativo empacotado, sem
dependencias do checkout fonte. O teste automatizado tambem simula a
preparacao do plano manual WinSW apontando para
`C:\TEMP\lao-autonomo-novo\runtime\node.exe`, mantendo
`startmode=Manual` e a conta `LocalService`.

**Verificar o SHA-256 de um executavel local NAO comprova, sozinho,
que ele veio da Node.js Foundation.** A origem/distribuicao e a
assinatura Authenticode do executavel precisam de uma politica de
confianca separada. A integridade do manifesto tambem nao autentica
a origem do candidato; antes de distribuir, utilizar assinatura
Ed25519 destacada com chave publica confiavel, conforme secao abaixo.
O smoke testa apenas a capacidade de executar Node/SQLite; nao
certifica que o binario ou suas dependencias sejam seguros.

Nao e um instalador: nao configura PATH, servicos, boot, registro,
atualizacoes ou gerenciamento de processos. O monitor tray ainda
exige sessoes graficas e integracao apropriada no instalador futuro.
Antes de qualquer distribuicao publica ou comercial sera necessario
incluir os avisos de licenca do runtime Node.js e seus componentes
terceirizados, revisar a origem e conferir a assinatura do executavel
e testar a instalacao em uma VM limpa.

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

### Lifecycle explicito de instalacao/desinstalacao

O plano copia tambem `lao-service-lifecycle.ps1`. Por padrao ele somente
valida o pacote e nao altera o Windows:

```cmd
powershell -NoProfile -ExecutionPolicy Bypass -File C:\TEMP\lao-service-plan-novo\lao-service-lifecycle.ps1 -ServicePlanDir C:\TEMP\lao-service-plan-novo -Action Validate
```

Para um plano destinado a iniciar no boot, gere-o explicitamente com
`-StartMode Automatic -DelayedAutoStart`. `DelayedAutoStart` nao e aceito
com modo Manual. Mesmo assim, instalar esse plano exige administrador e a
confirmacao adicional `-ConfirmAutomaticStart`; nao ha habilitacao de boot
implicita ao apenas preparar ou validar um candidato.

As acoes `Install` e `Uninstall` sao deliberadas e separadas. Antes de
alterar o SCM o script revalida hashes, release e contrato LocalService.
Ele preserva e faz backup de `lao.sqlite*` e da preferencia local, concede
ao LocalService somente acesso de modificacao ao stateDir e, em falha de
instalacao, tenta remover o servico e restaurar a ACL anterior. A
desinstalacao remove o servico mas nao apaga o estado. Com
`-StartAfterInstall`, o sucesso requer `GET /health/live` local.

Estes comandos ainda precisam ser executados primeiro em Windows limpo ou
VM descartavel com um WinSW autentico e versionado. O projeto nao executa
automaticamente `Install`/`Uninstall` durante build, teste ou atualizacao.

## Autenticidade externa opcional (F7-06)

O SHA-256 registrado no manifesto detecta arquivos alterados em relacao
ao **proprio manifesto**, mas um invasor poderia substituir ambos. Para
autenticar a origem existe agora um procedimento **offline e explicito**
de assinatura destacada Ed25519. Ele exige chaves criadas e mantidas
por um operador de confianca **fora do repositorio e do release**.
O LAO **nao** gera nem distribui uma chave de producao automaticamente.

Execute os scripts abaixo **sempre de um checkout do LAO previamente
confiavel**, nao de um release recebido de terceiros. O operador precisa
obter o PEM publico por um canal confiavel e confirmar sua identidade;
um PEM fornecido junto ao pacote sem essa verificacao nao estabelece
autenticidade. Exemplo com caminhos absolutos ilustrativos:

```cmd
node src/lao/release-auth-sign.mjs --dir C:\TEMP\lao-portable-novo --key C:\CHAVES\lao-ed25519-private.pem --out C:\TEMP\lao-portable.sig.json
node src/lao/release-auth-verify.mjs --dir C:\TEMP\lao-portable-novo --signature C:\TEMP\lao-portable.sig.json --public-key C:\CHAVES\lao-ed25519-public-CONFIAVEL.pem
```

O assinador verifica primeiro a integridade do candidato e produz
assinatura do conteudo exato de `RELEASE_MANIFEST.json`, incluindo
fingerprint SHA-256 da chave publica. O verificador confere a assinatura
Ed25519 com a **chave publica independente** e, depois, os arquivos
listados no manifesto. Ambos rejeitam chave/assinatura guardadas dentro
do release; o arquivo de assinatura nao pode ser sobrescrito.
Testes de chaves temporarias exercitam sucesso, chave trocada,
assinatura adulterada, manifesto alterado e arquivos alterados.

**Isto nao e code signing de executaveis do Windows** nem instala
automaticamente o pacote; tambem nao substitui uma cadeia de distribuicao
confiavel, controle de acesso a chave privada, politica de rotacao,
instalador que exija assinatura valida e teste operacional em maquina limpa.
As etapas acima sao opcionais e nao instalam servicos ou modificam boot.

## Gates faltantes

Validar WinSW real em VM descartavel, instalacao e desinstalacao,
healthcheck, paradas/restart, ACLs de conta dedicada sem privilegios
administrativos, backup/rollback de SQLite, assinatura, runtime Node
no instalador e teste de maquina limpa. A instalacao no Windows
estavel requer autorizacao operacional EXPLICITA.
Nao instalar sob LocalSystem por padrao para executar tarefas
envolvendo arquivos nao confiaveis.
