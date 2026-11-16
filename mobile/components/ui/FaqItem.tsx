import React, { useState } from "react";
import { Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/context/theme/ThemeProvider";
import AppText from "./AppText";

/** Expandable question/answer row. */
const FaqItem: React.FC<{ question: string; answer: string; last?: boolean }> = ({
  question,
  answer,
  last,
}) => {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <View style={{ borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.border }}>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={question}
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          minHeight: 56,
          paddingVertical: 12,
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <AppText variant="bodyStrong" style={{ flex: 1, marginRight: 12 }}>
          {question}
        </AppText>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={20} color={colors.textMuted} />
      </Pressable>
      {open ? (
        <AppText variant="body" color="textMuted" style={{ paddingBottom: 16 }}>
          {answer}
        </AppText>
      ) : null}
    </View>
  );
};

export default FaqItem;
