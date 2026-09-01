# Iris — Acesso programático (auth.md)

Este documento descreve como sistemas automatizados podem interagir com o
conteúdo público do Iris. **Não há, hoje, API pública de leitura de dado de
paciente ou de dossiê clínico** — todo dado clínico do Iris é protegido por
autenticação humana (login de terapeuta/coordenador da clínica) e pela
governança em 3 camadas descrita em [irisclinica.ia.br](https://irisclinica.ia.br):
IA sugere evidência, terapeuta aprova, coordenador valida por exceção.

## Conteúdo disponível para agentes e crawlers

- Página institucional e conteúdo de marketing: `/`, `/institucional`, `/sobre`
- Termos de uso e política de privacidade: `/termos`, `/privacidade`

## Descoberta técnica

- Catálogo de recursos: [/.well-known/api-catalog](/.well-known/api-catalog)
- Metadados do recurso protegido: [/.well-known/oauth-protected-resource](/.well-known/oauth-protected-resource)

## Login humano

O acesso ao produto (agenda, pacientes, diário, relatórios) exige
autenticação humana de um usuário da clínica. Não há fluxo de registro de
agente autônomo neste momento.
