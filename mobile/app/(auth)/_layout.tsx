import React from "react";
import { Stack } from "expo-router";

const AuthLayout = () => (
  <Stack screenOptions={{ headerShown: false }}>
    <Stack.Screen name="signin" />
  </Stack>
);

export default AuthLayout;
