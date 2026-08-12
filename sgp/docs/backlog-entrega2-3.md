# Backlog priorizado — Entrega 2 & 3 (EP-05 / EP-06)

Artefato visual com o roadmap das 10 ondas pós-MVP (dashboards por perfil + pauta de reunião
gerada por IA), status de cada onda e histórias de usuário associadas.

🔗 **Artifact:** https://claude.ai/code/artifact/26546253-618d-4bf8-b21d-584ba50830c4

Gerado em 2026-08-12 a partir do backlog sequenciado pela skill `analista-negocios-po`
(ver memória de projeto `project_sgpa_backlog_entrega2_3.md`).

Status em 2026-08-12: **roadmap completo — Ondas 1–10, Entrega 2 (EP-05) e Entrega 3 (EP-06)
100% concluídas e em produção.** RN-17 documenta a decisão de não criar tabela `PlanoDeAcao` —
`Win.escalated` (RN-09) é a fonte formal, complementada por `Meeting.decisions` (Onda 9).
Commits: `a5c4782` `1025b92` `417bbe9` `ba26e8a` `89b182e` `cd084b8` `66f6645` `3125af7`
`43c1312` `4377f52`.

Pendência da Onda 7 ("não apareceu em produção") foi diagnosticada: não era bug — o usuário
testava pela URL de deployment (`-<hash>.vercel.app`) em vez do domínio de produção
(`sgpa-sistema-de-gest-o-de-projetos.vercel.app`), que o Clerk live não reconhece. Ver
memória `project_sgpa_clerk_migration.md`, Armadilha 6.
