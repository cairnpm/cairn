<script setup lang="ts">
import { ArrowUpRight } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { LINKS } from '../utils/site'

const DOCKER = `docker run -d --name cairn \\
  -p 3000:3000 \\
  -v cairn_data:/data \\
  -e NUXT_SESSION_PASSWORD="$(openssl rand -base64 32)" \\
  -e ANTHROPIC_API_KEY="sk-ant-…" \\
  ghcr.io/cairnpm/cairn:latest`

const FAQ = [
  {
    q: 'What does Cairn actually do?',
    a: 'It reads the pile so you don’t. Paste a Slack thread, a bug report or a whole meeting transcript: the intake agent extracts the distinct signals, recontextualises each one, deduplicates them against your backlog, and proposes where each belongs. You confirm — writing only ever happens on confirmation.',
  },
  {
    q: 'Do I need an API key?',
    a: 'Yes, your own Anthropic key. The agent runs on it, so there is no data detour through us — there is no “us” in the loop.',
  },
  {
    q: 'Is my data private?',
    a: 'Cairn is zero-egress by default: no telemetry, no phone-home. A linked product repo is grepped locally and never uploaded. Secrets are encrypted at rest, write-only in the UI, and never logged.',
  },
  {
    q: 'What does it cost?',
    a: 'Nothing. Cairn is source-available under FSL-1.1-ALv2 — read every line, audit it, run it for free forever — and each release becomes Apache-2.0 two years after it ships.',
  },
  {
    q: 'Do I have to use Shape Up?',
    a: 'Yes, and that is the point. Pitches with a real problem and an appetite, a betting table to choose what is worth doing, hills to track in-flight work, frozen scope once a bet is placed. The method is the product, not a template you switch off.',
  },
  {
    q: 'How do I run it?',
    a: 'One Node process and one embedded SQLite file — no external database. One click on Render, a docker run on any box with a volume, or Fly.io with the included fly.toml.',
  },
]
</script>

<template>
  <div class="mx-auto min-h-svh max-w-[1400px] border-x">
    <SiteNav />

    <section class="grid lg:grid-cols-2">
      <!-- min-w-0 on every grid child — see SiteSection for why. -->
      <div class="flex min-w-0 flex-col justify-center px-6 py-16 lg:px-16 lg:py-28">
        <SiteBracket>Source-available · Built on Shape Up</SiteBracket>

        <h1 class="mt-5 text-[32px] font-medium leading-[38px] tracking-[-0.03em] text-balance lg:text-[54px] lg:leading-[58px]">
          The hard part of building software moved from <em class="font-normal italic">how</em> to
          <em class="font-normal italic">what</em>.
        </h1>

        <p class="mt-6 max-w-[52ch] text-[15px] leading-[25px] text-muted-foreground lg:text-[17px] lg:leading-[27px]">
          AI made shipping cheap. The scarce skill now is deciding what to build, and in what order, in a
          backlog that fills faster than anyone can read it. Cairn is the PM agent that does the sorting —
          read, deduplicate, shape, route — so your judgment goes to the decision, not the pile.
        </p>

        <div class="mt-9 flex flex-wrap gap-3">
          <Button as-child class="rounded-none">
            <a :href="LINKS.selfHost" target="_blank" rel="noopener noreferrer">
              Self-host Cairn
              <ArrowUpRight class="size-4" />
            </a>
          </Button>
          <Button as-child variant="outline" class="rounded-none">
            <a :href="LINKS.intake" target="_blank" rel="noopener noreferrer">How the agent works</a>
          </Button>
        </div>

        <SiteBracket class="mt-7">One Node process · One SQLite file · Zero telemetry</SiteBracket>
      </div>

      <div class="flex min-w-0 items-center px-6 pb-16 lg:border-l lg:px-12 lg:py-28">
        <SiteBacklogMock />
      </div>
    </section>

    <SiteSection label="Intake" title="An agent, not a form.">
      <template #body>
        Paste a Slack thread, a bug report, a whole meeting transcript. The agent splits it into the
        distinct signals it actually contains, dedupes each one against the backlog, and argues for where
        it belongs. Nothing is written until you confirm.
      </template>
      <template #visual><SiteIntakeMock /></template>
    </SiteSection>

    <SiteSection label="Code-aware" title="Grounded in the code you already shipped." reverse>
      <template #body>
        Link your product repo — read-only GitHub App or a local path — and the agent checks what is
        <em class="italic">actually</em> built before it shapes. It dedupes against reality, citing
        <code class="font-mono text-[13px] text-foreground/80">file:line</code> rather than a stale ticket.
        The repo is grepped locally and never leaves your box.
      </template>
      <template #visual><SiteCodeMock /></template>
    </SiteSection>

    <SiteSection label="Shape Up" title="The method is the product.">
      <template #body>
        Pitches with a real problem and a fixed appetite. A betting table where members vote and the owner
        validates. Hills that track in-flight work, with scope frozen once the bet is placed. No artificial
        caps, no vanity metrics — the backlog is meant to stay small.
      </template>
      <template #visual><SitePitchMock /></template>
    </SiteSection>

    <SiteSection label="Self-hosted" title="You own the data. There is no “us” in the loop." reverse>
      <template #body>
        One container backed by an embedded SQLite file. No external database, no telemetry, no account on
        someone else’s server. The agent runs on your own Anthropic key.
      </template>
      <template #visual>
        <SitePanel title="~/cairn">
          <pre class="overflow-x-auto p-4 font-mono text-[12px] leading-[20px] text-muted-foreground"><code>{{ DOCKER }}</code></pre>
        </SitePanel>
      </template>
    </SiteSection>

    <section class="grid border-t lg:grid-cols-3">
      <div class="min-w-0 px-6 pt-14 lg:px-16 lg:py-24">
        <SiteHeading label="FAQ" title="Questions people ask first." />
      </div>

      <div class="min-w-0 px-6 pb-14 lg:col-span-2 lg:border-l lg:px-12 lg:py-24">
        <Accordion type="single" collapsible class="w-full">
          <AccordionItem v-for="(item, i) in FAQ" :key="item.q" :value="`faq-${i}`">
            <AccordionTrigger class="text-left text-[15px] font-medium hover:no-underline">
              {{ item.q }}
            </AccordionTrigger>
            <AccordionContent class="max-w-[62ch] text-[14px] leading-[23px] text-muted-foreground">
              {{ item.a }}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </section>

    <SiteFooter />
  </div>
</template>
