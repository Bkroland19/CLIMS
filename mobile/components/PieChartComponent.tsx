import React from "react";
import { View } from "react-native";
import Svg, { Circle, G, Path } from "react-native-svg";
import { processData } from "@/utils/processData";
import { useTheme } from "@/context/theme/ThemeProvider";
import { AppText } from "@/components/ui";
import Legend from "./Legend";

interface PieChartComponentProps {
  data: any;
}

const SIZE = 200;
const OUTER = 92;
const INNER = 62;
const C = SIZE / 2;

const point = (r: number, angle: number) => ({
  x: C + r * Math.cos(angle),
  y: C + r * Math.sin(angle),
});

/** SVG path for one donut segment between two angles (radians). */
const segment = (start: number, end: number) => {
  const large = end - start > Math.PI ? 1 : 0;
  const o1 = point(OUTER, start);
  const o2 = point(OUTER, end);
  const i2 = point(INNER, end);
  const i1 = point(INNER, start);
  return [
    `M ${o1.x} ${o1.y}`,
    `A ${OUTER} ${OUTER} 0 ${large} 1 ${o2.x} ${o2.y}`,
    `L ${i2.x} ${i2.y}`,
    `A ${INNER} ${INNER} 0 ${large} 0 ${i1.x} ${i1.y}`,
    "Z",
  ].join(" ");
};

/** Donut chart of quantity per brand. Colours + a value legend (not colour alone). */
const PieChartComponent: React.FC<PieChartComponentProps> = ({ data }) => {
  const { colors } = useTheme();
  const quantities = processData(data);
  const total = quantities.reduce((acc, e) => acc + e.value, 0);

  const slices = quantities.map((entry, index) => ({
    value: entry.value,
    key: entry.key,
    svg: { fill: colors.chart[index % colors.chart.length] },
  }));

  let angle = -Math.PI / 2;
  const GAP = slices.length > 1 ? 0.03 : 0;

  return (
    <View
      accessible
      accessibilityLabel={`Stock by brand. Total ${total} pieces. ${quantities
        .map((q) => `${q.key}: ${q.value}`)
        .join(", ")}`}
    >
      <View style={{ height: SIZE, alignItems: "center", justifyContent: "center" }}>
        <Svg width={SIZE} height={SIZE}>
          <G>
            {total <= 0 ? (
              <Circle
                cx={C}
                cy={C}
                r={(OUTER + INNER) / 2}
                stroke={colors.surfaceAlt}
                strokeWidth={OUTER - INNER}
                fill="none"
              />
            ) : slices.length === 1 ? (
              <Circle
                cx={C}
                cy={C}
                r={(OUTER + INNER) / 2}
                stroke={slices[0].svg.fill}
                strokeWidth={OUTER - INNER}
                fill="none"
              />
            ) : (
              slices.map((s) => {
                const sweep = (s.value / total) * Math.PI * 2;
                const start = angle + GAP / 2;
                const end = angle + sweep - GAP / 2;
                angle += sweep;
                return (
                  <Path
                    key={s.key}
                    d={segment(start, Math.max(end, start + 0.001))}
                    fill={s.svg.fill}
                  />
                );
              })
            )}
          </G>
        </Svg>
        <View pointerEvents="none" style={{ position: "absolute", alignItems: "center" }}>
          <AppText variant="title">{total}</AppText>
          <AppText variant="caption" color="textMuted">
            pieces
          </AppText>
        </View>
      </View>
      <Legend data={slices} total={total} />
    </View>
  );
};

export default PieChartComponent;
