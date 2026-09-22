# GAV Kids: estado de implementação

O frontend está integrado à API real do Apps Script v3 (`apps-script/Code.gs`). Não há mais dados fictícios nem seletor de perfil: entrar exige login válido contra o backend, e cada tela busca os dados de verdade (registros, usuários, salas) via `fetch`. Veja `CONTEXTO-E-PENDENCIAS.md` para o histórico completo de decisões (a seção "Retomada de 22/09/2026, parte 2" documenta a mudança de modelo desta versão) e `GITHUB-PAGES.md` para publicar.

**Mudança de modelo nesta versão**: o registro deixou de ser um total agregado por turno e passou a ser um check-in por CRIANÇA, feito em tempo real assim que ela chega — com nome, faixa etária/gênero de todas as crianças (antes só de quem tinha TEA), e quatro novos campos de cuidado (deficiência física, se pode oferecer lanche, orientação de banheiro, restrição alimentar), cada um com nota opcional. Não há perfil de criança reaproveitado entre visitas (cada atendimento é um cadastro novo) nem registro de saída/lotação simultânea (só entrada). Nome, deficiência e restrição alimentar são dados pessoais/sensíveis de menores (LGPD) — confirme com seu jurídico a base legal e o texto de consentimento antes de operar em produção; o código só aplica minimização de dados (sem documento/CPF, acesso restrito por sala/papel).

## Como o frontend fala com o backend

- `app/api.ts`: cliente único de todas as ações do contrato (login, logout, recover, resetPassword, me, records.list/save/history, admin.users/saveUser/rooms/saveRoom). Sempre confere `ok` na resposta; nunca usa `no-cors` ou JSONP.
- `app/config.ts` + `public/config.json`: a URL `/exec` é lida em tempo de execução (não fica embutida no build), então trocar de implantação não exige recompilar — só editar `config.json` no site publicado.
- `app/session.ts`: guarda `idToken` e os dados do usuário no `localStorage` do próprio celular (decisão consciente: o app fica salvo na tela inicial e é reaberto várias vezes ao dia; nunca guardamos a senha). `Sair` e a expiração de 8h limpam a sessão.
- `app/login.tsx`: login, recuperação por e-mail e redefinição de senha com código.
- `app/register.tsx`: check-in de UMA criança por vez, em 3 passos (Quem chegou → Cuidados → Revisão), ligado a `records.save`, com `requestId` estável por rascunho (reenviar depois de um erro de rede reaproveita o mesmo `requestId`, evitando duplicar o registro) e `version` para correções. Mostra uma lista ao vivo ("crianças já registradas nesta sala/turno", via `records.list`) só para conferência visual — não é editável ali; correções continuam pelo Histórico e gestão.
- `app/management.tsx`: dashboard por criança (contagens de TEA/deficiência/restrição alimentar, filtros de idade/gênero/TEA/turno aplicados pelo servidor), histórico/auditoria (`records.history`), e abas de administração (`admin.*`) só para quem tem papel `admin`.
- `app/exports.ts`: XLSX/PNG a partir dos dados reais por criança, com nomes de sala resolvidos por `roomId`.

## Adaptações entre o modelo antigo do frontend e a API

- A API identifica salas por `roomId`; o frontend passou a guardar `roomId` em todo lugar e só resolve o nome (`roomName()`) na hora de exibir/exportar.
- `createdBy`/`updatedBy` são `uid`, não nome. Só o administrador consegue resolver `uid → nome` (via `admin.users`); gestor e operador veem "Você" no próprio registro e um identificador curto nos demais — limitação da própria API, documentada na aba "Sistema" do painel admin.
- Papel (`role`) e salas (`roomIds`) vêm de `me` após o login, não mais de um seletor livre.
- O prazo de 7 dias para corrigir registros vale para operador/gestor; administrador pode corrigir qualquer data passada — a interface agora reflete isso (antes o protótipo restringia todo mundo a 7 dias).

## O que foi testado nesta etapa (registro por criança, v3)

- TypeScript (`tsc --noEmit`) sem erros; `pnpm build:pages` gerando `out/` normalmente.
- `node testes/registros.test.cjs` e `node testes/auth-local.test.cjs` (Google simulado) passando com o novo contrato.
- Simulei localmente um backend fiel ao contrato v3 de `Code.gs` (mesmas validações, mesmos códigos de erro, sem a checagem de sala/data/turno único que foi removida) e rodei o site publicado contra ele com um navegador automatizado, cobrindo: login de operador/gestor/admin, check-in completo de uma criança com todos os campos novos (TEA, deficiência+nota, lanche+nota, banheiro+nota, restrição alimentar+nota, nome, observação geral), uma segunda criança no mesmo turno/sala sendo aceita normalmente, a lista ao vivo "crianças já registradas neste turno" refletindo os check-ins, reenvio após queda de rede reaproveitando o `requestId` (sem duplicar), correção de um check-in existente pelo Histórico e gestão, filtros do dashboard (idade/gênero/TEA/turno) aplicados pelo servidor, prazo de 7 dias por papel (admin sem limite), exportação XLSX (reaberta com sucesso via `openpyxl`, colunas por criança e acentos corretos) e PNG, e ausência de rolagem horizontal em 320px/390px/1280px.
- **O que isso NÃO cobre**: a sua conta Google real, a implantação `/exec` de verdade, CORS no domínio real do GitHub Pages, bcrypt/MailApp/Sheets de produção, e nenhum aparelho físico. O simulador local não usa bcrypt nem Planilhas — só reproduz o mesmo contrato JSON para validar a lógica do frontend. Se você já tinha implantado a v2 (total/counts) e rodado `configurarGavKids`, veja o aviso no topo de `apps-script/Code.gs` sobre incompatibilidade de cabeçalho em `GAV_Eventos` — não há migração automática de dados antigos.

## Semântica de relatórios (mudou nesta versão)

Cada registro agora é o check-in de UMA criança, feito pela recreadora em tempo real assim que ela chega — não é mais um total agregado por turno. Idade, gênero e TEA são pedidos de toda criança (antes só de quem tinha TEA) e filtram diretamente a população, não mais uma soma isolada. Não há registro de saída: os números não representam lotação simultânea nem picos por horário, só a contagem de check-ins no período/filtro selecionado. Não existe perfil de criança reaproveitado entre visitas — uma mesma criança que volte em outro turno gera um novo cadastro, sem vínculo automático com o anterior. A exportação XLSX tem uma linha por criança, com todas as colunas (idade, gênero, TEA, deficiência+nota, lanche+nota, banheiro+nota, restrição alimentar+nota, observação geral). PNG resume automaticamente históricos muito grandes (acima de 250 linhas) para não estourar o `<canvas>` — use XLSX para o total completo nesses casos. PDF usa a impressão do navegador.

**LGPD**: nome da criança é dado pessoal; deficiência e restrição alimentar são dados sensíveis, com proteção reforçada por serem de menores (LGPD art. 5º, 11º e 14º). O código aplica minimização (sem documento/CPF, acesso restrito por sala/papel, sem perfil persistente), mas não define a base legal nem o texto de consentimento — isso depende do seu jurídico/DPO antes de operar em produção.
