import type { ReactNode } from "react";
import { StatusChip } from "@/components/ui/StatusChip";
import { AssumptionBadge } from "@/components/ui/AssumptionBadge";
import { TopBar } from "@/components/layout/TopBar";
import { PageContainer } from "@/components/layout/PageContainer";
import { cutoffRuleLabel, UNITS } from "@/lib/config";
import {
  IconArrowRight,
  IconChevronDown,
  IconInfo,
} from "@/components/ui/icons";

const toc = [
  { id: "purpose", label: "Purpose and scope" },
  { id: "data-sources", label: "Data sources" },
  { id: "units", label: "Units" },
  { id: "time", label: "Time definitions" },
  { id: "forecast-selection-rule", label: "Forecast-selection rule" },
  { id: "alignment", label: "Matching and alignment" },
  { id: "metrics", label: "Metric definitions" },
  { id: "quality", label: "Data quality" },
  { id: "limitations", label: "Limitations" },
  { id: "assumptions", label: "Assumptions register" },
];

function Section({
  id,
  title,
  children,
  first = false,
}: {
  id: string;
  title: string;
  children: ReactNode;
  first?: boolean;
}) {
  return (
    <section
      id={id}
      className={[
        "scroll-mt-24",
        first ? "" : "border-t border-border-subtle pt-8",
      ].join(" ")}
    >
      <h2 className="text-section-heading font-semibold leading-section-heading text-text-primary">
        {title}
      </h2>
      <div className="mt-3 space-y-3 text-body leading-[22px] text-text-secondary">
        {children}
      </div>
    </section>
  );
}

function TableShell({
  caption,
  head,
  children,
  minWidth = 560,
}: {
  caption: string;
  head: ReactNode;
  children: ReactNode;
  minWidth?: number;
}) {
  return (
    <div className="overflow-x-auto rounded-md border border-border-subtle">
      <table className="w-full text-left" style={{ minWidth }}>
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-surface-subtle">
          <tr>{head}</tr>
        </thead>
        <tbody className="divide-y divide-border-subtle">{children}</tbody>
      </table>
    </div>
  );
}

function Th({ children, right = false }: { children: ReactNode; right?: boolean }) {
  return (
    <th
      scope="col"
      className={[
        "whitespace-nowrap border-b border-border-default px-3 py-2.5 text-[11px] font-semibold leading-4 text-text-secondary",
        right ? "text-right" : "text-left",
      ].join(" ")}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  mono = false,
  right = false,
}: {
  children: ReactNode;
  mono?: boolean;
  right?: boolean;
}) {
  return (
    <td
      className={[
        "px-3 py-2.5 align-top text-table-cell leading-5",
        mono ? "font-mono-ui text-[12px] text-text-primary" : "text-text-secondary",
        right ? "text-right tabular-nums" : "",
      ].join(" ")}
    >
      {children}
    </td>
  );
}

function InlineCode({ children }: { children: ReactNode }) {
  return (
    <code className="rounded-[3px] border border-border-subtle bg-surface-subtle px-1 py-0.5 font-mono-ui text-[12px] text-text-primary">
      {children}
    </code>
  );
}

function Callout({
  title,
  children,
  status = "info",
}: {
  title: string;
  children: ReactNode;
  status?: "info" | "warning";
}) {
  return (
    <aside
      className={[
        "border-l-2 px-4 py-3",
        status === "warning"
          ? "border-status-warning bg-status-warning-surface"
          : "border-status-info bg-status-info-surface",
      ].join(" ")}
    >
      <p className="flex items-center gap-2 text-label font-semibold leading-label text-text-primary">
        <IconInfo
          size={14}
          className={status === "warning" ? "text-status-warning" : "text-status-info"}
        />
        {title}
      </p>
      <div className="mt-1.5 text-table-cell leading-5 text-text-secondary">
        {children}
      </div>
    </aside>
  );
}

function OnThisPage() {
  return (
    <ol className="space-y-1.5">
      {toc.map((item, index) => (
        <li key={item.id}>
          <a
            href={`#${item.id}`}
            className="group flex items-baseline gap-2 text-caption leading-caption text-text-tertiary transition-colors hover:text-text-primary"
          >
            <span className="w-3 shrink-0 text-right tabular-nums text-[10px] text-text-disabled">
              {index + 1}
            </span>
            <span className="group-hover:underline">{item.label}</span>
          </a>
        </li>
      ))}
    </ol>
  );
}

export default function MethodologyPage() {
  return (
    <>
      <TopBar title="Methodology" showCutoff={false} />

      <PageContainer>
        <details className="group rounded-md border border-border-subtle bg-surface px-4 py-3 xl:hidden">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-label font-semibold text-text-primary marker:hidden">
            On this page
            <IconChevronDown
              size={14}
              className="text-text-tertiary transition-transform group-open:rotate-180"
            />
          </summary>
          <div className="mt-3 border-t border-border-subtle pt-3">
            <OnThisPage />
          </div>
        </details>

        <div className="grid grid-cols-1 gap-10 xl:grid-cols-[minmax(0,1fr)_216px]">
          <article className="min-w-0">
            <header className="max-w-[76ch] border-b border-border-subtle pb-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-accent-600">
                Reference
              </p>
              <h2 className="mt-2 text-page-title font-semibold leading-page-title tracking-[-0.01em] text-text-primary">
                How the January 2026 numbers are defined
              </h2>
              <p className="mt-2 text-body leading-[22px] text-text-secondary">
                This page records the sources, selection rule, alignment method
                and metric definitions behind the dashboard. It also lists what
                is still unconfirmed. No metric is computed in the browser, and
                no value is substituted when the backend is unavailable.
              </p>
              <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-[11px] leading-4">
                <div>
                  <dt className="text-text-tertiary">Delivery period</dt>
                  <dd className="mt-0.5 font-medium text-text-primary">
                    January 2026 · Europe/London
                  </dd>
                </div>
                <div>
                  <dt className="text-text-tertiary">Scope</dt>
                  <dd className="mt-0.5 font-medium text-text-primary">
                    National wind · day-ahead
                  </dd>
                </div>
                <div>
                  <dt className="text-text-tertiary">Data status</dt>
                  <dd className="mt-0.5 font-medium text-text-primary">
                    Shown per page · backend-reported
                  </dd>
                </div>
              </dl>
            </header>

            <div className="mt-8 space-y-8">
              <Section id="purpose" title="Purpose and scope" first>
                <p>
                  The dashboard shows which national wind-generation forecasts
                  were available at day-ahead purchasing decisions in January
                  2026, and how closely those forecasts matched actual
                  generation. Every number should be traceable to the selected
                  forecast row and the actual outturn row behind it.
                </p>
                <p>
                  Scope is national wind only and delivery dates from 1 to 31
                  January 2026. Trading execution, price forecasting, regional
                  splits, onshore/offshore splits and multi-month analysis are
                  out of scope.
                </p>
              </Section>

              <Section id="data-sources" title="Data sources">
                <p>
                  Both datasets come from the Elexon Insights API at{" "}
                  <InlineCode>https://data.elexon.co.uk/bmrs/api/v1</InlineCode>
                  . No API key is required. Use is subject to the BMRS Data
                  Licence Terms and API Terms of Use.
                </p>
                <TableShell
                  caption="Elexon datasets used by the dashboard"
                  head={
                    <>
                      <Th>Dataset</Th>
                      <Th>Role</Th>
                      <Th>Fields used</Th>
                      <Th>Unit</Th>
                    </>
                  }
                >
                  <tr>
                    <Td mono>WINDFOR</Td>
                    <Td>Wind generation forecast</Td>
                    <Td mono>
                      publishTime, startTime, settlementDate,
                      settlementPeriod, generation
                    </Td>
                    <Td>
                      {UNITS.generation}
                      <span className="block text-[11px] leading-4 text-text-tertiary">
                        single value per interval
                      </span>
                    </Td>
                  </tr>
                  <tr>
                    <Td mono>FUELHH</Td>
                    <Td>Half-hourly generation outturn, wind only</Td>
                    <Td mono>
                      startTime, settlementDate, settlementPeriod, fuelType,
                      generation
                    </Td>
                    <Td>
                      {UNITS.generation}
                      <span className="block text-[11px] leading-4 text-text-tertiary">
                        average over the half-hour
                      </span>
                    </Td>
                  </tr>
                </TableShell>
              </Section>

              <Section id="units" title="Units">
                <Callout title="Verified against Elexon documentation">
                  <p>
                    Both <InlineCode>generation</InlineCode> fields are power in{" "}
                    <strong>{UNITS.generation}</strong>, not energy in MWh. WINDFOR
                    is a single forecast value per delivery interval; Elexon
                    labels the peak wind forecast in MW. FUELHH is the average
                    MW over each settlement period, not a half-hour energy
                    total. Values are therefore compared directly, without
                    multiplying by duration or summing intervals.
                  </p>
                  <p className="mt-2">
                    Elexon&apos;s own wind-forecast reporting compares WINDFOR
                    with FUELHH wind outturn, for wind farms metered on the GB
                    transmission network. This dashboard uses the same pairing.
                  </p>
                  <p className="mt-2 text-[11px] leading-4 text-text-tertiary">
                    Sources: Elexon Insights API dataset documentation (WINDFOR,
                    FUELHH) and the BMRA &amp; SAA Interface Specification
                    (FUELHH generation: units MW, half-hourly average period
                    values). Checked 24 October 2026.
                  </p>
                </Callout>
                <p>
                  Metrics are reported in {UNITS.generation} and are not
                  normalised by installed capacity. Error metrics do not capture
                  financial impact.
                </p>
              </Section>

              <Section id="time" title="Time definitions">
                <TableShell
                  caption="Time fields and their UI labels"
                  head={
                    <>
                      <Th>Field</Th>
                      <Th>Meaning</Th>
                      <Th>UI label</Th>
                    </>
                  }
                >
                  <tr>
                    <Td mono>startTime</Td>
                    <Td>Start of the delivery interval the value applies to (UTC)</Td>
                    <Td>Delivery time</Td>
                  </tr>
                  <tr>
                    <Td mono>publishTime</Td>
                    <Td>When the forecast was published</Td>
                    <Td>Forecast published</Td>
                  </tr>
                  <tr>
                    <Td mono>
                      settlementDate + settlementPeriod
                    </Td>
                    <Td>GB settlement day and half-hour index</Td>
                    <Td>Secondary / debug column</Td>
                  </tr>
                </TableShell>
                <p>
                  Values are stored and computed in UTC and displayed in
                  Europe/London with a visible timezone label. The Data Explorer
                  offers a UTC toggle. January 2026 contains no clock change,
                  but settlement periods are not hard-coded to 48.
                </p>
              </Section>

              <Section
                id="forecast-selection-rule"
                title="Forecast-selection rule"
              >
                <p>
                  For every January 2026 delivery interval, the backend selects
                  the forecast a day-ahead buyer could actually have used:
                </p>
                <ol className="list-decimal space-y-2 pl-5 marker:text-text-tertiary">
                  <li>
                    Only forecasts with{" "}
                    <InlineCode>publishTime</InlineCode> at or before the cutoff
                    are eligible. Later forecasts are never selected.
                  </li>
                  <li>
                    Among eligible forecasts for the same{" "}
                    <InlineCode>startTime</InlineCode>, the most recently
                    published one is used (“latest eligible”).
                  </li>
                  <li>
                    If no eligible forecast exists, the interval is unmatched
                    and is never back-filled with a later forecast.
                  </li>
                  <li>
                    Forecasts published in late December 2025 for early-January
                    delivery are eligible, so the publication fetch window
                    starts before 1 January 2026.
                  </li>
                </ol>

                <Callout title="Unconfirmed assumption" status="warning">
                  <p>
                    Proposed cutoff:{" "}
                    <strong className="text-text-primary">
                      {cutoffRuleLabel()}
                    </strong>{" "}
                    — 09:00 Europe/London on the day before delivery.{" "}
                    <AssumptionBadge />
                  </p>
                  <p className="mt-2">
                    The exact day-ahead gate is a business decision. The cutoff
                    is held in one configuration value and is displayed wherever
                    it affects selection. Changing it changes every metric.
                  </p>
                </Callout>
              </Section>

              <Section id="alignment" title="Matching and alignment">
                <ul className="list-disc space-y-2 pl-5 marker:text-text-tertiary">
                  <li>
                    Forecast intervals are identified by their UTC{" "}
                    <InlineCode>startTime</InlineCode>. FUELHH settlement date
                    and period are carried through for reference; the match is
                    made on the interval start, and a record without a matching
                    start is reported as unmatched rather than merged on a
                    different key.
                  </li>
                  <li>
                    WINDFOR is hourly and FUELHH is half-hourly in this window.
                    Each hourly forecast interval <em>[t, t + 60 min)</em> is
                    compared with the time-weighted mean of the two FUELHH
                    half-hours that exactly cover it. Both resolutions are
                    detected from the data and shown in Data Quality.
                  </li>
                  <li>
                    An interval is matched only when every required half-hour
                    actual is present and non-null. If one is missing, the
                    interval is excluded from every metric and counted by
                    reason: there is no interpolation, no duplication of a
                    forecast into finer slots and no mean over a partial
                    interval.
                  </li>
                  <li>
                    The accuracy result has one row per delivery interval, not
                    one per publication. The selected publication is kept beside
                    each interval so the choice can be traced.
                  </li>
                  <li>
                    Null or invalid values are excluded and counted; they are
                    never treated as zero. Join integrity, duplicate keys and
                    timestamp parsing are validated, and failed checks are
                    displayed rather than hidden.
                  </li>
                </ul>
              </Section>

              <Section id="metrics" title="Metric definitions">
                <p>
                  For matched intervals <em>t = 1…n</em>, forecast{" "}
                  <em>F<sub>t</sub></em>, actual <em>A<sub>t</sub></em>, and
                  signed error <em>e<sub>t</sub> = F<sub>t</sub> − A<sub>t</sub></em>.
                </p>
                <TableShell
                  caption="Metric formulas, units and reading"
                  minWidth={620}
                  head={
                    <>
                      <Th>Metric</Th>
                      <Th>Formula</Th>
                      <Th>Unit</Th>
                      <Th>Reading</Th>
                    </>
                  }
                >
                  <tr>
                    <Td>
                      <span className="font-semibold text-text-primary">MAE</span>
                    </Td>
                    <Td mono>MAE = (1/n) Σ |eₜ|</Td>
                    <Td>{UNITS.generation}</Td>
                    <Td>Typical error size, direction-agnostic</Td>
                  </tr>
                  <tr>
                    <Td>
                      <span className="font-semibold text-text-primary">RMSE</span>
                    </Td>
                    <Td mono>RMSE = √((1/n) Σ eₜ²)</Td>
                    <Td>{UNITS.generation}</Td>
                    <Td>Like MAE, but penalises large misses</Td>
                  </tr>
                  <tr>
                    <Td>
                      <span className="font-semibold text-text-primary">
                        Forecast bias
                      </span>
                    </Td>
                    <Td mono>Bias = (1/n) Σ eₜ</Td>
                    <Td>{UNITS.generation} (signed)</Td>
                    <Td>
                      Positive = over-forecast; negative = under-forecast
                    </Td>
                  </tr>
                  <tr>
                    <Td>
                      <span className="font-semibold text-text-primary">
                        Matched coverage
                      </span>
                    </Td>
                    <Td mono>n_matched ÷ n_expected</Td>
                    <Td>% and counts</Td>
                    <Td>Share of January intervals with a valid pair</Td>
                  </tr>
                </TableShell>
                <p>
                  The expected interval count is computed by the backend, not
                  hard-coded in the UI. Until accuracy thresholds are agreed,
                  KPIs use neutral status and no red/amber judgement of
                  accuracy. Rounding happens only at presentation; the API
                  returns unrounded values.
                </p>
              </Section>

              <Section id="quality" title="Data quality">
                <p>
                  Each panel owns its own loading, empty, partial, stale or error
                  state. A failed request is never shown as a successful load.
                  The Overview and Data Explorer can remain usable with a
                  partial set, but metrics always state how many intervals they
                  used.
                </p>
                <ul className="space-y-2">
                  {[
                    "No duplicate delivery keys",
                    "Timestamps parse and timezone conversion is correct",
                    "Generation values pass range sanity checks",
                    "Every KPI denominator reconciles to the row count",
                    "Unmatched intervals are counted by reason",
                    "Null and rejected rows are excluded, never zero-filled",
                  ].map((check) => (
                    <li key={check} className="flex items-start gap-2">
                      <StatusChip variant="neutral" label="Required" />
                      <span className="min-w-0 pt-0.5">{check}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-[11px] leading-4 text-text-tertiary">
                  The backend runs these checks on the loaded January 2026
                  snapshot, and each page shows how many passed. A failed check
                  is displayed as failed; the UI never assumes a pass.
                </p>
              </Section>

              <Section id="limitations" title="Limitations">
                <ul className="list-disc space-y-2 pl-5 marker:text-text-tertiary">
                  <li>Results describe January 2026 only and do not generalise to other seasons.</li>
                  <li>Metrics depend on the cutoff assumption; a different cutoff changes forecast selection.</li>
                  <li>The national aggregate hides regional variation.</li>
                  <li>FUELHH is outturn-based; the dashboard reports the snapshot retrieved at load time and does not track later revisions.</li>
                  <li>{UNITS.generation} metrics are not normalised by installed capacity.</li>
                  <li>Error metrics do not capture financial impact.</li>
                  <li>Forecast and actual resolution differences may limit which intervals can be compared.</li>
                </ul>
              </Section>

              <Section id="assumptions" title="Assumptions register">
                <p>
                  Unconfirmed decisions stay visible in the product. An item
                  moves to confirmed only after verification against Elexon
                  documentation or a business decision.
                </p>
                <TableShell
                  caption="Open assumptions and their status"
                  minWidth={620}
                  head={
                    <>
                      <Th>#</Th>
                      <Th>Assumption</Th>
                      <Th>Status</Th>
                    </>
                  }
                >
                  {[
                    {
                      id: "1",
                      text: "Day-ahead cutoff is D‑1 09:00 Europe/London",
                      status: "Needs confirmation",
                      variant: "warning" as const,
                    },
                    {
                      id: "2",
                      text: "Selection uses the latest forecast published at or before the cutoff",
                      status: "Implemented · depends on 1",
                      variant: "info" as const,
                    },
                    {
                      id: "3",
                      text: "Generation unit is MW, not MWh, for both datasets",
                      status: "Verified 24 Oct 2026",
                      variant: "favorable" as const,
                    },
                    {
                      id: "4",
                      text: "WINDFOR and FUELHH resolutions are observed from data rather than assumed",
                      status: "Implemented",
                      variant: "favorable" as const,
                    },
                    {
                      id: "5",
                      text: "Hourly forecasts are compared with the mean of the half-hour actuals that exactly cover them",
                      status: "Implemented",
                      variant: "favorable" as const,
                    },
                    {
                      id: "6",
                      text: "Publication fetch window includes late December 2025",
                      status: "Implemented",
                      variant: "favorable" as const,
                    },
                  ].map((item) => (
                    <tr key={item.id}>
                      <Td>
                        <span className="tabular-nums text-text-tertiary">
                          {item.id}
                        </span>
                      </Td>
                      <Td>{item.text}</Td>
                      <Td>
                        <StatusChip variant={item.variant} label={item.status} />
                      </Td>
                    </tr>
                  ))}
                </TableShell>
                <p className="flex flex-wrap items-center gap-2 text-[11px] leading-4 text-text-tertiary">
                  <span>
                    Design system and layout reviewed alongside this page.
                  </span>
                  <a
                    href="#purpose"
                    className="inline-flex items-center gap-1 font-medium text-accent-600 hover:underline"
                  >
                    Back to top
                    <IconArrowRight size={11} className="-rotate-90" />
                  </a>
                </p>
              </Section>
            </div>
          </article>

          <aside aria-label="On this page" className="hidden xl:block">
            <div className="sticky top-24">
              <p className="border-b border-border-subtle pb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-text-tertiary">
                On this page
              </p>
              <div className="mt-3">
                <OnThisPage />
              </div>
            </div>
          </aside>
        </div>
      </PageContainer>
    </>
  );
}
