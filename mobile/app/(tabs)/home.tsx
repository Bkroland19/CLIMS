import React, { useEffect, useMemo, useState } from "react";
import { AppState, Pressable, RefreshControl, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import TopBar from "@/components/TopBar";
import StockActions from "@/components/StockActions";
import PieChartComponent from "@/components/PieChartComponent";
import {
  AppText,
  Button,
  Card,
  EmptyState,
  MonthYearPicker,
  Period,
  Reveal,
  Skeleton,
  StatTile,
  WeeklyBars,
} from "@/components/ui";
import { getHotSpotStock } from "../api/requests";
import { useGlobalContext } from "@/context/auth/GlobalProvider";
import { useTheme } from "@/context/theme/ThemeProvider";
import { useResponsive } from "@/hooks/useResponsive";
import { useStockAlert } from "@/hooks/useStockAlert";
import { friendlyError } from "@/utils/errors";
import { parseDate } from "@/utils/parseDate";

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

const greeting = () => {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
};

const Home: React.FC = () => {
  const { user } = useGlobalContext();
  const { colors, radius } = useTheme();
  const { contentStyle, gutter } = useResponsive();
  const queryClient = useQueryClient();
  const { notify, dialog } = useStockAlert();

  const now = new Date();
  const [period, setPeriod] = useState<Period>({ month: now.getMonth(), year: now.getFullYear() });
  const [refreshing, setRefreshing] = useState(false);

  const hotspotId = user?.hotspot_id;

  const { data, error, isLoading, refetch } = useQuery({
    queryKey: ["addStock", hotspotId],
    queryFn: () => getHotSpotStock(hotspotId),
    enabled: !!hotspotId,
    refetchOnWindowFocus: true,
    refetchInterval: 30000, // gentle on battery and mobile data; also refreshes on focus/foreground
  });

  /* ----- everything below is derived from the selected month + year ----- */
  const monthDeliveries = useMemo(() => {
    const all: any[] = Array.isArray(data) ? data : [];
    return all.filter((e) => {
      const d = parseDate(e.date_of_delivery);
      return d.getMonth() === period.month && d.getFullYear() === period.year;
    });
  }, [data, period]);

  const totalQuantity = monthDeliveries.reduce(
    (s, e) => s + (parseInt(e.quantity_brought, 10) || 0),
    0,
  );

  const weekly = useMemo(() => {
    const daysInMonth = new Date(period.year, period.month + 1, 0).getDate();
    const buckets = [
      { label: "1–7", value: 0 },
      { label: "8–14", value: 0 },
      { label: "15–21", value: 0 },
      { label: "22–28", value: 0 },
      ...(daysInMonth > 28 ? [{ label: `29–${daysInMonth}`, value: 0 }] : []),
    ];
    monthDeliveries.forEach((e) => {
      const day = parseDate(e.date_of_delivery).getDate();
      const i = Math.min(Math.floor((day - 1) / 7), buckets.length - 1);
      buckets[i].value += parseInt(e.quantity_brought, 10) || 0;
    });
    return buckets;
  }, [monthDeliveries, period]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") refetch();
    });
    return () => sub.remove();
  }, [refetch]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refetch(), queryClient.invalidateQueries({ queryKey: ["currentStock"] })]);
    setRefreshing(false);
  };

  const initials =
    `${user?.firstname?.charAt(0) || ""}${user?.lastname?.charAt(0) || ""}`.toUpperCase() ||
    (user?.name ? String(user.name).charAt(0).toUpperCase() : "?");
  const displayName = user?.firstname || user?.name || "Welcome";
  const periodLabel = `${MONTHS[period.month]} ${period.year}`;

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[contentStyle, { padding: gutter, paddingBottom: 32 }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.brand}
            colors={[colors.brand]}
          />
        }
      >
        {/* Greeting + avatar */}
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 20 }}>
          <View style={{ flex: 1, marginRight: 12 }}>
            <AppText variant="caption" color="textMuted">
              {greeting()}
            </AppText>
            <AppText variant="title" numberOfLines={1}>
              {displayName}
            </AppText>
            <View style={{ flexDirection: "row", alignItems: "center", marginTop: 2 }}>
              <Ionicons name="location" size={16} color={colors.brandText} />
              <AppText
                variant="label"
                color="brandText"
                numberOfLines={1}
                style={{ marginLeft: 4, flexShrink: 1 }}
              >
                {user?.hotspot?.name || "Your hotspot"}
              </AppText>
            </View>
          </View>
          <Pressable
            onPress={() => router.push("/profile")}
            accessibilityRole="button"
            accessibilityLabel="Open your profile"
            style={{
              width: 48,
              height: 48,
              borderRadius: 24,
              backgroundColor: colors.brand,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <AppText variant="bodyStrong" style={{ color: colors.onBrand }}>
              {initials}
            </AppText>
          </Pressable>
        </View>

        {/* Stock on hand + quick actions: everything urgent is visible without scrolling */}
        <Reveal>
          <TopBar />
        </Reveal>
        <Reveal index={1} style={{ marginTop: 12 }}>
          <StockActions
            onAdd={() => router.push({ pathname: "/stock", params: { add: "1" } })}
            onNotify={notify}
          />
        </Reveal>

        {/* Overview */}
        <View style={{ marginTop: 28 }}>
          <AppText variant="heading" style={{ marginBottom: 12 }}>
            Overview
          </AppText>
          <MonthYearPicker value={period} onChange={setPeriod} />
        </View>

        {error && !data ? (
          <Card
            style={{
              marginTop: 16,
              backgroundColor: colors.dangerSoft,
              borderWidth: 1,
              borderColor: colors.danger,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Ionicons name="cloud-offline-outline" size={22} color={colors.danger} />
              <AppText variant="bodyStrong" color="danger" style={{ marginLeft: 10, flex: 1 }}>
                Couldn&apos;t load deliveries
              </AppText>
            </View>
            <AppText variant="caption" color="danger" style={{ marginTop: 4 }}>
              {friendlyError(error)}
            </AppText>
            <Button
              title="Try again"
              icon="refresh"
              variant="danger"
              onPress={() => refetch()}
              style={{ marginTop: 12 }}
            />
          </Card>
        ) : null}

        <Reveal index={2}>
          <View style={{ flexDirection: "row", gap: 12, marginTop: 16 }}>
            <StatTile
              soft
              label="Received"
              unit="pieces"
              value={totalQuantity}
              icon="download-outline"
              tone="brand"
            />
            <StatTile
              soft
              label="Deliveries"
              value={monthDeliveries.length}
              icon="car-outline"
              tone="success"
            />
          </View>
        </Reveal>

        <Reveal index={3}>
          <Card style={{ marginTop: 16 }}>
            <AppText variant="heading">Deliveries by week</AppText>
            <AppText variant="caption" color="textMuted" style={{ marginBottom: 16 }}>
              {periodLabel}
            </AppText>
            {isLoading ? (
              <Skeleton height={150} style={{ borderRadius: radius.lg }} />
            ) : monthDeliveries.length === 0 ? (
              <EmptyState
                icon="bar-chart-outline"
                title="No deliveries yet"
                message={`Nothing was delivered in ${periodLabel}. Try another month.`}
              />
            ) : (
              <WeeklyBars data={weekly} />
            )}
          </Card>
        </Reveal>

        {monthDeliveries.length > 0 ? (
          <Reveal index={4}>
            <Card style={{ marginTop: 16 }}>
              <AppText variant="heading">Stock by brand</AppText>
              <AppText variant="caption" color="textMuted" style={{ marginBottom: 16 }}>
                {periodLabel}
              </AppText>
              <PieChartComponent data={monthDeliveries} />
            </Card>
          </Reveal>
        ) : null}
      </ScrollView>
      {dialog}
    </SafeAreaView>
  );
};

export default Home;
