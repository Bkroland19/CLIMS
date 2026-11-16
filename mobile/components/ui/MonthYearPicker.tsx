import React, { useState } from "react";
import { Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/context/theme/ThemeProvider";
import AppText from "./AppText";
import BottomSheet from "./BottomSheet";
import Button from "./Button";

export interface Period {
  month: number; // 0-11
  year: number;
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const isAfter = (p: Period, ref: Period) =>
  p.year > ref.year || (p.year === ref.year && p.month > ref.month);

interface Props {
  value: Period;
  onChange: (p: Period) => void;
  /** Latest selectable period (default: the current month). */
  max?: Period;
  /** Earliest selectable year (default: 5 years back). */
  minYear?: number;
}

/** Month + year selector: ‹ prev | "November 2026" (opens sheet) | next ›. */
const MonthYearPicker: React.FC<Props> = ({ value, onChange, max, minYear }) => {
  const { colors, radius } = useTheme();
  const now = new Date();
  const latest: Period = max ?? { month: now.getMonth(), year: now.getFullYear() };
  const earliestYear = minYear ?? latest.year - 5;
  const [open, setOpen] = useState(false);
  const [sheetYear, setSheetYear] = useState(value.year);

  const step = (n: number) => {
    const d = new Date(value.year, value.month + n, 1);
    const next = { month: d.getMonth(), year: d.getFullYear() };
    if (isAfter(next, latest) || next.year < earliestYear) return;
    Haptics.selectionAsync().catch(() => {});
    onChange(next);
  };

  const canPrev = new Date(value.year, value.month - 1, 1).getFullYear() >= earliestYear;
  const canNext = !isAfter(
    {
      month: value.month + 1 > 11 ? 0 : value.month + 1,
      year: value.month + 1 > 11 ? value.year + 1 : value.year,
    },
    latest,
  );

  const renderArrow = (dir: -1 | 1, enabled: boolean) => (
    <Pressable
      onPress={() => step(dir)}
      disabled={!enabled}
      accessibilityRole="button"
      accessibilityLabel={dir === -1 ? "Previous month" : "Next month"}
      style={{
        width: 48,
        height: 48,
        alignItems: "center",
        justifyContent: "center",
        opacity: enabled ? 1 : 0.3,
      }}
    >
      <Ionicons
        name={dir === -1 ? "chevron-back" : "chevron-forward"}
        size={22}
        color={colors.brandText}
      />
    </Pressable>
  );

  const isCurrent = value.month === latest.month && value.year === latest.year;

  return (
    <View>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: colors.surface,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: colors.border,
        }}
      >
        {renderArrow(-1, canPrev)}
        <Pressable
          onPress={() => {
            setSheetYear(value.year);
            setOpen(true);
          }}
          accessibilityRole="button"
          accessibilityLabel={`Period: ${MONTHS[value.month]} ${value.year}. Tap to change`}
          style={{
            flex: 1,
            minHeight: 48,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="calendar-outline" size={18} color={colors.brandText} />
          <AppText variant="bodyStrong" style={{ marginLeft: 8 }}>
            {MONTHS[value.month]} {value.year}
          </AppText>
          <Ionicons
            name="chevron-down"
            size={16}
            color={colors.textMuted}
            style={{ marginLeft: 4 }}
          />
        </Pressable>
        {renderArrow(1, canNext)}
      </View>

      <BottomSheet visible={open} title="Choose a month" onClose={() => setOpen(false)}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 8,
          }}
        >
          <Pressable
            onPress={() => setSheetYear((y) => Math.max(earliestYear, y - 1))}
            disabled={sheetYear <= earliestYear}
            accessibilityRole="button"
            accessibilityLabel="Previous year"
            style={{
              width: 48,
              height: 48,
              alignItems: "center",
              justifyContent: "center",
              opacity: sheetYear <= earliestYear ? 0.3 : 1,
            }}
          >
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </Pressable>
          <AppText variant="title" accessibilityLiveRegion="polite">
            {sheetYear}
          </AppText>
          <Pressable
            onPress={() => setSheetYear((y) => Math.min(latest.year, y + 1))}
            disabled={sheetYear >= latest.year}
            accessibilityRole="button"
            accessibilityLabel="Next year"
            style={{
              width: 48,
              height: 48,
              alignItems: "center",
              justifyContent: "center",
              opacity: sheetYear >= latest.year ? 0.3 : 1,
            }}
          >
            <Ionicons name="chevron-forward" size={22} color={colors.text} />
          </Pressable>
        </View>

        <View style={{ flexDirection: "row", flexWrap: "wrap", marginHorizontal: -4 }}>
          {MONTHS.map((m, i) => {
            const candidate = { month: i, year: sheetYear };
            const off = isAfter(candidate, latest);
            const selected = value.month === i && value.year === sheetYear;
            return (
              <View key={m} style={{ width: "33.333%", padding: 4 }}>
                <Pressable
                  disabled={off}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    onChange(candidate);
                    setOpen(false);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected, disabled: off }}
                  accessibilityLabel={`${m} ${sheetYear}`}
                  style={{
                    minHeight: 52,
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: radius.md,
                    backgroundColor: selected ? colors.brand : colors.surfaceAlt,
                    opacity: off ? 0.4 : 1,
                  }}
                >
                  <AppText
                    variant="label"
                    style={{
                      color: selected ? colors.onBrand : colors.text,
                      fontFamily: selected ? "Poppins-SemiBold" : "Poppins-Medium",
                    }}
                  >
                    {m.slice(0, 3)}
                  </AppText>
                </Pressable>
              </View>
            );
          })}
        </View>

        <Button
          title="Jump to this month"
          variant="secondary"
          icon="today-outline"
          disabled={isCurrent}
          onPress={() => {
            onChange(latest);
            setOpen(false);
          }}
          style={{ marginTop: 16, marginBottom: 8 }}
        />
      </BottomSheet>
    </View>
  );
};

export default MonthYearPicker;
