import React, { useRef, useState } from "react";
import {
  Image,
  KeyboardAvoidingView,
  ScrollView,
  View,
  type TextInputInstance,
} from "react-native";
import { router, type Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/lib/theme";
import { Banner, Btn, Btns, Input, List, Row, Sheet, Txt } from "@/components/m/kit";
import { loginErrorMessage } from "@/lib/api";
import { ROOT } from "@/lib/nav";
import { ROLE_LABEL, useSession } from "@/lib/session";
import type { AppRole } from "@/lib/types";
import { MAX_FORM_WIDTH, useColumn, useResponsive } from "@/hooks/useResponsive";
import { useKeyboardScroll } from "@/hooks/useKeyboardScroll";
import { TYPE } from "@/lib/fonts";

export default function SignIn() {
  const { T } = useTheme();
  const insets = useSafeAreaInsets();
  const { signIn, signInDemo } = useSession();
  const col = useColumn(MAX_FORM_WIDTH);
  const { isShort, isCompact } = useResponsive();
  const seal = isShort ? 56 : isCompact ? 80 : 96;
  const [id, setId] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [forgot, setForgot] = useState(false);
  const [demo, setDemo] = useState(false);
  const setScroll = useKeyboardScroll();
  const passwordInput = useRef<TextInputInstance>(null);
  const canSignIn = !busy && !!id.trim() && !!pw;

  const enter = async () => {
    if (!canSignIn) return;
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
            paddingTop: insets.top + (isShort ? 12 : 32),
            paddingBottom: insets.bottom + 16,
          },
        ]}
      >
        <View
          style={{
            alignItems: "center",
            paddingHorizontal: isCompact ? 16 : 24,
            marginBottom: isShort ? 12 : 24,
            gap: isShort ? 4 : 6,
          }}
        >
          {/* The seal carries its own white field and ring, so it needs no card in dark mode. */}
          <Image
            source={require("../../assets/images/moh-seal.png")}
            accessible
            accessibilityRole="image"
            accessibilityLabel="The Republic of Uganda, Ministry of Health"
            style={{ width: seal, height: seal, marginBottom: isShort ? 4 : 8 }}
            resizeMode="contain"
          />
          <Txt
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

        <Txt
          accessibilityRole="header"
          style={{
            ...TYPE.title,
            fontWeight: "700",
            paddingHorizontal: 16,
            marginBottom: T.ios ? 4 : 8,
          }}
        >
          Sign in
        </Txt>
        {err ? <Banner tone="danger" title="Couldn't sign in" body={err} /> : null}
        <View style={{ marginHorizontal: 16, marginBottom: 18, gap: 14 }}>
          <Input
            label="Email, username or phone"
            outlined
            leadingIcon="user"
            value={id}
            onChangeText={(value) => {
              setId(value);
              setErr("");
            }}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username"
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => passwordInput.current?.focus()}
          />
          <Input
            label="Password"
            outlined
            leadingIcon="shield"
            value={pw}
            onChangeText={(value) => {
              setPw(value);
              setErr("");
            }}
            secure
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="password"
            inputRef={passwordInput}
            returnKeyType="go"
            onSubmitEditing={enter}
          />
        </View>
        <Btns>
          <Btn label={busy ? "Signing in…" : "Sign in"} onPress={enter} dis={!canSignIn} />
          <Btn label="Forgot password?" kind="text" onPress={() => setForgot(true)} />
          {__DEV__ ? (
            <Btn label="Try with sample data" kind="text" onPress={() => setDemo(true)} />
          ) : null}
        </Btns>
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
          Contact your district focal person or CLIMS administrator to reset your password.
        </Txt>
        <Btns>
          <Btn label="Done" onPress={() => setForgot(false)} />
        </Btns>
      </Sheet>

      <Sheet visible={demo} title="Sample data" icon="user" onClose={() => setDemo(false)}>
        <List h="Sign in as" f="Development builds only. Sample Wakiso data is kept on this phone.">
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
