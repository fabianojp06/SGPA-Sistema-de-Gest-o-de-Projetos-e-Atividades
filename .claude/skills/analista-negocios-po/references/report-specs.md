# Report Specs — SGPA
 
Templates de especificação para dashboards, relatórios, exportações e pautas de reunião
geradas automaticamente pelo sistema.
 
---
 
## Template de Especificação de Relatório / Dashboard
 
```
## [REL-NNN] — [Nome do Relatório/Dashboard]
 
**Módulo:** [Projetos / Atividades / Card WIN / Pautas]
**Tipo:** Tela / Exportação PDF / Exportação DOCX / Painel (dashboard) em tempo real
**Periodicidade:** Sob demanda / Diário / Semanal / Realtime (Supabase Realtime)
**Perfis com acesso:** [admin / director / coordinator / technician]
 
### Filtros disponíveis
 
| Filtro         | Tipo          | Obrigatório | Valor padrão               |
|----------------|---------------|-------------|-------------------------------|
| Período        | Date range    | Sim         | Semana atual                |
| Projeto        | Seleção múltipla | Não      | Todos (respeitando RBAC)    |
| Status         | Checkbox      | Não         | Todos                       |
| Responsável    | Busca textual | Não         | —                           |
 
### Colunas / Campos do Relatório
 
| # | Campo            | Origem (model.campo)      | Formato             | Total? |
|---|------------------|------------------------------|----------------------|--------|
| 1 | Título Atividade | `Activity.title`          | Texto               | —      |
| 2 | Projeto          | `Project.name`             | Texto               | —      |
| 3 | Responsável      | `User.name` (via assignedToId) | Texto          | —      |
| 4 | Prazo            | `Activity.dueDate`         | DD/MM/AAAA          | —      |
| 5 | Progresso        | `Activity.progress`        | 0–100%              | Média  |
| 6 | Status           | `Activity.status`          | Badge               | —      |
| 7 | Dias em atraso   | `hoje − dueDate` (se status ≠ DONE e dueDate < hoje) | Número | —  |
 
### Totalizadores
 
- Progresso médio no rodapé, quando aplicável
- Contagem por status agrupada (ex: X A Fazer, Y Em Andamento, Z Concluídas)
 
### Comportamento de exportação
 
- **PDF/DOCX (Pauta):** Cabeçalho com tipo de reunião, data, participantes esperados, gerado por IA
- **CSV (relatório de atividades):** Primeira linha = cabeçalhos; datas em ISO 8601
- Volumes > 1.000 registros: executar em background com notificação ao concluir
- Arquivo disponível para download por 24h (Supabase Storage)
 
### Critérios de Aceite do Relatório
 
```gherkin
Dado que existem 5 atividades atrasadas no projeto selecionado
  E o usuário possui perfil "coordinator"
Quando o usuário aplica o filtro "Este mês" e clica em "Gerar"
Então as 5 atividades atrasadas são exibidas na tela
  E os dias de atraso são calculados corretamente a partir da data atual
  E o botão "Exportar CSV" gera um arquivo com os mesmos dados filtrados
 
Dado que o período não possui atividades
Quando o usuário aplica o filtro e clica em "Gerar"
Então a tela exibe "Nenhum registro encontrado para o período selecionado"
  E os botões de exportação ficam desabilitados
```
```
 
---
 
## Dashboards e Relatórios do SGPA
 
### REL-001 — Dashboard Executivo (Diretor)
 
Fonte: EP-05, US-026. Perfis com acesso: `director`, `admin`.
 
Colunas/blocos obrigatórios:
| Bloco                       | Fórmula / Origem                                          |
|-------------------------------|---------------------------------------------------------------|
| Total de projetos ativos    | `count(Project where status=ACTIVE and deletedAt=null)`     |
| Projetos críticos           | Projetos com ≥ 1 `Risk` de nível `HIGH`/`CRITICAL` em `OPEN` |
| **% Entrega no prazo (SLA)**| `count(Activity DONE, completedAt <= dueDate) / count(Activity DONE) × 100` |
| Progresso médio do portfólio| Média de `Project.progress` entre projetos ativos            |
| Escalações abertas          | `count(Win where escalated=true and status != DONE)`         |
 
---
 
### REL-002 — Dashboard do Coordenador
 
Fonte: EP-05, US-025. Perfis: `coordinator`, `director`, `admin`.
 
- Status de todos os projetos sob gestão do coordenador
- Índice de entrega da equipe: % de atividades concluídas no prazo por colaborador
- Filtro por período, projeto, responsável (US-030)
 
---
 
### REL-003 — Heatmap de Carga de Trabalho
 
Fonte: EP-05, US-029.
 
| Campo               | Descrição                                                     |
|------------------------|--------------------------------------------------------------|
| Colaborador          | `User.name`                                                    |
| Atividades ativas    | `count(Activity where assignedToId=user and status IN (TODO,IN_PROGRESS))` |
| Carga relativa        | Comparação normalizada entre colaboradores da mesma área      |
| Cor                    | Verde (baixa) → Âmbar (média) → Vermelho (sobrecarga)        |
 
---
 
### REL-004 — Pauta de Reunião (gerada por IA)
 
**Fonte:** EP-06 — US-031 a US-035. Geração via Anthropic API (claude-sonnet-4-6) a partir
de dados reais do sistema — nunca texto genérico.
 
| Tipo de reunião | Conteúdo da pauta gerada                                                |
|-------------------|--------------------------------------------------------------------------|
| Daily            | Orientações pendentes + WINs do dia de cada colaborador                 |
| Semanal          | WINs da semana + riscos abertos + pedidos de ajuda + revisão do plano de ação |
| Quinzenal        | Revisão completa do Plano de Ação (PLA-DEP-2026-001)                    |
| Mensal           | Eventos próximos (~4 semanas) + plano de ação + assuntos diversos       |
| One-One          | Histórico de WINs do colaborador no período + feedbacks registrados     |
 
A pauta é persistida em `Meeting.agenda` (JSON) e exportável em PDF/DOCX (US-043). A ata
(`Meeting.minutes`) e as decisões (`Meeting.decisions`) são registradas após a reunião e
vinculadas ao projeto correspondente (US-044).
 
**Critério de aceite — geração de pauta semanal:**
```gherkin
Dado que existem WINs registrados na semana atual para 4 colaboradores da equipe
  E existem 2 riscos com status "OPEN"
  E existe 1 pedido de ajuda pendente
Quando o Coordenador aciona "Gerar Pauta Semanal"
Então o sistema monta um prompt estruturado com os dados reais (WINs, riscos, pedidos de ajuda)
  E envia à Anthropic API para geração do texto da pauta
  E a pauta é salva em `Meeting.agenda` associada a `type=WEEKLY`
  E a tela exibe a pauta gerada em menos de 2 minutos, editável antes da reunião
```
 
---
 
### REL-005 — Log de Auditoria (Trilha de Auditoria)
 
Acesso restrito: perfil `admin` e `director` (RN-15, ver matriz de acesso).
 
Exibe todas as alterações críticas registradas em `AuditLog`:
- Data/hora, usuário, entidade afetada, ação (`CREATED/UPDATED/DELETED/STATUS_CHANGED/DEADLINE_CHANGED`),
  `before`, `after`
- Filtro por: entidade, usuário, período, tipo de ação
- Exportação CSV disponível
- Registros imutáveis — sem opção de editar ou excluir na interface (RN-15)
 
---
 
## Padrão de Formatação de Valores no SGPA
 
| Contexto              | Formato                     | Exemplo              |
|--------------------------|--------------------------------|------------------------|
| Progresso (tela)       | `NNN%`                       | `72%`                 |
| Prazo (tela)            | `DD/MM/AAAA`                 | `15/09/2026`           |
| Prazo (CSV/export)     | ISO 8601                     | `2026-09-15`            |
| Status (tela)           | Badge colorido + ponto       | Badge azul "Em Andamento" |
| Semana (Card WIN)       | `Semana NN/AAAA`             | `Semana 32/2026`        |
| Dias de atraso          | Número inteiro + rótulo       | `5 dias em atraso`      |
 
Locale: `pt-BR`. Fuso horário: `America/Sao_Paulo` (BRT) para todos os timestamps exibidos
ao usuário; armazenamento em UTC no banco.
