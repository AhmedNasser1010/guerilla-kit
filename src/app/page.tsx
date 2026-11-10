import Link from "next/link";
import {
  ArrowRight,
  CalendarClock,
  ImagePlus,
  Send,
  ShieldCheck,
  Users,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const features = [
  {
    icon: Send,
    title: "Post to every group",
    description:
      "Compose once and publish to all of your Facebook groups in a single run — no more copy-pasting the same post over and over.",
  },
  {
    icon: Users,
    title: "Your groups, discovered",
    description:
      "Automatically finds the groups you're a member of, with member counts and notes so you always know where your content lands.",
  },
  {
    icon: ImagePlus,
    title: "Text and images",
    description:
      "Attach images, draft with a live preview, and keep everything in one composer built for speed.",
  },
  {
    icon: CalendarClock,
    title: "Stay organized",
    description:
      "Track which groups you've posted to, mark the ones you've skipped, and pick up right where you left off.",
  },
  {
    icon: Zap,
    title: "Fast by default",
    description:
      "Runs right on your machine using your own browser session — nothing to install, nothing waiting in a queue.",
  },
  {
    icon: ShieldCheck,
    title: "Private by design",
    description:
      "Your Facebook session stays local. No third-party servers, no data harvesting — you're always in control.",
  },
];

const steps = [
  {
    number: "01",
    title: "Log in once",
    description:
      "Sign in to Facebook through the app's built-in browser. Your session is saved securely on your device.",
  },
  {
    number: "02",
    title: "Compose your post",
    description:
      "Write your message and attach an image. Preview exactly what your groups will see.",
  },
  {
    number: "03",
    title: "Publish everywhere",
    description:
      "Select your groups and hit post. Watch statuses update in real time as each one goes out.",
  },
];

export default function LandingPage() {
  return (
    <div className="flex-1">
      {/* Header */}
      <header className="glass sticky top-0 z-40 border-b">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Send className="size-4" />
            </span>
            <span className="text-base font-semibold tracking-tight">
              GuerillaKit
            </span>
          </Link>
          <nav className="hidden items-center gap-1 text-sm text-muted-foreground sm:flex">
            <a
              href="#features"
              className="rounded-lg px-3 py-2 transition-colors hover:bg-muted hover:text-foreground"
            >
              Features
            </a>
            <a
              href="#how-it-works"
              className="rounded-lg px-3 py-2 transition-colors hover:bg-muted hover:text-foreground"
            >
              How it works
            </a>
          </nav>
          <Button nativeButton={false} render={<Link href="/app" />}>
            Open app
            <ArrowRight data-icon="inline-end" />
          </Button>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div className="bg-grid absolute inset-0 -z-10" />
          <div className="mx-auto flex w-full max-w-6xl flex-col items-center px-4 py-24 text-center sm:px-6 sm:py-32">
            <Badge variant="secondary" className="mb-6 gap-1.5 rounded-full px-3 py-1">
              <Zap className="size-3" />
              Post to all your groups in one click
            </Badge>
            <h1 className="max-w-3xl text-4xl font-bold tracking-tight text-balance sm:text-6xl">
              Stop copy-pasting.{" "}
              <span className="bg-gradient-to-r from-primary to-chart-2 bg-clip-text text-transparent">
                Post everywhere at once.
              </span>
            </h1>
            <p className="mt-6 max-w-2xl text-lg text-pretty text-muted-foreground">
              GuerillaKit lets you compose a single post and publish it to
              every Facebook group you manage — with images, tracking, and a
              workflow that takes minutes, not hours.
            </p>
            <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
              <Button
                nativeButton={false}
                size="lg"
                className="px-6"
                render={<Link href="/app" />}
              >
                Open the app
                <ArrowRight data-icon="inline-end" />
              </Button>
              <Button
                nativeButton={false}
                size="lg"
                variant="outline"
                className="px-6"
                render={<a href="#how-it-works" />}
              >
                See how it works
              </Button>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              Free · Runs locally · No account required
            </p>

            {/* Product mock */}
            <div className="glass mt-16 w-full max-w-3xl rounded-2xl border p-2 shadow-2xl shadow-primary/10">
              <div className="rounded-xl border bg-card p-4 text-left sm:p-6">
                <div className="flex items-center gap-2">
                  <span className="size-3 rounded-full bg-destructive/60" />
                  <span className="size-3 rounded-full bg-chart-4/60" />
                  <span className="size-3 rounded-full bg-chart-3/60" />
                  <span className="ml-3 text-xs font-medium text-muted-foreground">
                    New post
                  </span>
                </div>
                <div className="mt-4 space-y-2.5">
                  <div className="h-3 w-3/4 rounded-full bg-muted" />
                  <div className="h-3 w-full rounded-full bg-muted" />
                  <div className="h-3 w-1/2 rounded-full bg-muted" />
                </div>
                <div className="mt-5 flex items-center justify-between border-t pt-4">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Users className="size-3.5" />
                    12 groups selected
                  </div>
                  <span className="inline-flex h-7 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground">
                    <Send className="size-3" />
                    Post to all
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="border-t">
          <div className="mx-auto w-full max-w-6xl px-4 py-24 sm:px-6">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">
                Everything you need to post at scale
              </h2>
              <p className="mt-4 text-pretty text-muted-foreground">
                Built for community managers, marketers, and anyone tired of
                repeating themselves across a dozen groups.
              </p>
            </div>
            <div className="mt-14 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((feature) => (
                <div
                  key={feature.title}
                  className="group rounded-xl border bg-card p-6 transition-all hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5"
                >
                  <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                    <feature.icon className="size-5" />
                  </span>
                  <h3 className="mt-4 font-semibold">{feature.title}</h3>
                  <p className="mt-2 text-sm text-pretty leading-relaxed text-muted-foreground">
                    {feature.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="border-t bg-muted/40">
          <div className="mx-auto w-full max-w-6xl px-4 py-24 sm:px-6">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">
                Up and running in three steps
              </h2>
              <p className="mt-4 text-pretty text-muted-foreground">
                From zero to published across all your groups in under five
                minutes.
              </p>
            </div>
            <ol className="mt-14 grid grid-cols-1 gap-4 sm:grid-cols-3">
              {steps.map((step, i) => (
                <li key={step.number} className="relative rounded-xl border bg-card p-6">
                  <span className="text-4xl font-bold text-primary/20">
                    {step.number}
                  </span>
                  <h3 className="mt-3 font-semibold">{step.title}</h3>
                  <p className="mt-2 text-sm text-pretty leading-relaxed text-muted-foreground">
                    {step.description}
                  </p>
                  {i < steps.length - 1 && (
                    <ArrowRight className="absolute top-1/2 -right-5 hidden size-5 -translate-y-1/2 text-muted-foreground/50 sm:block" />
                  )}
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* CTA */}
        <section className="border-t">
          <div className="mx-auto w-full max-w-6xl px-4 py-24 sm:px-6">
            <div className="relative overflow-hidden rounded-2xl border bg-card px-6 py-16 text-center sm:px-16">
              <div className="bg-grid absolute inset-0 -z-10 opacity-50" />
              <h2 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">
                Ready to reclaim your time?
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-pretty text-muted-foreground">
                Your next cross-group post is one click away.
              </p>
              <Button
                nativeButton={false}
                size="lg"
                className="mt-8 px-6"
                render={<Link href="/app" />}
              >
                Open the app
                <ArrowRight data-icon="inline-end" />
              </Button>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-4 px-4 py-8 text-sm text-muted-foreground sm:px-6 md:flex-row md:justify-between">
          <div className="flex flex-col items-center gap-2 md:items-start">
            <div className="flex items-center gap-2">
              <span className="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <Send className="size-3" />
              </span>
              <span className="font-medium text-foreground">GuerillaKit</span>
            </div>
            <p className="text-xs">Runs locally on your machine. Your data stays yours.</p>
          </div>
          <div className="flex flex-col items-center gap-1.5 md:items-end">
            <p>Clean, scalable and user-focused web experiences.</p>
            <p>
              © 2026{" "}
              <a
                href="https://ahmednasser-portfolio.vercel.app"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-foreground underline-offset-4 transition-colors hover:text-primary hover:underline"
              >
                Ahmed Nasser
              </a>
              . All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}