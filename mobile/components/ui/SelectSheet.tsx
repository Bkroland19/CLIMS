import React, { useState } from "react";
import { FlatList, Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/context/theme/ThemeProvider";
import { TOUCH_TARGET } from "@/constants/theme";
import AppText from "./AppText";
import BottomSheet from "./BottomSheet";

export interface SelectOption {
  key: string | number;
  label: string;
  value: string | number;
}

interface Props {
  label: string;
  placeholder?: string;
  value: string | number | null | undefined;
  options: SelectOption[];
  onChange: (value: any) => void;
  error?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  onClose?: () => void;
}

/** Bottom-sheet picker: easier to use one-handed than a native dropdown. */
const SelectSheet: React.FC<Props> = ({
  label,
  placeholder = "Select an option",
  value,
  options,
  onChange,
  error,
  icon,
  onClose,
}) => {
  const { colors, radius } = useTheme();
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  const close = () => {
    setOpen(false);
    onClose?.();
  };

  return (
    <View>
      <AppText variant="label" color="textMuted" style={{ marginBottom: 6 }}>
        {label}
      </AppText>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${selected?.label ?? "not selected"}`}
        style={{
          flexDirection: "row",
          alignItems: "center",
          minHeight: TOUCH_TARGET + 8,
          paddingHorizontal: 14,
          backgroundColor: colors.surface,
          borderRadius: radius.md,
          borderWidth: error ? 2 : 1.5,
          borderColor: error ? colors.danger : colors.border,
        }}
      >
        {icon ? (
          <Ionicons name={icon} size={20} color={colors.textMuted} style={{ marginRight: 10 }} />
        ) : null}
        <AppText
          variant="body"
          color={selected ? "text" : "placeholder"}
          style={{ flex: 1 }}
          numberOfLines={1}
        >
          {selected?.label ?? placeholder}
        </AppText>
        <Ionicons name="chevron-down" size={20} color={colors.textMuted} />
      </Pressable>
      {error ? (
        <View style={{ flexDirection: "row", marginTop: 6, alignItems: "center" }}>
          <Ionicons name="alert-circle" size={16} color={colors.danger} />
          <AppText variant="caption" color="danger" style={{ marginLeft: 6, flex: 1 }}>
            {error}
          </AppText>
        </View>
      ) : null}

      <BottomSheet visible={open} title={label} onClose={close} scroll={false}>
        <FlatList
          data={options}
          style={{ flexGrow: 0 }}
          keyExtractor={(o) => String(o.key)}
          renderItem={({ item }) => {
            const active = item.value === value;
            return (
              <Pressable
                onPress={() => {
                  onChange(item.value);
                  close();
                }}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  minHeight: 56,
                  paddingHorizontal: 20,
                  backgroundColor: active ? colors.brandSoft : "transparent",
                }}
              >
                <AppText
                  variant={active ? "bodyStrong" : "body"}
                  color={active ? "brandText" : "text"}
                  style={{ flex: 1 }}
                >
                  {item.label}
                </AppText>
                {active ? (
                  <Ionicons name="checkmark-circle" size={22} color={colors.brandText} />
                ) : null}
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <AppText variant="body" color="textMuted" style={{ padding: 20 }}>
              Nothing to choose from yet.
            </AppText>
          }
        />
      </BottomSheet>
    </View>
  );
};

export default SelectSheet;
