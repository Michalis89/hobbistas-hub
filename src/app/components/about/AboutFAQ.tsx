'use client';

import { ChevronDown } from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

type FAQItem = {
  question: string;
  answer: string;
};

const faqItems: FAQItem[] = [
  {
    question: 'Is Hobbistas free?',
    answer:
      'Yes. Tracking, backlog management, progress, ratings, imports, and personal statistics are all completely free. There is no trial period and no credit card required.',
  },
  {
    question: 'Which hobby categories are supported?',
    answer:
      'Games, Anime, Manga, Movies, TV Shows, and Books — each with its own metadata and the progress fields that suit it. More categories are planned.',
  },
  {
    question: 'Is Hobbistas a social network?',
    answer:
      'Not by default. Every account starts solo: no public profile, no feed, no followers. A social layer with profiles, an explore feed, and messaging is opt-in behind a single switch in your settings, and it is still being built — so for now every account is private.',
  },
  {
    question: 'Can I share my library without making my profile public?',
    answer:
      'Yes. You can generate a read-only share link to your backlog or dashboard and send it to anyone. The person opening it does not need an account, and you can set the link to expire. This works whether or not the social layer is enabled.',
  },
  {
    question: 'Can I import my backlog from other services?',
    answer:
      'Steam and MyAnimeList are both supported today. Connect Steam and your game library arrives with playtime; connect MyAnimeList and your anime and manga arrive with progress and scores. Export to portable formats is in development.',
  },
  {
    question: 'How do recommendations work?',
    answer:
      'They are computed from your own library only — the genres, themes, and ratings you have already recorded — and read across all your categories at once, so your taste in one hobby can surface something in another. No other user’s behaviour is involved, and nothing is optimised to keep you in the app.',
  },
  {
    question: 'Is my data safe?',
    answer:
      'Your data is stored securely and is only accessible through your account, and we do not sell personal data. The diary goes further: entries are encrypted in your browser with AES-256 before they are sent, so the server only ever stores ciphertext it has no key for. The trade-off is real — if you lose your diary passphrase, those entries cannot be recovered by anyone, including us.',
  },
  {
    question: 'Is there a mobile app?',
    answer:
      'Hobbistas is a Progressive Web App. You can install it on your phone or desktop straight from the browser, and it keeps working offline — additions you make without a connection sync once you are back. No app store required.',
  },
  {
    question: 'Do I need an account to read the articles and reviews?',
    answer:
      'No. Articles and reviews are public and readable by anyone. An account is only needed to track your own library, comment, or like.',
  },
  {
    question: 'How can I suggest a feature or report a bug?',
    answer:
      'Use the Support page to send a request or report. Describe what you expected, what happened instead, and add a screenshot if possible. Everything is read and prioritised.',
  },
];

export function AboutFAQ() {
  return (
    <section className="px-4 py-20 md:px-6 md:py-28">
      <div className="mx-auto max-w-3xl">
        <div className="mb-12 text-center md:mb-16">
          <p className="mb-3 text-xs uppercase tracking-[0.28em] text-primary">FAQ</p>
          <h2 className="mb-4 text-3xl font-bold text-foreground md:text-4xl">
            Frequently asked questions
          </h2>
          <p className="mx-auto max-w-xl text-muted-foreground">
            Answers to the most common questions about Hobbistas.
          </p>
        </div>

        <Accordion type="single" collapsible className="space-y-3">
          {faqItems.map((item, i) => (
            <AccordionItem
              key={i}
              value={`item-${i}`}
              className="rounded-xl border border-border bg-card px-0 transition-colors hover:border-primary/30"
            >
              <AccordionTrigger className="px-5 py-5 text-left no-underline hover:no-underline [&>svg]:hidden">
                <div className="flex w-full items-center justify-between gap-4">
                  <span className="font-medium text-foreground">{item.question}</span>
                  <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200 data-[state=open]:rotate-180" />
                </div>
              </AccordionTrigger>

              <AccordionContent className="px-5 pb-5 pt-0 text-sm leading-relaxed text-muted-foreground">
                {item.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
