import React, { useState } from "react";
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type TextInputInstance,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import type { Tokens } from "@/constants/design";
import { useT } from "@/lib/theme";
import type { ChipDef, Tone } from "@/lib/format";
import Icon, { type IconName } from "./Icon";

/* ───────────── Text ───────────── */

export function Txt({ style, ...p }: TextProps & { style?: TextStyle | TextStyle[] }) {
  const T = useT();
  return <Text {...p} style={[{ color: T.fg, fontSize: T.rowFs }, style as TextStyle]} />;
}

/* ───────────── Section scaffolding ───────────── */

function SecHead({ h }: { h?: string }) {
  const T = useT();
  if (!h) return null;
  return (
    <Txt
      accessibilityRole="header"
      style={{
        fontSize: T.shFs,
        color: T.shFg,
        fontWeight: T.shFw,
        textTransform: T.shUpper ? "uppercase" : "none",
        paddingHorizontal: T.shPx,
        paddingBottom: T.ios ? 7 : 8,
      }}
    >
      {h}
    </Txt>
  );
}
function SecFoot({ f }: { f?: string }) {
  const T = useT();
  if (!f) return null;
  return <Txt style={{ fontSize: 13, color: T.fg2, paddingHorizontal: T.shPx, paddingTop: 7, lineHeight: 18 }}>{f}</Txt>;
}

export function Section({ h, f, children, style }: { h?: string; f?: string; children?: React.ReactNode; style?: ViewStyle }) {
  const T = useT();
  return (
    <View style={[{ marginBottom: T.secGap }, style]}>
      <SecHead h={h} />
      {children}
      <SecFoot f={f} />
    </View>
  );
}

/** Grouped list. iOS: inset white card with hairlines. Material: tonal rows with 2dp gaps. */
export function List({ h, f, empty, children }: { h?: string; f?: string; empty?: string; children?: React.ReactNode }) {
  const T = useT();
  const kids = React.Children.toArray(children).filter(Boolean);
  if (!kids.length && !empty && !h) return null;
  return (
    <Section h={h} f={f}>
      {kids.length ? (
        <View style={{ marginHorizontal: 16, borderRadius: T.listR, overflow: "hidden", gap: T.listGap }}>
          {kids.map((k, i) => (
            <View
              key={i}
              style={
                T.ios
                  ? undefined
                  : {
                      borderTopLeftRadius: i === 0 ? T.listR : 4,
                      borderTopRightRadius: i === 0 ? T.listR : 4,
                      borderBottomLeftRadius: i === kids.length - 1 ? T.listR : 4,
                      borderBottomRightRadius: i === kids.length - 1 ? T.listR : 4,
                      overflow: "hidden",
                    }
              }
            >
              {k}
              {T.ios && i < kids.length - 1 ? <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: T.sep, marginLeft: 16 }} /> : null}
            </View>
          ))}
        </View>
      ) : empty ? (
        <View style={{ marginHorizontal: 16, padding: 20, borderRadius: T.listR, backgroundColor: T.rowBg }}>
          <Txt style={{ color: T.fg2, fontSize: 15, textAlign: "center", lineHeight: 21 }}>{empty}</Txt>
        </View>
      ) : null}
    </Section>
  );
}

export function Chip({ c }: { c?: ChipDef | null }) {
  const T = useT();
  if (!c) return null;
  const tn = T.tones[c.tone];
  return (
    <View style={{ backgroundColor: tn.bg, borderRadius: T.chipR, paddingHorizontal: 8, paddingVertical: 3, alignSelf: "flex-start" }}>
      <Txt style={{ color: tn.fg, fontSize: 12, fontWeight: "600" }} numberOfLines={1}>
        {c.label}
      </Txt>
    </View>
  );
}

export interface RowProps {
  t: string;
  s?: string;
  v?: string;
  vfg?: string;
  chip?: ChipDef | null;
  ic?: IconName;
  icBg?: string;
  icFg?: string;
  dot?: boolean;
  chev?: boolean;
  fg?: string;
  fw?: TextStyle["fontWeight"];
  /** Signature SVG path to show instead of a value. */
  sig?: string;
  onPress?: () => void;
}

export function Row({ t, s, v, vfg, chip, ic, icBg, icFg, dot, chev, fg, fw, sig, onPress }: RowProps) {
  const T = useT();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? "button" : undefined}
      style={({ pressed }) => ({
        backgroundColor: pressed && onPress ? T.rowPress : T.rowBg,
        minHeight: T.rowMin,
        paddingVertical: T.rowPy,
        paddingLeft: 16,
        paddingRight: chev ? 10 : 16,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
      })}
    >
      {dot ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: T.dot, marginLeft: -4 }} /> : null}
      {ic ? (
        <View style={{ width: T.icBox, height: T.icBox, borderRadius: T.icR, backgroundColor: icBg ?? T.icBg, alignItems: "center", justifyContent: "center" }}>
          <Icon name={ic} size={T.ios ? 18 : 20} color={icFg ?? T.icFg} />
        </View>
      ) : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Txt style={{ color: fg ?? T.fg, fontWeight: fw ?? "400" }}>{t}</Txt>
        {s ? <Txt style={{ color: T.fg2, fontSize: T.ios ? 15 : 14, lineHeight: 20 }}>{s}</Txt> : null}
        {chip ? <View style={{ marginTop: 4 }}><Chip c={chip} /></View> : null}
      </View>
      {sig ? <SigPreview d={sig} /> : null}
      {v ? <Txt style={{ color: vfg ?? T.fg2, maxWidth: "55%", textAlign: "right" }}>{v}</Txt> : null}
      {chev ? <Icon name="chevR" size={20} color={T.fg3} /> : null}
    </Pressable>
  );
}

/* ───────────── Hero card ───────────── */

export interface Stat {
  label: string;
  value: string;
  fg?: string;
  note?: string;
}
export interface StepItem {
  label: string;
  st: "done" | "cur" | "warn" | "todo" | "skip";
  sub?: string;
}

export function Hero({
  h, title, sub, chip, stats, steps, msg, children,
}: {
  h?: string; title: string; sub?: string; chip?: ChipDef | null; stats?: Stat[]; steps?: StepItem[]; msg?: string; children?: React.ReactNode;
}) {
  const T = useT();
  return (
    <Section h={h}>
      <View style={{ marginHorizontal: 16, backgroundColor: T.cardBg, borderRadius: T.cardR, padding: 16, gap: 12 }}>
        <View style={{ gap: 4 }}>
          <Txt style={{ fontSize: T.ios ? 22 : 22, fontWeight: T.ios ? "700" : "500" }}>{title}</Txt>
          {sub ? <Txt style={{ color: T.fg2, fontSize: 15 }}>{sub}</Txt> : null}
          {chip ? <View style={{ marginTop: 4 }}><Chip c={chip} /></View> : null}
        </View>
        {stats?.length ? (
          <View style={{ flexDirection: "row", gap: 8 }}>
            {stats.map((x) => (
              <View key={x.label} style={{ flex: 1, backgroundColor: T.tileBg, borderRadius: T.tileR, padding: 12, gap: 2 }}>
                <Txt style={{ fontSize: 13, color: T.fg2 }}>{x.label}</Txt>
                <Txt style={{ fontSize: 26, fontWeight: "700", color: x.fg ?? T.fg }}>{x.value}</Txt>
                {x.note ? <Txt style={{ fontSize: 13, color: x.fg ?? T.fg2 }}>{x.note}</Txt> : null}
              </View>
            ))}
          </View>
        ) : null}
        {steps?.length ? <Steps items={steps} /> : null}
        {msg ? <Txt style={{ color: T.fg2, fontSize: 15, lineHeight: 21 }}>{msg}</Txt> : null}
        {children ? <View style={{ gap: 8 }}>{children}</View> : null}
      </View>
    </Section>
  );
}

export function Steps({ items }: { items: StepItem[] }) {
  const T = useT();
  return (
    <View>
      {items.map((it, i) => {
        const S = {
          done: [T.tint, T.tint, T.b1Fg, "✓", T.fg, "500", T.tint],
          cur: [T.cardBg, T.tint, T.tint, String(i + 1), T.fg, "600", T.sep],
          warn: [T.stepWarnBg, T.warnBd, T.warnBd, "!", T.warnFg, "600", T.sep],
          todo: ["transparent", T.sep, T.fg3, String(i + 1), T.fg2, "400", T.sep],
          skip: ["transparent", T.sep, T.fg3, "–", T.fg3, "400", T.sep],
        }[it.st] as string[];
        const last = i === items.length - 1;
        return (
          <View key={it.label} style={{ flexDirection: "row", gap: 12 }}>
            <View style={{ alignItems: "center", width: 24 }}>
              <View
                style={{
                  width: 24, height: 24, borderRadius: 12, backgroundColor: S[0], borderWidth: it.st === "done" ? 0 : 2,
                  borderColor: S[1], borderStyle: it.st === "skip" ? "dashed" : "solid", alignItems: "center", justifyContent: "center",
                }}
              >
                <Txt style={{ color: S[2], fontSize: 12, fontWeight: "700" }}>{S[3]}</Txt>
              </View>
              {!last ? <View style={{ width: 2, flex: 1, minHeight: 14, backgroundColor: S[6] }} /> : null}
            </View>
            <View style={{ flex: 1, paddingBottom: last ? 0 : 12 }}>
              <Txt style={{ fontSize: 15, color: S[4], fontWeight: S[5] as TextStyle["fontWeight"] }}>{it.label}</Txt>
              {it.sub ? <Txt style={{ fontSize: 13, color: T.fg2 }}>{it.sub}</Txt> : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

/* ───────────── Messages ───────────── */

export function Banner({
  tone, title, body, items, act, h,
}: {
  tone: Tone; title: string; body?: string; h?: string;
  items?: { where: string; msg: string; onPress?: () => void }[];
  act?: { label: string; onPress: () => void };
}) {
  const T = useT();
  const tn = T.tones[tone];
  return (
    <Section h={h}>
      <View accessibilityRole="alert" style={{ marginHorizontal: 16, backgroundColor: tn.bg, borderRadius: T.cardR, padding: 14, gap: 8 }}>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Icon name={tn.icon as IconName} size={20} color={tn.fg} />
          <View style={{ flex: 1, gap: 2 }}>
            <Txt style={{ color: tn.fg, fontWeight: "600", fontSize: 15 }}>{title}</Txt>
            {body ? <Txt style={{ color: T.fg, fontSize: 14, lineHeight: 20 }}>{body}</Txt> : null}
          </View>
        </View>
        {items?.map((e) => (
          <Pressable key={e.where + e.msg} onPress={e.onPress} style={{ marginLeft: 30, paddingVertical: 4 }}>
            <Txt style={{ fontSize: 14, fontWeight: "600", color: tn.fg }}>{e.where}</Txt>
            <Txt style={{ fontSize: 13, color: T.fg }}>{e.msg}</Txt>
          </Pressable>
        ))}
        {act ? (
          <Pressable onPress={act.onPress} style={{ marginLeft: 30, paddingVertical: 4 }} accessibilityRole="button">
            <Txt style={{ color: T.tint, fontWeight: "600", fontSize: 15 }}>{act.label}</Txt>
          </Pressable>
        ) : null}
      </View>
    </Section>
  );
}

export function Done({ tone = "success", icon = "check", title, body }: { tone?: Tone; icon?: IconName; title: string; body?: string }) {
  const T = useT();
  const tn = T.tones[tone];
  return (
    <Section>
      <View style={{ marginHorizontal: 16, alignItems: "center", paddingVertical: 28, paddingHorizontal: 20, gap: 12 }}>
        <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: tn.bg, alignItems: "center", justifyContent: "center" }}>
          <Icon name={icon} size={34} color={tn.fg} />
        </View>
        <Txt style={{ fontSize: 22, fontWeight: "700", textAlign: "center" }}>{title}</Txt>
        {body ? <Txt style={{ color: T.fg2, fontSize: 15, textAlign: "center", lineHeight: 21 }}>{body}</Txt> : null}
      </View>
    </Section>
  );
}

export function Note({ text, center }: { text: string; center?: boolean }) {
  const T = useT();
  return (
    <Txt style={{ marginHorizontal: 24, marginBottom: T.secGap, color: T.fg2, fontSize: 14, lineHeight: 20, textAlign: center ? "center" : "left" }}>
      {text}
    </Txt>
  );
}

/* ───────────── Buttons ───────────── */

export type BtnKind = "primary" | "secondary" | "danger" | "text";

export function Btn({
  label, onPress, kind = "primary", dis, icon, small,
}: {
  label: string; onPress: () => void; kind?: BtnKind; dis?: boolean; icon?: IconName; small?: boolean;
}) {
  const T = useT();
  const K = {
    primary: [T.b1Bg, T.b1Fg, 0, "transparent"],
    secondary: [T.b2Bg, T.b2Fg, T.b2Bw, T.b2Bd],
    danger: ["transparent", T.danger, T.ios ? 0 : 1, T.danger],
    text: ["transparent", T.tint, 0, "transparent"],
  }[kind] as [string, string, number, string];
  return (
    <Pressable
      onPress={onPress}
      disabled={dis}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!dis }}
      style={({ pressed }) => ({
        height: small ? 40 : T.btnH,
        borderRadius: T.btnR,
        backgroundColor: K[0],
        borderWidth: K[2],
        borderColor: K[3],
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        paddingHorizontal: 20,
        opacity: dis ? 0.38 : pressed ? 0.75 : 1,
      })}
    >
      {icon ? <Icon name={icon} size={18} color={K[1]} /> : null}
      <Txt style={{ color: K[1], fontSize: small ? 15 : T.btnFs, fontWeight: T.btnFw }}>{label}</Txt>
    </Pressable>
  );
}

export function Btns({ children }: { children: React.ReactNode }) {
  const T = useT();
  return <View style={{ marginHorizontal: 16, marginBottom: T.secGap, gap: 8 }}>{children}</View>;
}

/* ───────────── Form fields ───────────── */

/** A titled group of fields. iOS: inset white card. Material: stacked outlined fields. */
export function Fields({ h, f, children }: { h?: string; f?: string; children?: React.ReactNode }) {
  const T = useT();
  const kids = React.Children.toArray(children).filter(Boolean);
  return (
    <Section h={h} f={f}>
      <View style={{ marginHorizontal: 16, borderRadius: T.ios ? T.listR : 0, overflow: "hidden", gap: T.fGap, backgroundColor: T.fRowBg }}>
        {kids.map((k, i) => (
          <View key={i}>
            {k}
            {T.ios && i < kids.length - 1 ? <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: T.sep, marginLeft: 16 }} /> : null}
          </View>
        ))}
      </View>
    </Section>
  );
}

function FieldBox({ label, sub, hint, err, children, row }: { label: string; sub?: string; hint?: string; err?: string; children: React.ReactNode; row?: boolean }) {
  const T = useT();
  return (
    <View style={{ paddingVertical: T.ios ? 10 : 4, paddingHorizontal: T.ios ? 16 : 0, gap: T.ios ? 2 : 6 }}>
      <View style={row ? { flexDirection: "row", alignItems: "center", gap: 12 } : undefined}>
        <View style={row ? { flex: 1 } : undefined}>
          <Txt style={{ fontSize: T.ios ? 13 : 14, color: err ? T.danger : T.fg2, fontWeight: T.ios ? "400" : "500" }}>{label}</Txt>
          {sub ? <Txt style={{ fontSize: 13, color: T.fg3 }}>{sub}</Txt> : null}
        </View>
        {children}
      </View>
      {err ? <Txt style={{ fontSize: 13, color: T.danger }}>{err}</Txt> : hint ? <Txt style={{ fontSize: 13, color: T.fg2 }}>{hint}</Txt> : null}
    </View>
  );
}

const inputStyle = (T: Tokens, err?: string, multiline?: boolean): TextStyle => ({
  minHeight: multiline ? 88 : T.inH,
  borderWidth: err ? 1.5 : T.inBw,
  borderColor: err ? T.danger : T.inBd,
  borderRadius: T.inR,
  paddingHorizontal: T.ios ? 0 : 14,
  paddingVertical: multiline ? (T.ios ? 4 : 12) : 0,
  fontSize: T.ios ? 17 : 16,
  color: T.fg,
  textAlignVertical: multiline ? "top" : "center",
});

export function Input({
  label, value, onChangeText, ph, keyboardType, secure, hint, err, multiline, autoCapitalize, autoComplete, inputRef, onFocus,
}: {
  label: string; value: string; onChangeText: (v: string) => void; ph?: string; keyboardType?: KeyboardTypeOptions; secure?: boolean;
  hint?: string; err?: string; multiline?: boolean; autoCapitalize?: "none" | "sentences" | "words"; autoComplete?: any;
  inputRef?: React.Ref<TextInputInstance>; onFocus?: () => void;
}) {
  const T = useT();
  const [hidden, setHidden] = useState(true);
  const field = (
    <TextInput
        ref={inputRef}
        value={value}
        onChangeText={onChangeText}
        placeholder={ph}
        placeholderTextColor={T.fg3}
        keyboardType={keyboardType}
        secureTextEntry={secure && hidden}
        multiline={multiline}
        autoCapitalize={autoCapitalize}
        autoComplete={autoComplete}
        onFocus={onFocus}
        accessibilityLabel={label}
        style={[inputStyle(T, err, multiline), secure ? { paddingRight: 48 } : null]}
      />
  );
  return (
    <FieldBox label={label} hint={hint} err={err}>
      {secure ? (
        <View style={{ justifyContent: "center" }}>
          {field}
          <Pressable
            onPress={() => setHidden((h) => !h)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={hidden ? "Show password" : "Hide password"}
            style={{ position: "absolute", right: T.ios ? 0 : 6, height: "100%", width: 44, alignItems: "center", justifyContent: "center" }}
          >
            <Icon name={hidden ? "eye" : "eyeOff"} size={20} color={T.fg2} />
          </Pressable>
        </View>
      ) : field}
    </FieldBox>
  );
}

export function ReadOnly({ label, value, sub }: { label: string; value: string; sub?: string }) {
  const T = useT();
  return (
    <FieldBox label={label} hint={sub}>
      <View style={[inputStyle(T), { justifyContent: "center", borderColor: T.ios ? "transparent" : T.sep, backgroundColor: T.roBg }]}>
        <Txt style={{ color: T.fg2, fontSize: T.ios ? 17 : 16 }}>{value}</Txt>
      </View>
    </FieldBox>
  );
}

export function Seg<K extends string>({ label, options, value, onChange }: { label: string; options: [K, string][]; value: K; onChange: (k: K) => void }) {
  const T = useT();
  return (
    <FieldBox label={label}>
      <View
        accessibilityRole="radiogroup"
        style={{
          flexDirection: "row", height: T.segH, borderRadius: T.segR, backgroundColor: T.ios ? T.segBg : "transparent",
          padding: T.ios ? 2 : 0, borderWidth: T.ios ? 0 : 1, borderColor: T.outline, overflow: "hidden", marginTop: T.ios ? 6 : 0,
        }}
      >
        {options.map(([k, l], i) => {
          const on = k === value;
          return (
            <Pressable
              key={k}
              onPress={() => onChange(k)}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              style={{
                flex: 1, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6,
                borderRadius: T.ios ? 7 : 0, backgroundColor: on ? T.segOn : T.ios ? "transparent" : T.segBg,
                borderLeftWidth: !T.ios && i > 0 ? 1 : 0, borderLeftColor: T.outline,
                ...(T.ios && on ? { shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 1 } : null),
              }}
            >
              {!T.ios && on ? <Icon name="check" size={16} color={T.icFg} /> : null}
              <Txt style={{ fontSize: 14, fontWeight: on ? "600" : "500", color: T.fg }}>{l}</Txt>
            </Pressable>
          );
        })}
      </View>
    </FieldBox>
  );
}

export function Stepper({ label, sub, value, onChange, step, err }: { label: string; sub?: string; value: string; onChange: (v: string) => void; step: number; err?: string }) {
  const T = useT();
  const n = parseInt(value.replace(/[^0-9]/g, ""), 10) || 0;
  const btn = (icon: IconName, next: number, a11y: string) => (
    <Pressable
      onPress={() => onChange(String(Math.max(0, next)))}
      accessibilityRole="button"
      accessibilityLabel={`${a11y} ${label}`}
      hitSlop={6}
      style={{
        width: T.ios ? 34 : 40, height: T.ios ? 34 : 40, borderRadius: T.ios ? 8 : 20, alignItems: "center", justifyContent: "center",
        backgroundColor: T.stepperBg, borderWidth: T.ios ? 0 : 1, borderColor: T.outline,
      }}
    >
      <Icon name={icon} size={18} color={T.fg} />
    </Pressable>
  );
  return (
    <FieldBox label={label} sub={sub} err={err} row>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        {btn("minus", n - step, "Decrease")}
        <TextInput
          value={value}
          onChangeText={(v) => onChange(v.replace(/[^0-9]/g, ""))}
          keyboardType="number-pad"
          accessibilityLabel={label}
          placeholder="0"
          placeholderTextColor={T.fg3}
          style={{
            width: 76, height: T.ios ? 34 : 40, textAlign: "center", fontSize: 17, fontWeight: "600", color: T.fg,
            borderRadius: T.ios ? 8 : 4, backgroundColor: T.stepperInBg,
            borderWidth: err ? 1.5 : T.ios ? 0 : 1, borderColor: err ? T.danger : T.outline,
          }}
        />
        {btn("plus", n + step, "Increase")}
      </View>
    </FieldBox>
  );
}

export function Toggle({ label, sub, value, onChange }: { label: string; sub?: string; value: boolean; onChange: (v: boolean) => void }) {
  const T = useT();
  return (
    <FieldBox label={label} sub={sub} row>
      <Switch
        value={value}
        onValueChange={onChange}
        accessibilityLabel={label}
        trackColor={{ true: T.switchOn, false: T.switchOff }}
        thumbColor={T.ios ? undefined : value ? (T.dark ? T.b1Fg : "#fff") : T.switchThumbOff}
      />
    </FieldBox>
  );
}

export function Check({ label, sub, value, onChange }: { label: string; sub?: string; value: boolean; onChange: (v: boolean) => void }) {
  const T = useT();
  return (
    <Pressable
      onPress={() => onChange(!value)}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: value }}
      style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: T.ios ? 11 : 8, paddingHorizontal: T.ios ? 16 : 0, minHeight: 44 }}
    >
      <View
        style={{
          width: 24, height: 24, borderRadius: T.ios ? 12 : 4, borderWidth: value ? 0 : 2, borderColor: T.ios ? T.fg3 : T.fg2,
          backgroundColor: value ? T.tint : "transparent", alignItems: "center", justifyContent: "center",
        }}
      >
        {value ? <Icon name="check" size={16} color={T.b1Fg} strokeWidth={3} /> : null}
      </View>
      <View style={{ flex: 1 }}>
        <Txt style={{ fontSize: T.ios ? 17 : 16 }}>{label}</Txt>
        {sub ? <Txt style={{ fontSize: 13, color: T.fg2 }}>{sub}</Txt> : null}
      </View>
    </Pressable>
  );
}

export function Pick({ label, value, sub, onPress }: { label: string; value: string; sub?: string; onPress: () => void }) {
  const T = useT();
  return (
    <FieldBox label={label}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value}`}
        style={{
          flexDirection: "row", alignItems: "center", gap: 8, minHeight: T.ios ? 34 : 56, borderWidth: T.inBw, borderColor: T.inBd,
          borderRadius: T.inR, paddingHorizontal: T.ios ? 0 : 14, paddingVertical: T.ios ? 0 : 8,
        }}
      >
        <View style={{ flex: 1 }}>
          <Txt style={{ fontSize: T.ios ? 17 : 16, fontWeight: "500" }}>{value}</Txt>
          {sub ? <Txt style={{ fontSize: 13, color: T.fg2 }}>{sub}</Txt> : null}
        </View>
        <Icon name="chevD" size={20} color={T.fg2} />
      </Pressable>
    </FieldBox>
  );
}

/** Dropdown as a row that opens a bottom sheet of choices. */
export function Select({ label, value, options, onChange, err }: { label: string; value: string; options: { v: string; l: string }[]; onChange: (v: string) => void; err?: string }) {
  const T = useT();
  const [open, setOpen] = useState(false);
  const cur = options.find((o) => o.v === value);
  return (
    <>
      <FieldBox label={label} err={err}>
        <Pressable
          onPress={() => setOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${cur?.l ?? "Choose"}`}
          style={[inputStyle(T, err), { flexDirection: "row", alignItems: "center" }]}
        >
          <Txt style={{ flex: 1, fontSize: T.ios ? 17 : 16, color: cur && cur.v ? T.fg : T.fg3 }}>{cur?.l || "Choose…"}</Txt>
          <Icon name="chevD" size={20} color={T.fg2} />
        </Pressable>
      </FieldBox>
      <Sheet visible={open} title={label} onClose={() => setOpen(false)}>
        <List>
          {options.filter((o) => o.v !== "").map((o) => (
            <Row key={o.v} t={o.l} ic={o.v === value ? "check" : undefined} fw={o.v === value ? "600" : "400"} onPress={() => { onChange(o.v); setOpen(false); }} />
          ))}
        </List>
      </Sheet>
    </>
  );
}

/* ───────────── Misc sections ───────────── */

export function Search({ value, onChangeText, ph }: { value: string; onChangeText: (v: string) => void; ph: string }) {
  const T = useT();
  return (
    <View style={{ marginHorizontal: 16, marginBottom: T.ios ? 16 : 20, height: T.srH, borderRadius: T.srR, backgroundColor: T.srBg, flexDirection: "row", alignItems: "center", paddingHorizontal: T.ios ? 10 : 18, gap: T.ios ? 6 : 14 }}>
      <Icon name="search" size={18} color={T.fg2} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={ph}
        placeholderTextColor={T.placeholder}
        accessibilityLabel={ph}
        returnKeyType="search"
        style={{ flex: 1, fontSize: T.ios ? 17 : 16, color: T.fg, height: "100%" }}
      />
      {value ? (
        <Pressable onPress={() => onChangeText("")} accessibilityLabel="Clear search" hitSlop={8}>
          <Icon name="x" size={18} color={T.fg2} />
        </Pressable>
      ) : null}
    </View>
  );
}

export function Progress({ count, step, label }: { count: number; step: number; label: string }) {
  const T = useT();
  return (
    <View style={{ marginHorizontal: 16, marginBottom: T.secGap, gap: 8 }}>
      <View style={{ flexDirection: "row", gap: 4 }}>
        {Array.from({ length: count }).map((_, i) => (
          <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i <= step ? T.tint : T.sep }} />
        ))}
      </View>
      <Txt style={{ fontSize: 13, color: T.fg2 }}>{label}</Txt>
    </View>
  );
}

export function Avatar({ ini, size = 64 }: { ini: string; size?: number }) {
  const T = useT();
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: T.icBg, alignItems: "center", justifyContent: "center" }}>
      <Txt style={{ color: T.icFg, fontSize: size * 0.38, fontWeight: "600" }}>{ini}</Txt>
    </View>
  );
}

export function SigPreview({ d, w = 96, h = 40 }: { d: string; w?: number; h?: number }) {
  return (
    <View style={{ width: w, height: h, backgroundColor: "#fff", borderRadius: 6 }}>
      <Svg width={w} height={h} viewBox="0 0 320 140">
        <Path d={d} stroke="#111" strokeWidth={5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </View>
  );
}

export function PhotoView({ uri, h = 200 }: { uri: string; h?: number }) {
  const T = useT();
  return <Image source={{ uri }} accessibilityIgnoresInvertColors style={{ width: "100%", height: h, borderRadius: T.tileR, backgroundColor: T.imgBg }} resizeMode="cover" />;
}

/* ───────────── Bottom sheet ───────────── */

export function Sheet({ visible, title, onClose, children }: { visible: boolean; title: string; onClose: () => void; children?: React.ReactNode }) {
  const T = useT();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={{ flex: 1, backgroundColor: T.scrim }} onPress={onClose} accessibilityLabel="Close" />
      <View style={{ backgroundColor: T.sheetBg, borderTopLeftRadius: T.sheetR, borderTopRightRadius: T.sheetR, maxHeight: "82%", paddingBottom: insets.bottom + 12 }}>
        <View style={{ alignItems: "center", paddingTop: 8 }}>
          <View style={{ width: T.ios ? 36 : 32, height: T.ios ? 5 : 4, borderRadius: 3, backgroundColor: T.grab }} />
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 10 }}>
          <Txt accessibilityRole="header" style={{ flex: 1, fontSize: T.ios ? 17 : 22, fontWeight: T.ios ? "600" : "400", textAlign: T.ios ? "center" : "left", marginLeft: T.ios ? 48 : 0 }}>
            {title}
          </Txt>
          <Pressable onPress={onClose} accessibilityRole="button" hitSlop={8} style={{ minWidth: 48, alignItems: "flex-end" }}>
            <Txt style={{ color: T.tint, fontSize: T.ios ? 17 : 14, fontWeight: T.ios ? "600" : "500" }}>{T.ios ? "Done" : "Close"}</Txt>
          </Pressable>
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: 8 }}>
          {children}
        </ScrollView>
      </View>
    </Modal>
  );
}
