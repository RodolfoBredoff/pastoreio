# Publicação na Play Store como TWA (Trusted Web Activity)

Este documento cobre **todo o processo externo ao código** necessário para publicar o Pastoreio na Google Play Store como um app Android nativo usando TWA.

> **O que já foi feito no código:**
> - `public/.well-known/assetlinks.json` criado com placeholders (requer preenchimento após gerar o keystore)
> - PWA já configurado com `manifest.json`, service worker e ícones via `next-pwa`

---

## O que é um TWA?

Um **Trusted Web Activity** é um wrapper Android que abre seu PWA dentro do Chrome, sem barra de endereços, dando a aparência de um app nativo. O app na Play Store é um APK/AAB mínimo (~1 MB) que apenas aponta para o seu domínio. Todas as atualizações de conteúdo são automáticas — não é necessário publicar nova versão na loja para mudanças no sistema.

**Requisitos para funcionar corretamente:**
1. O domínio deve ter HTTPS válido
2. O `manifest.json` deve ter ícones de pelo menos 192×192 e 512×512 px
3. O arquivo `assetlinks.json` deve estar acessível no servidor com o fingerprint correto do keystore
4. O Chrome no dispositivo do usuário deve ter versão 72 ou superior

---

## Checklist Geral

- [ ] Pré-requisitos instalados na máquina (JDK, Node, Bubblewrap)
- [ ] Keystore gerado e salvo com segurança
- [ ] SHA256 do keystore copiado
- [ ] `assetlinks.json` atualizado no repositório com package name e SHA256
- [ ] Deploy feito — arquivo `/.well-known/assetlinks.json` acessível via HTTPS
- [ ] Digital Asset Links verificado com a ferramenta do Google
- [ ] Projeto TWA gerado pelo Bubblewrap
- [ ] APK testado em dispositivo físico sem barra de endereços
- [ ] Conta Google Play Console criada ($25)
- [ ] Capturas de tela preparadas (mínimo 2, máximo 8)
- [ ] Ícone do app (512×512 PNG, sem transparência)
- [ ] Texto de descrição curta (80 caracteres) e longa (4.000 caracteres)
- [ ] `.aab` gerado e enviado à Play Store
- [ ] Aprovação pela Google (3–7 dias úteis)

---

## Parte 1 — Preparação do Ambiente Local

### 1.1 Instalar Java JDK 17+

O Bubblewrap precisa do Java para assinar o APK.

**macOS (Homebrew):**
```bash
brew install openjdk@17
echo 'export PATH="/opt/homebrew/opt/openjdk@17/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
java -version   # deve exibir: openjdk version "17..."
```

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install openjdk-17-jdk
java -version
```

**Windows:** Baixe o instalador em [adoptium.net](https://adoptium.net/)

---

### 1.2 Instalar o Android SDK Command-line Tools

O Bubblewrap precisa das `build-tools` do Android para gerar o APK.

**macOS / Linux:**
```bash
# Baixar e instalar Android command-line tools
mkdir -p ~/android-sdk/cmdline-tools
cd ~/android-sdk/cmdline-tools

# Baixe o arquivo em: https://developer.android.com/studio#command-line-tools-only
# Extraia e renomeie a pasta para "latest"
unzip commandlinetools-*.zip
mv cmdline-tools latest

# Adicionar ao PATH
echo 'export ANDROID_HOME=$HOME/android-sdk' >> ~/.zshrc
echo 'export PATH=$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH' >> ~/.zshrc
source ~/.zshrc

# Aceitar licenças e instalar ferramentas necessárias
sdkmanager --licenses
sdkmanager "build-tools;34.0.0" "platform-tools" "platforms;android-34"
```

---

### 1.3 Instalar o Bubblewrap CLI

```bash
npm install -g @bubblewrap/cli
bubblewrap --version   # deve exibir: 1.x.x
```

---

## Parte 2 — Gerar o Keystore

O keystore é o certificado que assina o APK. **Guarde-o com segurança — você precisará dele para todas as atualizações futuras na Play Store. Perder o keystore significa não poder mais atualizar o app.**

### 2.1 Gerar o keystore

```bash
# Crie uma pasta para o projeto TWA (fora do repositório)
mkdir ~/twa-pastoreio && cd ~/twa-pastoreio

# Gerar keystore
keytool -genkey -v \
  -keystore android.keystore \
  -alias android \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

Durante a execução, preencha:
- **First and last name:** seu nome ou nome da organização
- **Organizational unit:** Pastoreio
- **Organization:** nome da sua igreja/organização
- **City or Locality:** sua cidade
- **State or Province:** seu estado (ex: SP)
- **Country Code:** BR
- **Keystore password:** crie uma senha forte (anote-a)
- **Key password:** pode ser a mesma senha do keystore

> ⚠️ **Salve o arquivo `android.keystore` e a senha em local seguro** (ex: cofre de senhas, Google Drive criptografado, AWS Secrets Manager). Você precisará deles para toda atualização futura.

---

### 2.2 Obter o SHA256 do keystore

```bash
keytool -list -v \
  -keystore android.keystore \
  -alias android
```

Na saída, copie o valor de **SHA256**, que tem o formato:
```
AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99
```

---

## Parte 3 — Atualizar o assetlinks.json no Repositório

Edite o arquivo `public/.well-known/assetlinks.json` no repositório com os dados reais:

```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "com.suaigreja.pastoreio",
    "sha256_cert_fingerprints": ["AA:BB:CC:DD:EE:FF:..."]
  }
}]
```

Substitua:
- `com.suaigreja.pastoreio` → seu package name único (ex: `com.igrejabetania.pastoreio`). **Não pode ser alterado depois de publicado.**
- `AA:BB:CC:DD:...` → o SHA256 copiado no passo anterior (com os dois-pontos)

Faça commit e push para que o deploy seja feito:

```bash
git add public/.well-known/assetlinks.json
git commit -m "chore(twa): atualizar assetlinks.json com package name e SHA256"
git push origin main
```

Aguarde o deploy completar (GitHub Actions). Depois, verifique se o arquivo está acessível:

```bash
curl https://SEU_DOMINIO/.well-known/assetlinks.json
```

---

## Parte 4 — Verificar o Digital Asset Link

Acesse a URL abaixo no navegador (substituindo seu domínio) para confirmar que o Google consegue validar:

```
https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://SEU_DOMINIO&relation=delegate_permission/common.handle_all_urls
```

A resposta deve conter `"complete": true` e listar o seu package name.

Alternativamente, use a ferramenta visual do Google:
👉 [developers.google.com/digital-asset-links/tools/generator](https://developers.google.com/digital-asset-links/tools/generator)

**Se o arquivo não for encontrado ou o SHA256 estiver errado, o app abrirá com a barra de endereços** — o indicativo visual de que a verificação falhou.

---

## Parte 5 — Gerar o Projeto TWA com Bubblewrap

```bash
cd ~/twa-pastoreio

bubblewrap init --manifest https://SEU_DOMINIO/manifest.json
```

O Bubblewrap vai baixar o `manifest.json` e fazer perguntas. Use os valores abaixo como referência:

| Pergunta | Valor sugerido |
|---|---|
| Application name | Pastoreio |
| Short name | Pastoreio |
| Package name | `com.suaigreja.pastoreio` (mesmo do assetlinks.json) |
| App version code | `1` |
| App version name | `1.0.0` |
| Start URL | `/dashboard` |
| Display mode | `standalone` |
| Orientation | `portrait` |
| Status bar color | `#ffffff` (ou a cor primária do app) |
| Navbar color | `#ffffff` |
| Splash screen color | `#ffffff` |
| Splash screen fade-out duration | `300` |
| Enable notification delegation | `No` (por ora) |
| Signing key path | `./android.keystore` |
| Signing key alias | `android` |
| Signing key store password | (a senha do keystore) |
| Signing key password | (a senha da key) |

---

## Parte 6 — Build do APK e AAB

```bash
cd ~/twa-pastoreio

# Build para publicação (gera .aab para a Play Store)
bubblewrap build
```

Arquivos gerados na pasta `app/build/outputs/`:
- `app-release-signed.apk` → para testar em dispositivo físico
- `app-release-bundle.aab` → para upload na Play Store (obrigatório desde ago/2021)

---

## Parte 7 — Testar em Dispositivo Físico

Antes de publicar, teste o APK:

```bash
# Instalar via ADB (Android Debug Bridge)
adb install app/build/outputs/apk/release/app-release-signed.apk
```

**O que verificar:**
- [ ] O app abre **sem barra de endereços** (confirma que o `assetlinks.json` está correto)
- [ ] A splash screen aparece com as cores certas
- [ ] A navegação funciona normalmente
- [ ] O app pede permissão de notificação ao entrar em Minha Conta
- [ ] O botão voltar funciona como esperado

> Se a barra de endereços aparecer, revise o `assetlinks.json` — o SHA256 ou package name podem estar incorretos.

---

## Parte 8 — Criar a Conta de Desenvolvedor na Play Store

1. Acesse [play.google.com/console](https://play.google.com/console)
2. Faça login com a conta Google que será a conta **permanente** do desenvolvedor
3. Clique em **Começar** e pague a taxa única de **US$ 25**
4. Preencha o perfil de desenvolvedor (nome, e-mail de contato, telefone)
5. Aguarde a aprovação da conta (pode levar até 48 horas)

> Use uma conta Google da organização/igreja — não uma conta pessoal, se possível.

---

## Parte 9 — Preparar os Assets da Play Store

A Play Store exige as seguintes imagens antes de publicar:

| Asset | Tamanho | Formato | Notas |
|---|---|---|---|
| Ícone do app | 512 × 512 px | PNG, sem transparência | Alta resolução |
| Feature graphic | 1024 × 500 px | JPG ou PNG | Imagem de destaque na loja |
| Capturas de tela | 320–3840 px cada lado | JPG ou PNG | Mínimo 2, máximo 8 |

**Dicas:**
- O ícone não pode ter cantos arredondados (a Play Store arredonda automaticamente)
- As capturas de tela devem mostrar o app em uso — tire na tela do dispositivo físico ou use um emulador
- A feature graphic aparece na página do app na loja

---

## Parte 10 — Publicar na Google Play Console

1. Acesse [play.google.com/console](https://play.google.com/console) → **Criar aplicativo**
2. Preencha:
   - Nome do app: **Pastoreio**
   - Idioma padrão: **Português (Brasil)**
   - App ou jogo: **App**
   - Pago ou gratuito: **Gratuito**
3. Aceite as políticas e clique em **Criar app**

### 10.1 Ficha da loja (obrigatório antes de publicar)

Em **Crescimento > Ficha da Play Store**:
- **Título:** Pastoreio
- **Descrição curta (80 caracteres):** Gestão de pequenos grupos — presenças, aniversários e pastoreio
- **Descrição completa (até 4.000 caracteres):** descreva as funcionalidades do sistema
- **Ícone do aplicativo:** upload do PNG 512×512
- **Feature graphic:** upload do JPG/PNG 1024×500
- **Capturas de tela do celular:** mínimo 2 imagens
- **Categoria:** Negócios ou Estilo de vida
- **E-mail de contato:** e-mail da organização

### 10.2 Classificação de conteúdo

Em **Políticas > Classificação de conteúdo**:
- Responda o questionário — para este app, todas as respostas serão "Não"
- A classificação resultante será **Livre (L)**

### 10.3 Política de privacidade

Em **Políticas > Privacidade e segurança do aplicativo**:
- Adicione a URL de uma página de política de privacidade
- Se não tiver uma, crie uma página simples no domínio (ex: `/politica-de-privacidade`) explicando quais dados são coletados e como são usados

### 10.4 Enviar a versão

Em **Versões > Produção > Criar nova versão**:
1. Clique em **Carregar** e envie o arquivo `.aab`
2. Aguarde o processamento (alguns minutos)
3. Em **Notas da versão**, escreva: `Versão inicial do Pastoreio`
4. Clique em **Salvar** e depois **Revisar versão**
5. Se tudo estiver OK, clique em **Iniciar lançamento para Produção**

> A primeira publicação passa por revisão humana da Google, que pode levar de 3 a 7 dias úteis.

---

## Atualizações Futuras

### Atualizar conteúdo do app
Basta fazer deploy da nova versão do PWA — o TWA sempre carrega a versão mais recente do site. **Nenhuma ação necessária na Play Store.**

### Atualizar o app na Play Store
Necessário apenas se mudar o `manifest.json`, ícones, `start_url` ou configurações do TWA:

```bash
cd ~/twa-pastoreio

# Atualizar version code e version name no arquivo twa-manifest.json
# (edite "appVersionCode" e "appVersionName")

bubblewrap build

# Enviar o novo .aab na Play Console > Versões > Produção > Nova versão
```

---

## Troubleshooting

### App abre com barra de endereços
- O `assetlinks.json` não está correto ou não está acessível
- Verifique: `curl https://SEU_DOMINIO/.well-known/assetlinks.json`
- Confirme que o SHA256 no arquivo é idêntico ao do keystore
- Confirme que o package name é idêntico no `assetlinks.json` e no app

### Bubblewrap não encontra o manifest.json
- O domínio deve estar em produção com HTTPS válido
- Verifique: `curl https://SEU_DOMINIO/manifest.json`

### Erro de assinatura no build
- Confirme que o caminho e a senha do keystore estão corretos no `twa-manifest.json`

### App não aceito pela Play Store
- Verifique se a política de privacidade está acessível
- Certifique-se de que as capturas de tela mostram o app em funcionamento (não uma tela em branco)
- Responda à solicitação de mais informações da Google dentro do prazo

---

## Recursos Úteis

- [Bubblewrap CLI — GitHub](https://github.com/GoogleChromeLabs/bubblewrap)
- [Guia TWA — web.dev](https://web.dev/trusted-web-activity/)
- [Digital Asset Links — Google](https://developers.google.com/digital-asset-links)
- [Google Play Console](https://play.google.com/console)
- [Verificador de Asset Links](https://developers.google.com/digital-asset-links/tools/generator)
- [PWA Builder (alternativa ao Bubblewrap)](https://www.pwabuilder.com/)
