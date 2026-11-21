import React, { useState } from "react";
import { Image, KeyboardAvoidingView, ScrollView, View } from "react-native";
import { router, type Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/lib/theme";
import { Banner, Btn, Btns, Fields, Input, List, Note, Row, Sheet, Txt } from "@/components/m/kit";
import { loginErrorMessage } from "@/lib/api";
import { ROOT } from "@/lib/nav";
import { DCFP } from "@/lib/seed";
import { ROLE_LABEL, useSession } from "@/lib/session";
import type { AppRole } from "@/lib/types";
import { call } from "@/screens/common";
import { MAX_FORM_WIDTH, useColumn, useResponsive } from "@/hooks/useResponsive";
import { useKeyboardScroll } from "@/hooks/useKeyboardScroll";
import { TYPE } from "@/lib/fonts";

export default function SignIn() {
  const { T, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const { signIn, signInDemo } = useSession();
  const col = useColumn(MAX_FORM_WIDTH);
  const { isShort, isCompact } = useResponsive();
  // The MoH crest with its wordmark, sized like the EMS app's sign-in (448×408 source).
  const logoH = isShort ? 80 : isCompact ? 104 : 120;
  const logoW = Math.round((logoH * 448) / 408);
  const [id, setId] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [forgot, setForgot] = useState(false);
  const [demo, setDemo] = useState(false);
  const setScroll = useKeyboardScroll();

  const enter = async () => {
    setErr("");
    setBusy(true);
    try {
      await signIn(id, pw);
      router.replace("/");
    } catch (e) {
      setErr(loginErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const tryDemo = async (role: AppRole) => {
    setDemo(false);
    await signInDemo(role);
    router.replace(`/${ROOT[role]}` as Href);
  };

  return (
    // Padding on both platforms: Android draws edge to edge, so without it the keyboard covers the
    // sign-in fields; the focused field is then scrolled into view above the keyboard.
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: T.bg }} behavior="padding">
      <ScrollView
        ref={setScroll}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          col.style,
          {
            flexGrow: 1,
            justifyContent: "center",
            paddingTop: insets.top + (isShort ? 16 : 40),
            paddingBottom: insets.bottom + 24,
          },
        ]}
      >
        <View
          style={{
            alignItems: "center",
            paddingHorizontal: isCompact ? 16 : 24,
            marginBottom: isShort ? 20 : 32,
            gap: isShort ? 4 : 6,
          }}
        >
          <View
            accessible
            accessibilityRole="image"
            accessibilityLabel="The Republic of Uganda, Ministry of Health"
            style={{ marginBottom: isShort ? 4 : 8 }}
          >
            {/* The crest's lettering is black; the dark theme uses a copy with light lettering. */}
            <Image
              source={
                scheme === "dark"
                  ? require("../../assets/images/moh-logo-dark.png")
                  : require("../../assets/images/moh-logo.png")
              }
              style={{ width: logoW, height: logoH }}
              resizeMode="contain"
            />
          </View>
          <Txt
            accessibilityRole="header"
            style={{
              fontSize: isShort || isCompact ? 28 : 32,
              fontWeight: "700",
            }}
          >
            CLIMS
          </Txt>
          <Txt style={{ color: T.fg2, fontSize: 15, fontWeight: "500" }}>
            Ministry of Health, Uganda
          </Txt>
        </View>

        {err ? <Banner tone="danger" title="Couldn't sign in" body={err} /> : null}

        <Txt
          style={{
            ...TYPE.title,
            fontWeight: "700",
            paddingHorizontal: 16,
            marginBottom: T.ios ? 4 : 8,
          }}
        >
          Sign in
        </Txt>
        <Fields>
          <Input
            label="Email, username or phone"
            value={id}
            onChangeText={setId}
            autoCapitalize="none"
            autoComplete="username"
            ph="name@example.org or 0772 123456"
          />
          <Input
            label="Password"
            value={pw}
            onChangeText={setPw}
            secure
            autoCapitalize="none"
            autoComplete="password"
          />
        </Fields>
        <Btns>
          <Btn
            label={busy ? "Signing in…" : "Sign in"}
            onPress={enter}
            dis={busy || !id.trim() || !pw}
          />
          <Btn label="Forgot password?" kind="text" onPress={() => setForgot(true)} />
          {__DEV__ ? (
            <Btn label="Try with sample data" kind="secondary" onPress={() => setDemo(true)} />
          ) : null}
        </Btns>
        <Note
          center
          text="You stay signed in on this phone. CLIMS keeps working when there is no network."
        />
      </ScrollView>

      <Sheet
        visible={forgot}
        title="Forgot password"
        icon="shield"
        tone="info"
        onClose={() => setForgot(false)}
      >
        <Txt
          style={{
            marginHorizontal: 24,
            marginBottom: 16,
            fontSize: 15,
            lineHeight: 21,
            color: T.fg,
          }}
        >
          {`Only your district focal person can reset your password. Call ${DCFP.name} to get a new one by SMS.`}
        </Txt>
        <Btns>
          <Btn
            label={`Call ${DCFP.name.split(" ")[0]}`}
            icon="phone"
            onPress={() => {
              setForgot(false);
              call(DCFP.phone);
            }}
          />
        </Btns>
      </Sheet>

      <Sheet visible={demo} title="Sample data" icon="user" onClose={() => setDemo(false)}>
        <List
          h="Sign in as"
          f="Development builds only. Sample Wakiso data is kept on this phone; the API has no hotspot or order endpoints yet."
        >
          {(["vht", "hm", "rider"] as AppRole[]).map((r) => (
            <Row
              key={r}
              t={ROLE_LABEL[r]}
              ic={r === "vht" ? "pin" : r === "hm" ? "home" : "truck"}
              chev
              onPress={() => tryDemo(r)}
            />
          ))}
        </List>
      </Sheet>
    </KeyboardAvoidingView>
  );
}
