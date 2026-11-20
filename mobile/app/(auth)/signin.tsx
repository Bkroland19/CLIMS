import React, { useState } from "react";
import { Image, KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { router, type Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useT } from "@/lib/theme";
import { Banner, Btn, Btns, Fields, Input, List, Note, Row, Sheet, Txt } from "@/components/m/kit";
import { loginErrorMessage } from "@/lib/api";
import { ROOT } from "@/lib/nav";
import { DCFP } from "@/lib/seed";
import { ROLE_LABEL, useSession } from "@/lib/session";
import type { AppRole } from "@/lib/types";
import { call } from "@/screens/common";

export default function SignIn() {
  const T = useT();
  const insets = useSafeAreaInsets();
  const { signIn, signInDemo } = useSession();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [forgot, setForgot] = useState(false);
  const [demo, setDemo] = useState(false);

  const enter = async () => {
    setErr("");
    setBusy(true);
    try {
      await signIn(email, pw);
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
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: T.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 }}
      >
        <View style={{ alignItems: "center", paddingHorizontal: 24, marginBottom: 28, gap: 10 }}>
          <View
            accessible
            accessibilityLabel="Ministry of Health, Republic of Uganda"
            style={{
              width: 88,
              height: 88,
              borderRadius: T.ios ? 20 : 24,
              backgroundColor: "#fff",
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: T.sep,
            }}
          >
            <Image
              source={require("../../assets/images/coat-of-arms.png")}
              style={{ width: 64, height: 64 }}
              resizeMode="contain"
            />
          </View>
          <Txt
            accessibilityRole="header"
            style={{ fontSize: 34, fontWeight: "700", letterSpacing: 0.5 }}
          >
            CLIMS
          </Txt>
          <Txt style={{ color: T.fg2, fontSize: 15 }}>Ministry of Health · Uganda</Txt>
          <Txt
            style={{
              color: T.fg2,
              fontSize: 15,
              textAlign: "center",
              lineHeight: 21,
              marginTop: 4,
            }}
          >
            Sign in with the email and password your district focal person gave you.
          </Txt>
        </View>

        {err ? <Banner tone="danger" title="Couldn't sign in" body={err} /> : null}

        <Fields>
          <Input
            label="Email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            ph="name@example.org"
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
            dis={busy || !email.trim() || !pw}
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

      <Sheet visible={forgot} title="Forgot password" onClose={() => setForgot(false)}>
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

      <Sheet visible={demo} title="Sample data" onClose={() => setDemo(false)}>
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
