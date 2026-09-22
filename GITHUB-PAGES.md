# GAV Kids no GitHub Pages

## Estado atual

O frontend agora fala com a API real do Apps Script (`apps-script/Code.gs` v3): login, logout, recuperação e redefinição de senha, check-in de criança em tempo real (nome, idade/gênero, TEA, deficiência, lanche, banheiro, restrição alimentar) com idempotência, correções com controle de versão, histórico, filtros, exportações e administração de usuários/salas. Não há mais seletor de perfil livre nem dados fictícios — tudo depende de login autenticado pelo backend. Ver "Retomada de 22/09/2026, parte 2" em `../CONTEXTO-E-PENDENCIAS.md` para o que mudou nesta versão (inclusive o aviso de LGPD sobre dados de crianças).

O que **ainda não foi validado** é a implantação real na sua conta Google e o funcionamento do CORS no domínio final do GitHub Pages, porque a URL `/exec` da sua implantação ainda não foi fornecida nesta conversa. Veja "O que falta para operar de verdade" no fim deste arquivo.

## Publicação

1. Suba este projeto (pasta `projeto/`) no repositório de destino.
2. Em Settings > Pages, selecione "GitHub Actions" como origem.
3. Em Actions, execute manualmente o fluxo "Publicar GAV Kids no GitHub Pages" (`workflow_dispatch`).
4. **Depois que o site estiver publicado**, edite o arquivo `config.json` que fica na raiz do site publicado (ele nasce de `public/config.json`) e preencha:

   ```json
   { "apiUrl": "https://script.google.com/macros/s/SEU_ID/exec" }
   ```

   Você pode editar esse arquivo direto pela interface do GitHub (não precisa recompilar nem rodar o workflow de novo) ou reeditar `public/config.json` no repositório e rodar o build de novo — os dois caminhos funcionam. Enquanto `apiUrl` estiver vazio, o site mostra uma tela avisando que falta configurar, em vez de travar ou fingir que funciona.

O fluxo instala as versões do `pnpm-lock.yaml` e publica somente a pasta `out/`. O disparo é manual de propósito. Build local: `pnpm build:pages` (usa Node ≥22.13; o workflow usa Node 24). A saída fica em `out/`, com `index.html` e os assets juntos — é exatamente essa pasta que deve ir ao ar, sem separar os arquivos.

## Dispositivos móveis

Viewport adaptável, sem bloquear zoom, inputs de pelo menos 16px (evita zoom automático do iOS) e pelo menos 44px de altura de toque, layout de uma coluna em celulares, áreas seguras do iPhone (notch/home indicator) e respeito à preferência de movimento reduzido. Testado neste ambiente com navegador automatizado em 320px, 390px, 1280px sem rolagem horizontal — incluindo os 3 passos do novo check-in por criança e a lista ao vivo de crianças do turno — **não houve teste em aparelho físico real**.

## O que falta para operar de verdade

1. **Implantar o Apps Script v3** na sua conta (siga o cabeçalho de `apps-script/Code.gs`) e me enviar a URL `/exec`. Sem ela, o site fica preso na tela "backend não configurado". Se você já tinha implantado a v2 antes, veja o aviso no cabeçalho do arquivo sobre a aba `GAV_Eventos` precisar ser recriada (não há migração automática de total/counts para o novo formato por criança).
2. **Confirmar CORS/entrega no domínio real do GitHub Pages.** O contrato foi desenhado para evitar preflight (POST com `Content-Type: text/plain;charset=utf-8`, sem `Authorization` header), o que costuma funcionar direto com Apps Script + fetch de outro domínio — mas isso só se confirma testando no ar, não em teoria. Se o navegador bloquear, o site mostrará a mensagem de erro de rede em vez de fingir sucesso; nesse caso me avise com o erro exato para decidirmos um proxy.
3. Depois disso, testar com usuários reais (um de cada papel) direto no GitHub Pages publicado, inclusive em celular.

Não há credenciais Google, senhas nem tokens no repositório ou no JavaScript entregue ao navegador.
