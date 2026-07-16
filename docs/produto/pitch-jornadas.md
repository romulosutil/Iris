# Iris — Produto, Arquitetura e Jornadas de Usuário

Este documento serve como base de conhecimento (Pitch Deck / Contexto de Produto) para explicar o que é o **Iris**, o problema que ele resolve, como sua arquitetura foi desenhada para o mercado B2B (Clínicas) e quais são as jornadas de cada persona dentro do sistema.

---

## 1. O Problema e a Proposta de Valor

O **Iris** é um SaaS B2B desenvolvido para clínicas de terapia infantil (focado inicialmente em intervenções para o Transtorno do Espectro Autista - TEA). 

### O Problema do Mercado
Hoje, as clínicas sofrem com um modelo insustentável de gestão de dados clínicos:
1. **Burnout dos Terapeutas:** Profissionais passam horas não-remuneradas preenchendo planilhas analógicas ou prontuários complexos após uma rotina exaustiva de atendimentos.
2. **Perda de Rastreabilidade:** Os dados clínicos muitas vezes são registrados de memória, dias após a sessão, gerando perda da precisão da evolução da criança.
3. **Glosa de Convênios de Saúde:** Clínicas perdem dinheiro porque não conseguem comprovar com dados estruturados e dossiês precisos que a terapia está gerando evolução real no paciente, levando as operadoras de saúde a cortarem ou negarem o pagamento das sessões.

### A Solução Iris
A proposta de valor do Iris é: *"Chegue na avaliação com o dossiê pronto"*.
O sistema substitui as planilhas complexas por um **diário de sessão em texto livre (linguagem natural)**. A partir desse texto simples, uma IA especializada (Claude 3.5) **extrai** as evidências clínicas estruturadas automaticamente. A IA atua puramente como assistente; o terapeuta revisa e o coordenador assina. A fricção burocrática desaparece, e os dados viram gráficos e relatórios para os convênios.

---

## 2. O Cliente Real: A Clínica e a Arquitetura Multi-Tenant

Para que o Iris funcione como um produto B2B seguro, ele foi desenhado em uma arquitetura **Multi-Tenant (Múltiplos Inquilinos)**.

* **O Tenant Raiz:** O cliente real que contrata e paga o Iris é a **Clínica**.
* **Isolamento de Dados (RLS):** Todo dado sensível (pacientes, sessões, relatórios) pertence a uma única Clínica. Usando um recurso avançado de banco de dados chamado Segurança em Nível de Linha (RLS do PostgreSQL), garantimos que é fisicamente impossível para um profissional da Clínica A acessar os dados de um paciente da Clínica B.
* **Segurança LGPD:** A privacidade dos dados de menores é tratada no nível estrutural, muito acima do código da interface.

---

## 3. As Personas e as Suas Jornadas

O ecossistema do Iris atende diferentes papéis dentro da clínica. Cada persona tem uma jornada e permissões estritas. Nenhum deles é o paciente final (a criança).

### A. A Recepção (Jornada Administrativa)
A recepção atua como a porta de entrada da clínica, focada em burocracia e compliance, sem qualquer acesso ao histórico clínico do paciente.
* **Jornada:** A recepção cria a "Ficha do Paciente" inicial. Ela cadastra os dados de contato, detalhes do convênio médico e, obrigatoriamente, assinala os **Consentimentos da LGPD** (autorização dos pais para tratamento de dados do menor e uso de IA).
* **Restrição:** Sem esse cadastro administrativo prévio e o aceite da LGPD, os profissionais clínicos sequer conseguem iniciar o protocolo do paciente.

### B. O Coordenador Clínico (Jornada Desktop / Gestão)
O coordenador é a mente analítica da clínica. Ele foca no planejamento de longo prazo, auditoria de qualidade e prestação de contas. Seu ambiente é o computador (Desktop-first).
* **Jornada de Setup:** Assim que a recepção cadastra o paciente, o Coordenador assume. Ele constrói o perfil clínico, cria o PEI (Plano de Ensino Individualizado), define os protocolos de tratamento (como VB-MAPP ou Denver) e cadastra as metas clínicas de evolução.
* **Jornada de Monitoramento:** Ele monta a "Equipe de Cuidado", delegando quais terapeutas atenderão a criança.
* **Jornada de Auditoria e Relatórios:** No final do ciclo (mensal/semestral), ele usa o Iris para auditar as evidências coletadas pela equipe e gerar os **Dossiês de Convênio** e os relatórios narrativos para a família da criança, garantindo que a clínica comprove o progresso e seja remunerada.

### C. O Terapeuta (Jornada Mobile / Linha de Frente)
O terapeuta é o executor. Trabalha sob alta pressão, atendendo crianças uma atrás da outra. Sua ferramenta é o celular (Mobile-first).
* **Jornada da Agenda:** Ele acessa o Iris no celular e vê apenas a sua "Agenda do Dia" e as suas pendências, referente unicamente aos pacientes da sua Equipe de Cuidado.
* **Jornada de Atendimento:** Após ou durante a sessão, ele faz o "Check-in" e narra o diário clínico em texto livre (ou por áudio, no futuro).
* **Jornada de Revisão (Com IA):** A IA do Iris processa esse diário. O terapeuta então abre o aplicativo para revisar o que a IA extraiu. A interface foi desenhada no modelo "Espectro Brutal", obrigando o terapeuta a expandir os cartões e validar criticamente cada sugestão, impedindo aprovações automáticas cegas. Com 3 ou 4 toques na tela, o prontuário está assinado, estruturado e salvo.

---

## 4. O Impacto Estratégico

Ao integrar essas três jornadas (Recepção -> Coordenação -> Terapia), o Iris cria um **círculo virtuoso**:
1. A clínica atinge conformidade total com a LGPD.
2. O terapeuta recupera a sua saúde mental e seu tempo livre.
3. O coordenador tem visibilidade em tempo real sobre a eficácia dos tratamentos.
4. O dono da clínica elimina as perdas financeiras (glosas) entregando dossiês impecáveis aos convênios médicos.
