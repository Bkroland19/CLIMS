import React, { useEffect, useRef, useState } from "react";
import { Share, type ScrollViewInstance, type TextInputInstance } from "react-native";
import { useT } from "@/lib/theme";
import Screen from "@/components/m/Screen";
import {
  Banner,
  Btn,
  Btns,
  Fields,
  Hero,
  Input,
  List,
  ReadOnly,
  Row,
  Select,
  type StepItem,
} from "@/components/m/kit";
import { ago, chip, type ChipDef, num, periodOf, PRODUCTS, type Tone } from "@/lib/format";
import { useNav } from "@/lib/nav";
import { CHECKS, FORMS, LOSS_FIELD, validateReport, type OtherField } from "@/lib/reports";
import { currentPeriod } from "@/lib/seed";
import { useMe } from "@/lib/session";
import { usePending, useStore } from "@/lib/store";
import type { Report, ReportError, ReportStatus, ReportValues } from "@/lib/types";

export const REPORT_CHIP: Record<ReportStatus, ChipDef> = {
  draft: chip("Draft", "info"),
  errors: chip("Errors to fix", "danger"),
  validated: chip("Ready to send", "success"),
  sent: chip("Sent to MOH", "success"),
};

const pl = (n: number) => (n === 1 ? "" : "s");

type Busy = {
  phase: "validating" | "sending";
  i: number;
  types: ReportError["type"][];
  errs: ReportError[];
} | null;

function reportSteps(r: Report, B: Busy): StepItem[] {
  const st = r.status;
  const runs = r.runs || 0;
  const b = B?.phase;
  const clean =
    (st === "sent" || st === "validated" || b === "sending") && runs <= 1 && !(B && B.errs.length);
  return [
    {
      label: "Data entry",
      st: runs || b ? "done" : "cur",
      sub: r.savedAt != null ? `Saved ${ago(r.savedAt)}` : "Not started",
    },
    {
      label: "Validation",
      st: b === "validating" ? "cur" : runs || b ? "done" : "todo",
      sub:
        b === "validating"
          ? "Checking…"
          : st === "errors"
            ? `${r.errors.length} error${pl(r.errors.length)} found`
            : runs
              ? "Passed"
              : "Runs when you send",
    },
    clean
      ? { label: "Rectify errors", st: "skip", sub: "No errors found" }
      : {
          label: "Rectify errors",
          st: st === "errors" && !b ? "warn" : runs > 1 ? "done" : "todo",
          sub:
            st === "errors" && !b
              ? `${r.errors.length} to fix`
              : runs > 1
                ? "Fixed"
                : "Only if validation fails",
        },
    {
      label: "Sent to MOH",
      st: st === "sent" ? "done" : b === "sending" ? "cur" : "todo",
      sub: st === "sent" ? ago(r.sentAt) : b === "sending" ? "Sending…" : "",
    },
  ];
}

export function ReportsList() {
  const nav = useNav();
  const me = useMe();
  const { s } = useStore();
  const mine = s.reports
    .filter((r) => r.own === me.role)
    .sort((a, b) => b.period.localeCompare(a.period));
  const cur = mine.find((r) => r.period === currentPeriod());
  const F = cur ? FORMS[cur.form] : null;
  const P0 = cur ? periodOf(cur.period) : null;
  const n = cur?.errors.length ?? 0;
  return (
    <Screen title="Reports" root>
      {cur && F && P0 ? (
        <Hero
          h="Due now"
          title={P0.label}
          sub={`${F.name} · due ${P0.due}`}
          chip={REPORT_CHIP[cur.status]}
          steps={reportSteps(cur, null)}
          msg={
            {
              draft:
                cur.savedAt != null
                  ? `Draft saved ${ago(cur.savedAt)}.`
                  : "Opening balance and received are filled in from CLIMS. Add the rest.",
              errors: `Validation found ${n} error${pl(n)}. Fix ${n === 1 ? "it" : "them"} and send again.`,
              validated: "Validation passed. Send the report to MOH.",
              sent: `Sent ${ago(cur.sentAt)} · receipt ${cur.receipt}.`,
            }[cur.status]
          }
        >
          <Btn
            label={
              {
                draft: cur.savedAt != null ? "Continue report" : "Start report",
                errors: "Fix errors",
                validated: "Review and send",
                sent: "View report",
              }[cur.status]
            }
            kind={cur.status === "sent" ? "secondary" : "primary"}
            onPress={() => nav.go(`report/${cur.id}`)}
          />
        </Hero>
      ) : null}
      <List
        h="All reports"
        empty="No reports yet."
        f="Reports are due on the 20th of the following month."
      >
        {mine.map((r) => (
          <Row
            key={r.id}
            t={periodOf(r.period).label}
            s={FORMS[r.form].name}
            chip={REPORT_CHIP[r.status]}
            chev
            onPress={() => nav.go(`report/${r.id}`)}
          />
        ))}
      </List>
    </Screen>
  );
}

export function ReportScreen({ id }: { id: string }) {
  const T = useT();
  const me = useMe();
  const { s, send, reportErrors, offline } = useStore();
  const pend = usePending(id);
  const r = s.reports.find((x) => x.id === id && x.own === me.role);
  const [ed, setEd] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<Busy>(null);
  const [localErr, setLocalErr] = useState<ReportError[] | null>(null);
  const refs = useRef<Record<string, TextInputInstance | null>>({});
  const scroll = useRef<ScrollViewInstance>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  if (!r)
    return (
      <Screen title="Report" backLabel="Reports">
        <Banner tone="neutral" title="That report isn't available" />
      </Screen>
    );

  const F = FORMS[r.form];
  const P0 = periodOf(r.period);
  const canEdit = r.status !== "sent" && !busy && !pend;
  const dirty = Object.keys(ed).length > 0;
  const get = (path: string) => {
    const [a, b] = path.split(".");
    const x = b ? r.values[a]?.[b] : r.values[a];
    return x == null ? "" : String(x);
  };
  const val = (path: string) => (ed[path] !== undefined ? ed[path] : get(path));
  const errList = localErr ?? (r.status === "errors" && !busy ? r.errors : []);
  const errOf = (path: string) =>
    ed[path] === undefined ? errList.find((e) => e.field === path) : undefined;
  const set = (path: string) => (v: string) => setEd((x) => ({ ...x, [path]: v }));
  const merged = (): ReportValues => {
    const m = JSON.parse(JSON.stringify(r.values));
    Object.entries(ed).forEach(([k, x]) => {
      const [a, b] = k.split(".");
      if (b) {
        m[a] = m[a] || {};
        m[a][b] = x;
      } else m[a] = x;
    });
    return m;
  };
  const mv = merged();
  const fmtV = (x: string) => (x === "" ? "—" : /^\d+$/.test(x) ? num(+x) : x);
  const cover = me.role === "vht" ? s.hotspots.filter((h) => h.vhts.includes(me.name)).length : 3;
  const ctx = { days: P0.days, month: P0.month, cover };
  const anyLoss =
    PRODUCTS.some((p) => +(mv[p.k]?.loss ?? 0) > 0) || !!String(mv.lossReason ?? "").trim();
  const others: OtherField[] = [...F.other, ...(anyLoss ? [LOSS_FIELD] : [])];
  const live = errList.filter((e) => ed[e.field] === undefined);

  const run = () => {
    const vals = merged();
    const errs = validateReport(F, vals, ctx);
    if (offline) {
      if (errs.length) {
        setLocalErr(errs);
        scroll.current?.scrollTo({ y: 0 });
        return;
      }
      send("rptSend", { id: r.id, values: vals }, `${P0.label} report`);
      setEd({});
      setLocalErr(null);
      return;
    }
    const types = [...new Set(errs.map((e) => e.type))];
    const step = (i: number) => {
      if (i < CHECKS.length) {
        setBusy({ phase: "validating", i, types, errs });
        timer.current = setTimeout(() => step(i + 1), 380);
        return;
      }
      setEd({});
      setLocalErr(null);
      if (errs.length) {
        reportErrors(r.id, vals, errs);
        setBusy(null);
        scroll.current?.scrollTo({ y: 0 });
        return;
      }
      setBusy({ phase: "sending", i, types, errs });
      timer.current = setTimeout(() => {
        send("rptSend", { id: r.id, values: vals }, `${P0.label} report`);
        setBusy(null);
      }, 1200);
    };
    step(0);
  };

  let bn: [Tone, string, string];
  if (busy)
    bn = [
      "info",
      busy.phase === "validating" ? "Checking your figures…" : "Sending to the MOH server…",
      "Keep the app open until it is sent.",
    ];
  else if (pend)
    bn = [
      "warning",
      "Saved on this phone",
      "The report is checked and sends to MOH when you are back online.",
    ];
  else if (r.status === "sent")
    bn = [
      "success",
      `Sent to MOH ${ago(r.sentAt)}`,
      `Server receipt ${r.receipt}. Sent reports can't be edited.`,
    ];
  else if (errList.length && !live.length)
    bn = ["info", "All flagged fields changed", "Send again — CLIMS re-checks the whole report."];
  else if (errList.length)
    bn = [
      "danger",
      `${live.length} error${pl(live.length)} to fix`,
      "Tap an error to jump to the field.",
    ];
  else if (r.status === "validated")
    bn = ["success", "Validation passed", "Nothing to fix. Send the report to MOH."];
  else
    bn = [
      "info",
      `Enter your ${P0.month} figures`,
      "Opening balance and received are filled in from CLIMS. The app checks everything before it reaches MOH.",
    ];

  const checkRow = (k: ReportError["type"], label: string, j: number) => {
    let st: "pass" | "fail" | "run" | "pend";
    if (busy?.phase === "validating")
      st = j < busy.i ? (busy.types.includes(k) ? "fail" : "pass") : j === busy.i ? "run" : "pend";
    else if (busy || r.status === "sent" || r.status === "validated") st = "pass";
    else if (errList.length) st = errList.some((e) => e.type === k) ? "fail" : "pass";
    else st = "pend";
    const I = {
      pass: ["checkC", T.tones.success.fg],
      fail: ["alert", T.danger],
      run: ["clock", T.tint],
      pend: ["clock", T.fg3],
    }[st] as ["checkC" | "alert" | "clock", string];
    return (
      <Row
        key={k}
        t={label}
        ic={I[0]}
        icBg="transparent"
        icFg={I[1]}
        v={st === "fail" ? "Fix" : st === "run" ? "Checking…" : ""}
        vfg={st === "fail" ? T.danger : T.fg2}
      />
    );
  };

  const cmt = val("comment");
  const primary = busy
    ? busy.phase === "validating"
      ? "Checking…"
      : "Sending…"
    : errList.length
      ? "Re-check and send"
      : r.status === "validated"
        ? "Send to MOH"
        : "Validate and send";

  const shareReport = () =>
    Share.share({
      message: [
        `${F.name} · ${P0.label}`,
        ...PRODUCTS.map(
          (p) =>
            `${p.name}: ${F.stock.map((f) => `${f.label} ${fmtV(get(`${p.k}.${f.k}`))}`).join(", ")}`,
        ),
        ...F.other.map((f) => `${f.label}: ${fmtV(get(f.k))}`),
        `Server receipt ${r.receipt}`,
      ].join("\n"),
    }).catch(() => {});

  return (
    <Screen title={P0.label} backLabel="Reports" scrollRef={scroll}>
      <Banner
        tone={bn[0]}
        title={bn[1]}
        body={bn[2]}
        items={
          bn[0] === "danger"
            ? live.map((e) => ({
                where: e.where,
                msg: e.msg,
                onPress: () => refs.current[e.field]?.focus(),
              }))
            : []
        }
      />
      {PRODUCTS.map((p) => (
        <Fields key={p.k} h={`${p.name} · ${p.brand}`}>
          {F.stock.map((f) => {
            const path = `${p.k}.${f.k}`;
            if (f.sys || !canEdit)
              return (
                <ReadOnly
                  key={path}
                  label={f.label}
                  value={fmtV(val(path))}
                  sub={f.sys ? `${f.hint} · from CLIMS` : ""}
                />
              );
            return (
              <Input
                key={path}
                inputRef={(el) => {
                  refs.current[path] = el;
                }}
                label={f.label}
                value={val(path)}
                onChangeText={set(path)}
                keyboardType="number-pad"
                hint={f.hint}
                err={errOf(path)?.msg}
              />
            );
          })}
        </Fields>
      ))}
      <Fields h={F.otherTitle}>
        {others.map((f) => {
          const e = errOf(f.k);
          const hint =
            f.max === "cover"
              ? `You cover ${cover} hotspots`
              : f.max === "days"
                ? `0–${P0.days}`
                : (f.hint ?? "");
          if (!canEdit) return <ReadOnly key={f.k} label={f.label} value={fmtV(val(f.k))} />;
          if (f.type === "sel") {
            return (
              <Select
                key={f.k}
                label={f.label}
                value={val(f.k)}
                onChange={set(f.k)}
                options={[{ v: "", l: "Choose…" }, ...(f.opts ?? []).map((o) => ({ v: o, l: o }))]}
                err={e?.msg}
              />
            );
          }
          return (
            <Input
              key={f.k}
              inputRef={(el) => {
                refs.current[f.k] = el;
              }}
              label={f.label}
              value={val(f.k)}
              onChangeText={set(f.k)}
              keyboardType="number-pad"
              hint={hint}
              err={e?.msg}
            />
          );
        })}
      </Fields>
      {canEdit ? (
        <Fields h="Comment">
          <Input
            label="Anything MOH should know (optional)"
            value={cmt}
            onChangeText={set("comment")}
            multiline
          />
        </Fields>
      ) : cmt.trim() ? (
        <List h="Comment">
          <Row t={cmt} />
        </List>
      ) : null}
      <List h="Validation" f={r.runs ? `Run ${r.runs} time${pl(r.runs)}` : "Runs when you send"}>
        {CHECKS.map(([k, label], j) => checkRow(k, label, j))}
      </List>
      {r.status === "sent" ? (
        <List h="Submission">
          <Row t="Reported by" v={r.reporter === me.name ? "You" : (r.reporter ?? "—")} />
          <Row t="Sent" v={ago(r.sentAt)} />
          <Row t="Server receipt" v={r.receipt ?? "—"} />
        </List>
      ) : null}
      {canEdit ? (
        <Btns>
          <Btn label={primary} onPress={run} />
          <Btn
            label="Save draft"
            kind="secondary"
            dis={!dirty}
            onPress={() => {
              send("rptSave", { id: r.id, values: merged() }, "Report draft");
              setEd({});
            }}
          />
        </Btns>
      ) : busy ? (
        <Btns>
          <Btn label={primary} dis onPress={() => {}} />
        </Btns>
      ) : null}
      {r.status === "sent" ? (
        <Btns>
          <Btn label="Share report" icon="receipt" kind="secondary" onPress={shareReport} />
        </Btns>
      ) : null}
    </Screen>
  );
}
