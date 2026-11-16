import React from "react";
import { View } from "react-native";
import { AppText } from "@/components/ui";

interface LegendProps {
  data: { key: string; value: number; svg: { fill: string } }[];
  total: number;
}

const Legend: React.FC<LegendProps> = ({ data, total }) => (
  <View style={{ marginTop: 16 }}>
    {data.map((entry) => (
      <View
        key={entry.key}
        style={{ flexDirection: "row", alignItems: "center", paddingVertical: 6 }}
      >
        <View
          style={{
            width: 12,
            height: 12,
            borderRadius: 6,
            backgroundColor: entry.svg.fill,
            marginRight: 10,
          }}
        />
        <AppText variant="body" style={{ flex: 1 }} numberOfLines={1}>
          {entry.key}
        </AppText>
        <AppText variant="bodyStrong">{entry.value}</AppText>
        <AppText variant="caption" color="textMuted" style={{ width: 52, textAlign: "right" }}>
          {total ? Math.round((entry.value / total) * 100) : 0}%
        </AppText>
      </View>
    ))}
  </View>
);

export default Legend;
