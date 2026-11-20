import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  View,
  type GestureResponderEvent,
} from "react-native";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import * as ImagePicker from "expo-image-picker";
import { useT } from "@/lib/theme";
import Icon from "./Icon";
import { Btn, PhotoView, Section, Txt } from "./kit";

/* ───────────── Map card ───────────── */

export const mapsUrl = (lat: number, lng: number, label: string) =>
  Platform.OS === "ios"
    ? `https://maps.apple.com/?ll=${lat},${lng}&q=${encodeURIComponent(label)}`
    : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;

/**
 * Location preview. Draws a schematic map with a pin rather than loading tiles,
 * so it works with no network; "Directions" hands off to the phone's maps app.
 */
export function MapCard({
  h,
  lat,
  lng,
  cap,
  cap2,
  link,
  wait,
  waitTxt = "Finding your location…",
  act,
}: {
  h?: string;
  lat?: number;
  lng?: number;
  cap: string;
  cap2?: string;
  link?: string;
  wait?: boolean;
  waitTxt?: string;
  act?: { label: string; onPress: () => void };
}) {
  const T = useT();
  const has = lat != null && lng != null;
  return (
    <Section h={h}>
      <View
        style={{
          marginHorizontal: 16,
          borderRadius: T.cardR,
          overflow: "hidden",
          backgroundColor: T.cardBg,
        }}
      >
        <View
          style={{
            height: 160,
            backgroundColor: T.map.bg,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Svg
            width="100%"
            height="100%"
            style={{ position: "absolute" }}
            preserveAspectRatio="none"
            viewBox="0 0 360 160"
          >
            <Rect x="0" y="0" width="360" height="160" fill={T.map.bg} />
            <Path
              d="M-10 120 C 80 90, 160 140, 370 70"
              stroke={T.map.road}
              strokeWidth="14"
              fill="none"
            />
            <Path
              d="M120 -10 C 140 60, 110 110, 150 170"
              stroke={T.map.road}
              strokeWidth="9"
              fill="none"
            />
            <Path d="M250 -10 L 230 170" stroke={T.map.road2} strokeWidth="7" fill="none" />
            <Path d="M0 30 L 360 50" stroke={T.map.road} strokeWidth="5" fill="none" />
            <Rect x="20" y="58" width="60" height="34" rx="4" fill={T.map.block} />
            <Rect x="270" y="90" width="70" height="44" rx="4" fill={T.map.block} />
            <Rect x="170" y="6" width="44" height="30" rx="4" fill={T.map.water} />
          </Svg>
          {wait ? (
            <View style={{ alignItems: "center", gap: 8 }}>
              <ActivityIndicator color={T.tint} />
              <Txt style={{ fontSize: 14, color: T.fg2 }}>{waitTxt}</Txt>
            </View>
          ) : has ? (
            <Svg width={36} height={44} viewBox="0 0 24 30">
              <Path
                d="M12 0C5.4 0 0 5.2 0 11.6 0 20.3 12 30 12 30s12-9.7 12-18.4C24 5.2 18.6 0 12 0z"
                fill={T.map.pin}
              />
              <Circle cx="12" cy="11.5" r="4.5" fill="#fff" />
            </Svg>
          ) : null}
        </View>
        <View style={{ padding: 14, flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Txt style={{ fontSize: 15, fontWeight: "600" }}>{cap}</Txt>
            {cap2 ? <Txt style={{ fontSize: 13, color: T.fg2 }}>{cap2}</Txt> : null}
          </View>
          {has && link && !wait ? (
            <Pressable
              onPress={() => Linking.openURL(mapsUrl(lat!, lng!, cap))}
              accessibilityRole="link"
              hitSlop={8}
            >
              <Txt style={{ color: T.tint, fontWeight: "600", fontSize: 15 }}>{link}</Txt>
            </Pressable>
          ) : null}
          {act ? (
            <Pressable onPress={act.onPress} accessibilityRole="button" hitSlop={8}>
              <Txt style={{ color: T.tint, fontWeight: "600", fontSize: 15 }}>{act.label}</Txt>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Section>
  );
}

/* ───────────── Photo field ───────────── */

export function PhotoField({
  h,
  f,
  value,
  onChange,
  hint,
  edit = true,
  when,
}: {
  h?: string;
  f?: string;
  value?: string | null;
  onChange?: (uri: string | null) => void;
  hint?: string;
  edit?: boolean;
  when?: string;
}) {
  const T = useT();
  const [busy, setBusy] = useState(false);
  const take = async (src: "camera" | "library") => {
    setBusy(true);
    try {
      const perm =
        src === "camera"
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return;
      const opts: ImagePicker.ImagePickerOptions = {
        quality: 0.6,
        mediaTypes: ["images"],
        allowsEditing: false,
      };
      const r =
        src === "camera"
          ? await ImagePicker.launchCameraAsync(opts)
          : await ImagePicker.launchImageLibraryAsync(opts);
      if (!r.canceled && r.assets[0]) onChange?.(r.assets[0].uri);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Section h={h} f={f}>
      <View
        style={{
          marginHorizontal: 16,
          borderRadius: T.cardR,
          backgroundColor: T.cardBg,
          padding: 12,
          gap: 10,
        }}
      >
        {value ? (
          <>
            <PhotoView uri={value} />
            {when ? <Txt style={{ fontSize: 13, color: T.fg2 }}>{when}</Txt> : null}
          </>
        ) : (
          <View
            style={{
              height: 120,
              borderRadius: T.tileR,
              borderWidth: 1.5,
              borderStyle: "dashed",
              borderColor: T.sep,
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              paddingHorizontal: 16,
            }}
          >
            <Icon name="camera" size={28} color={T.fg3} />
            <Txt style={{ fontSize: 14, color: T.fg2, textAlign: "center" }}>
              {hint ?? "Take a clear photo."}
            </Txt>
          </View>
        )}
        {edit ? (
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Btn
                label={value ? "Retake" : "Take photo"}
                icon="camera"
                kind="secondary"
                small
                dis={busy}
                onPress={() => take("camera")}
              />
            </View>
            {value ? (
              <Btn label="Remove" kind="text" small onPress={() => onChange?.(null)} />
            ) : (
              <Btn
                label="Gallery"
                icon="image"
                kind="text"
                small
                dis={busy}
                onPress={() => take("library")}
              />
            )}
          </View>
        ) : null}
      </View>
    </Section>
  );
}

/* ───────────── Signature pad ───────────── */

const VB_W = 320;
const VB_H = 140;

export function SignaturePad({
  who,
  value,
  onChange,
}: {
  who: string;
  value?: string | null;
  onChange: (d: string | null) => void;
}) {
  const T = useT();
  const [d, setD] = useState(value ?? "");
  const box = useRef({ w: VB_W, h: VB_H });
  const path = useRef(value ?? "");

  const addPoint = (cmd: "M" | "L", e: GestureResponderEvent) => {
    const { locationX, locationY } = e.nativeEvent;
    const x = (locationX * VB_W) / box.current.w;
    const y = (locationY * VB_H) / box.current.h;
    path.current += `${cmd}${x.toFixed(1)} ${y.toFixed(1)} `;
    setD(path.current);
  };

  const clear = () => {
    path.current = "";
    setD("");
    onChange(null);
  };

  return (
    <Section h="Signature" f="Ask the person receiving the stock to sign with a finger.">
      <View
        style={{
          marginHorizontal: 16,
          borderRadius: T.cardR,
          backgroundColor: T.cardBg,
          padding: 12,
          gap: 8,
        }}
      >
        <View
          onLayout={(e) => {
            box.current = { w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height };
          }}
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderTerminationRequest={() => false}
          onResponderGrant={(e) => addPoint("M", e)}
          onResponderMove={(e) => addPoint("L", e)}
          onResponderRelease={() =>
            onChange(path.current.includes("L") ? path.current.trim() : null)
          }
          accessibilityLabel={`Signature pad. ${who}`}
          style={{
            height: 150,
            backgroundColor: "#fff",
            borderRadius: T.tileR,
            borderWidth: 1,
            borderColor: T.sep,
            overflow: "hidden",
          }}
        >
          <Svg width="100%" height="100%" viewBox={`0 0 ${VB_W} ${VB_H}`} pointerEvents="none">
            <Path
              d={`M20 ${VB_H - 30} L${VB_W - 20} ${VB_H - 30}`}
              stroke="#d0d0d0"
              strokeWidth={1.5}
              strokeDasharray="6 6"
            />
            {d ? (
              <Path
                d={d}
                stroke="#111"
                strokeWidth={5}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}
          </Svg>
          {!d ? (
            <View
              pointerEvents="none"
              style={{ position: "absolute", left: 0, right: 0, top: 40, alignItems: "center" }}
            >
              <Icon name="pen" size={20} color={T.fg3} />
              <Txt style={{ color: T.fg3, fontSize: 14, marginTop: 4 }}>Sign here</Txt>
            </View>
          ) : null}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Txt style={{ flex: 1, fontSize: 13, color: T.fg2 }}>{who}</Txt>
          {d ? <Btn label="Clear" kind="text" small onPress={clear} /> : null}
        </View>
      </View>
    </Section>
  );
}
