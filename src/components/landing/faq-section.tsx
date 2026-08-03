"use client";

import React from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export function LandingFaqSection() {
  const faqs = [
    {
      id: "faq-1",
      question: "Como funciona a cobrança, exatamente?",
      answer:
        "Criar a conta da clínica, convidar a equipe inteira e manter o histórico não custa nada. Você paga por paciente ativo, e paciente ativo é o que está cadastrado e não arquivado — não contamos sessões, então recesso, férias e paciente em avaliação não mudam a fatura. Nos primeiros 7 dias não há cobrança de paciente nenhum, e o cadastro não pede cartão de crédito.",
    },
    {
      id: "faq-2",
      question: "Existe limitação no número de terapeutas, supervisores ou funcionários?",
      answer:
        "Não. Usuários são ilimitados. Psicólogos, fonoaudiólogos, terapeutas ocupacionais, coordenação e secretaria acessam o prontuário sem custo por assento ou licença. Isso é decisão de modelo, não promoção: a tese do produto é a equipe inteira trabalhando no mesmo prontuário, e cobrar por assento penalizaria exatamente o comportamento que precisamos induzir.",
    },
    {
      id: "faq-3",
      question: "E se a minha equipe não adotar?",
      answer:
        "É o risco número um de qualquer software clínico, e a razão de o registro aqui ser texto livre no celular em vez de planilha de tentativa: a terapeuta escreve como já escreve hoje, logo depois do atendimento. Não há taxonomia para decorar nem campo obrigatório para preencher. Nos primeiros 7 dias dá para testar exatamente isso com uma pessoa da equipe antes de envolver a clínica toda.",
    },
    {
      id: "faq-4",
      question: "A IA decide alguma coisa clínica?",
      answer:
        "Não, e isso é regra de arquitetura, não promessa de marketing. A extração lê o diário e sugere evidências ligadas às metas, mostrando de qual trecho cada uma saiu. Enquanto um profissional não aprovar, aquilo aparece marcado como candidato e não entra em gráfico, em pontuação de protocolo nem em relatório. Pontuar protocolo continua sendo ato de quem tem registro no conselho.",
    },
    {
      id: "faq-5",
      question: "O relatório é aceito pelo convênio?",
      answer:
        "Quem decide aceitar é a operadora, e nenhum software pode prometer isso — desconfie de quem promete. O que o Iris faz é remover a objeção mais barata que uma auditoria tem: o relatório sai acompanhado da origem de cada afirmação, com a frase do diário, a data e o autor. Discutir conteúdo clínico é uma conversa; alegar ausência de registro deixa de ser.",
    },
    {
      id: "faq-6",
      question: "Se eu arquivar um paciente ou sair do Iris, o que acontece com os prontuários?",
      answer:
        "Arquivar é decisão administrativa: tira o paciente da fatura e mantém o prontuário legível e exportável. É diferente de alta clínica, que é ato do profissional e dispara o prazo legal de guarda — separamos as duas de propósito, para que um clique comercial nunca mexa em prazo legal. A exportação integral em PDF e JSON fica disponível pela própria interface, a qualquer momento, sem abrir chamado.",
    },
    {
      id: "faq-7",
      question: "Há quanto tempo vocês existem? Quantas clínicas usam?",
      answer:
        "O Iris está entrando em operação agora, com as primeiras clínicas fundadoras. Não vamos inventar logotipo de cliente nem depoimento: o que oferecemos nesta fase é preço de fundador, acesso direto a quem constrói o produto e influência real na priorização. Se você precisa de um fornecedor com dez anos de estrada, ainda não somos nós — e é melhor você saber disso agora.",
    },
    {
      id: "faq-8",
      question: "Dá para trazer o histórico que já está em outro sistema?",
      answer:
        "Não há importação automática hoje. Na prática as clínicas começam pelos pacientes ativos e o histórico antigo continua acessível onde está. Para as primeiras clínicas nós ajudamos na carga inicial junto com você — é trabalho manual e assumido como tal.",
    },
  ];

  return (
    <section
      id="faq"
      aria-labelledby="faq-title"
      className="w-full py-16 sm:py-20 px-4 sm:px-8 lg:px-12 2xl:px-20 max-w-[1800px] mx-auto space-y-12"
    >
      <div className="max-w-4xl 2xl:max-w-5xl mx-auto space-y-10 sm:space-y-12">
        <div className="text-center space-y-3">
          <div className="inline-block font-mono text-xs font-bold uppercase bg-[var(--color-gold-tint,#FFE082)] px-3.5 py-1 rounded-[var(--radius-control,5px)] border-2 border-[var(--border-brutal,#1A1A1A)] shadow-[var(--ds-shadow,2px_2px_0px_#1A1A1A)]">
            Antes de decidir
          </div>
          <h2
            id="faq-title"
            className="font-display font-extrabold text-2xl sm:text-3xl md:text-4xl text-[var(--text-primary,#1A1A1A)]"
          >
            O que costumam perguntar
          </h2>
        </div>

        <Accordion type="single" collapsible className="space-y-4">
          {faqs.map((f) => (
            <AccordionItem
              key={f.id}
              value={f.id}
              className="border-2 border-[var(--border-brutal,#1A1A1A)] rounded-[var(--radius-md,6px)] bg-white shadow-[var(--ds-shadow,3px_3px_0px_#1A1A1A)] overflow-hidden px-4 sm:px-6"
            >
              <AccordionTrigger className="font-display font-bold text-base sm:text-lg text-[var(--text-primary,#1A1A1A)] hover:no-underline py-4 sm:py-5 text-left">
                {f.question}
              </AccordionTrigger>
              <AccordionContent className="text-sm text-gray-700 leading-relaxed font-body pb-5 pt-1">
                {f.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
