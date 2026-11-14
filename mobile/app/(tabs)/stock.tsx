import React, { useEffect, useMemo, useRef, useState } from "react";
import { FlatList, RefreshControl, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import TopBar from "@/components/TopBar";
import StockActions from "@/components/StockActions";
import DeliveryCard from "@/components/DeliveryCard";
import {
	AppText,
	Button,
	Chip,
	DateField,
	EmptyState,
	Fab,
	FormModal,
	FormSection,
	Input,
	QuantityField,
	SelectSheet,
	Skeleton,
	useToast,
} from "@/components/ui";
import { addStock, getCondoms, getHotSpotStock } from "../api/requests";
import { useGlobalContext } from "@/context/auth/GlobalProvider";
import { useTheme } from "@/context/theme/ThemeProvider";
import { useResponsive } from "@/hooks/useResponsive";
import { useConfirm } from "@/hooks/useConfirm";
import { useStockAlert } from "@/hooks/useStockAlert";
import { formatDate } from "@/utils/dateFormatter";
import { parseDate } from "@/utils/parseDate";
import { friendlyError } from "@/utils/errors";

interface IForm {
	date_of_delivery: string;
	condom_id: number | null;
	person_delivering: string;
	stock_found: number | null;
	quantity_brought: number | null;
	hotspot_id: number;
	evidence_name: string;
	evidence_files: any;
	contact_of_person_delivering: string;
}

type Range = "all" | "today" | "7d" | "month" | "custom";

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

const emptyForm = (hotspotId: number): IForm => ({
	date_of_delivery: formatDate(new Date()), // default to today: one less thing to fill in
	condom_id: null,
	person_delivering: "",
	stock_found: 0,
	quantity_brought: 0,
	hotspot_id: hotspotId,
	evidence_name: "",
	evidence_files: [],
	contact_of_person_delivering: "",
});

const Stock: React.FC = () => {
	const queryClient = useQueryClient();
	const { user } = useGlobalContext();
	const { colors } = useTheme();
	const { contentStyle, gutter, isCompact } = useResponsive();
	const toast = useToast();
	const { confirm, dialog } = useConfirm();
	const { notify, dialog: alertDialog } = useStockAlert();
	const contactRef = useRef<React.ComponentRef<typeof TextInput>>(null);
	const hotspotId = user?.hotspot_id;
	const { add } = useLocalSearchParams<{ add?: string }>();

	/* ---------------- deliveries list + date filter ---------------- */
	const [range, setRange] = useState<Range>("all");
	const [from, setFrom] = useState<Date>(new Date());
	const [to, setTo] = useState<Date>(new Date());
	const [refreshing, setRefreshing] = useState(false);

	const deliveriesQuery = useQuery({
		queryKey: ["addStock", hotspotId],
		queryFn: () => getHotSpotStock(hotspotId),
		enabled: !!hotspotId,
	});

	const deliveries = useMemo(() => {
		const all: any[] = Array.isArray(deliveriesQuery.data) ? deliveriesQuery.data : [];
		const now = new Date();
		const today = startOfDay(now);
		const inRange = (e: any) => {
			if (range === "all") return true;
			const t = startOfDay(parseDate(e.date_of_delivery));
			if (range === "today") return t === today;
			if (range === "7d") return t >= today - 6 * 86400000 && t <= today;
			if (range === "month") {
				const d = parseDate(e.date_of_delivery);
				return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
			}
			const lo = Math.min(startOfDay(from), startOfDay(to));
			const hi = Math.max(startOfDay(from), startOfDay(to));
			return t >= lo && t <= hi;
		};
		return all
			.filter(inRange)
			.sort(
				(a, b) =>
					parseDate(b.date_of_delivery).getTime() - parseDate(a.date_of_delivery).getTime() ||
					Number(b.id) - Number(a.id)
			);
	}, [deliveriesQuery.data, range, from, to]);

	const totalPieces = deliveries.reduce((sum, e) => sum + (parseInt(e.quantity_brought, 10) || 0), 0);

	const onRefresh = async () => {
		setRefreshing(true);
		await Promise.all([deliveriesQuery.refetch(), queryClient.invalidateQueries({ queryKey: ["currentStock"] })]);
		setRefreshing(false);
	};

	/* ---------------- add-stock form ---------------- */
	const [formOpen, setFormOpen] = useState(false);
	const [formError, setFormError] = useState<string | null>(null);
	const [form, setForm] = useState<IForm>(emptyForm(hotspotId || 0));
	const [date, setDate] = useState(new Date());
	const [errors, setErrors] = useState<Record<string, string>>({});
	const [touched, setTouched] = useState<Record<string, boolean>>({});

	// Arriving from Home's "Add stock" quick action opens the form straight away.
	useEffect(() => {
		if (add === "1") {
			setFormOpen(true);
			router.setParams({ add: "" });
		}
	}, [add]);

	useEffect(() => {
		if (hotspotId) setForm((prev) => ({ ...prev, hotspot_id: hotspotId }));
	}, [hotspotId]);

	const condomsQuery = useQuery({ queryKey: ["condom"], queryFn: getCondoms });
	const condomOptions = (Array.isArray(condomsQuery.data) ? condomsQuery.data : []).map((c: any) => ({
		key: c?.id,
		value: c?.id,
		label: `${c?.brand} ${c?.category} ${c?.type}`,
	}));

	const isDirty =
		!!form.person_delivering ||
		!!form.contact_of_person_delivering ||
		!!form.condom_id ||
		!!form.quantity_brought ||
		!!form.stock_found;

	const validateField = (name: string, value: any) => {
		switch (name) {
			case "person_delivering":
				if (!value || String(value).trim() === "") return "Enter the name of the person delivering";
				if (String(value).trim().length < 2) return "Name must be at least 2 characters";
				return "";
			case "condom_id":
				return value ? "" : "Choose a condom brand";
			case "contact_of_person_delivering":
				if (!value || String(value).trim() === "") return "Enter a contact number";
				if (!/^[0-9+\-\s()]+$/.test(String(value).trim())) return "Enter a valid phone number";
				return "";
			case "quantity_brought":
				if (!value || Number(value) <= 0) return "Enter how many pieces were delivered";
				return "";
			case "stock_found":
				if (value === null || value === "" || isNaN(Number(value)) || Number(value) < 0)
					return "Enter 0 or more";
				return "";
			case "date_of_delivery":
				return value && String(value).trim() ? "" : "Choose the delivery date";
		}
		return "";
	};

	const handleFieldChange = (name: string, value: any) => {
		setForm((prev) => ({ ...prev, [name]: value }));
		if (errors[name]) setErrors((prev) => ({ ...prev, [name]: "" }));
		if (formError) setFormError(null);
	};

	const handleFieldBlur = (name: string) => {
		setTouched((prev) => ({ ...prev, [name]: true }));
		setErrors((prev) => ({ ...prev, [name]: validateField(name, form[name as keyof IForm]) }));
	};

	const setDeliveryDate = (d: Date) => {
		setDate(d);
		handleFieldChange("date_of_delivery", formatDate(d));
	};

	const resetForm = () => {
		setForm(emptyForm(hotspotId || 0));
		setErrors({});
		setTouched({});
		setFormError(null);
		setDate(new Date());
	};

	const closeForm = async () => {
		if (!isDirty) {
			setFormOpen(false);
			return;
		}
		const ok = await confirm({
			title: "Discard this delivery?",
			message: "What you've entered won't be saved.",
			confirmLabel: "Discard",
			cancelLabel: "Keep editing",
			tone: "danger",
			icon: "trash",
		});
		if (ok) {
			resetForm();
			setFormOpen(false);
		}
	};

	const { mutate, isPending } = useMutation<any, Error, FormData>({
		mutationFn: addStock,
		onSuccess: async (data) => {
			if (data.code === 201) {
				// Refresh everything that shows stock (list, current-stock card, Home).
				queryClient.invalidateQueries({ queryKey: ["addStock"] });
				queryClient.invalidateQueries({ queryKey: ["currentStock"] });
				resetForm();
				setFormOpen(false);
				setRange("all");
				toast.success(data.message || "Delivery recorded.");
			} else {
				setFormError(data?.message || "The delivery couldn't be saved. Please try again.");
			}
		},
		onError: (error) => {
			setFormError(friendlyError(error, "Couldn't save the delivery. Please try again."));
		},
	});

	const pickDocument = async () => {
		const result = await DocumentPicker.getDocumentAsync({});
		if (!result.canceled) {
			setForm((prev) => ({ ...prev, evidence_files: [...prev.evidence_files, ...result.assets] }));
		}
	};
	void pickDocument; // evidence upload UI is not exposed yet

	const submit = () => {
		const fields = [
			"person_delivering",
			"condom_id",
			"contact_of_person_delivering",
			"quantity_brought",
			"stock_found",
			"date_of_delivery",
		];
		setTouched(Object.fromEntries(fields.map((f) => [f, true])));
		const next: Record<string, string> = {};
		fields.forEach((f) => {
			const e = validateField(f, form[f as keyof IForm]);
			if (e) next[f] = e;
		});
		setErrors(next);
		if (Object.keys(next).length > 0) {
			setFormError("Please fix the highlighted fields.");
			return;
		}
		setFormError(null);

		try {
			const fd = new FormData();
			fd.append("date_of_delivery", form.date_of_delivery);
			fd.append("condom_id", String(form.condom_id));
			fd.append("person_delivering", form.person_delivering);
			fd.append("stock_found", String(form.stock_found ?? 0));
			fd.append("quantity_brought", String(form.quantity_brought ?? 0));
			fd.append("hotspot_id", String(form.hotspot_id));
			fd.append("evidence_name", form.evidence_name || "");
			fd.append("contact_of_person_delivering", form.contact_of_person_delivering);
			(form.evidence_files || []).forEach((file: any) => {
				fd.append("evidence_files[]", { uri: file.uri, name: file.name, type: file.mimeType } as any);
			});
			mutate(fd);
		} catch {
			setFormError("Couldn't prepare the form. Please try again.");
		}
	};

	const err = (name: string) => (touched[name] && errors[name] ? errors[name] : undefined);
	const brandLabel = condomOptions.find((o: any) => o.value === form.condom_id)?.label;
	const onHand = (form.quantity_brought ?? 0) + (form.stock_found ?? 0);

	/* ---------------- render ---------------- */
	const rangeLabel = { all: "All time", today: "Today", "7d": "Last 7 days", month: "This month", custom: "Custom range" };

	const header = (
		<View>
			<View style={{ marginBottom: 16 }}>
				<AppText variant="title">Stock</AppText>
				<AppText variant="body" color="textMuted">
					{user?.hotspot?.name ? `${user.hotspot.name} · ` : ""}what's on hand and what's been delivered
				</AppText>
			</View>

			<TopBar />
			<View style={{ marginTop: 12 }}>
				<StockActions onNotify={notify} />
			</View>

			<View style={{ marginTop: 24, marginBottom: 12 }}>
				<AppText variant="heading">Recent deliveries</AppText>
			</View>

			<FlatList
				horizontal
				data={Object.keys(rangeLabel) as Range[]}
				keyExtractor={(k) => k}
				showsHorizontalScrollIndicator={false}
				renderItem={({ item }) => (
					<Chip label={rangeLabel[item]} active={range === item} onPress={() => setRange(item)} />
				)}
			/>

			{range === "custom" ? (
				<View style={{ flexDirection: isCompact ? "column" : "row", gap: 12, marginTop: 12 }}>
					<View style={{ flex: 1 }}>
						<DateField label="From" display={formatDate(from)} date={from} maximumDate={new Date()} onChange={setFrom} />
					</View>
					<View style={{ flex: 1 }}>
						<DateField label="To" display={formatDate(to)} date={to} maximumDate={new Date()} onChange={setTo} />
					</View>
				</View>
			) : null}

			<AppText variant="caption" color="textMuted" style={{ marginTop: 12, marginBottom: 12 }}>
				{deliveries.length} deliver{deliveries.length === 1 ? "y" : "ies"} · {totalPieces} pieces · {rangeLabel[range].toLowerCase()}
			</AppText>
		</View>
	);

	return (
		<SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: colors.bg }}>
			<FlatList
				data={deliveries}
				keyExtractor={(item) => String(item.id)}
				ListHeaderComponent={header}
				contentContainerStyle={[contentStyle, { padding: gutter, paddingBottom: 112 }]}
				showsVerticalScrollIndicator={false}
				ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
				renderItem={({ item }) => <DeliveryCard item={item} />}
				ListEmptyComponent={
					deliveriesQuery.isLoading ? (
						<View style={{ gap: 10 }}>
							<Skeleton height={72} />
							<Skeleton height={72} />
							<Skeleton height={72} />
						</View>
					) : deliveriesQuery.isError ? (
						<EmptyState
							icon="cloud-offline-outline"
							title="Couldn't load deliveries"
							message={friendlyError(deliveriesQuery.error)}
							actionLabel="Try again"
							onAction={() => deliveriesQuery.refetch()}
						/>
					) : range !== "all" ? (
						<EmptyState
							icon="calendar-outline"
							title="No deliveries in this period"
							message="Try a different date range."
							actionLabel="Show all time"
							onAction={() => setRange("all")}
						/>
					) : (
						<EmptyState
							icon="cube-outline"
							title="No deliveries yet"
							message="Record your first delivery to start tracking stock."
							actionLabel="Add stock"
							onAction={() => setFormOpen(true)}
						/>
					)
				}
				refreshControl={
					<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} colors={[colors.brand]} />
				}
			/>

			<Fab label="Add stock" icon="add" onPress={() => setFormOpen(true)} />
			{alertDialog}

			<FormModal
				visible={formOpen}
				title="Add stock"
				subtitle={user?.hotspot?.name ? `Delivery to ${user.hotspot.name}` : "Record a delivery"}
				onClose={closeForm}
				error={formError}
				footer={
					<View style={{ flexDirection: "row", gap: 12 }}>
						<Button title="Clear" variant="ghost" onPress={resetForm} style={{ flex: 1 }} />
						<Button
							title={isPending ? "Saving…" : "Save stock"}
							icon="checkmark"
							onPress={submit}
							loading={isPending}
							style={{ flex: 2 }}
						/>
					</View>
				}
			>
				<FormSection icon="person-outline" title="Who delivered?">
					<Input
						label="Person delivering"
						icon="person-outline"
						value={form.person_delivering}
						onChangeText={(e) => handleFieldChange("person_delivering", e)}
						onBlur={() => handleFieldBlur("person_delivering")}
						placeholder="Full name"
						returnKeyType="next"
						onSubmitEditing={() => contactRef.current?.focus()}
						error={err("person_delivering")}
					/>
					<Input
						ref={contactRef}
						label="Contact number"
						icon="call-outline"
						value={form.contact_of_person_delivering}
						onChangeText={(e) => handleFieldChange("contact_of_person_delivering", e)}
						onBlur={() => handleFieldBlur("contact_of_person_delivering")}
						placeholder="e.g. 0700 000 000"
						keyboardType="phone-pad"
						error={err("contact_of_person_delivering")}
						containerStyle={{ marginTop: 16 }}
					/>
				</FormSection>

				<FormSection icon="cube-outline" title="What was delivered?">
					<SelectSheet
						label="Condom brand"
						icon="pricetag-outline"
						placeholder="Choose a brand"
						value={form.condom_id}
						options={condomOptions}
						onChange={(value: number) => {
							handleFieldChange("condom_id", value);
							setTouched((p) => ({ ...p, condom_id: true }));
						}}
						error={err("condom_id")}
					/>
					<View style={{ flexDirection: isCompact ? "column" : "row", gap: 16, marginTop: 16 }}>
						<View style={{ flex: 1 }}>
							<QuantityField
								label="Delivered"
								value={form.quantity_brought}
								onChange={(n) => handleFieldChange("quantity_brought", n)}
								onBlur={() => handleFieldBlur("quantity_brought")}
								error={err("quantity_brought")}
								hint="Pieces received today"
								quickAdds={[10, 50, 100]}
							/>
						</View>
						<View style={{ flex: 1 }}>
							<QuantityField
								label="Already in stock"
								value={form.stock_found}
								onChange={(n) => handleFieldChange("stock_found", n)}
								onBlur={() => handleFieldBlur("stock_found")}
								error={err("stock_found")}
								hint="Pieces found on arrival"
							/>
						</View>
					</View>
				</FormSection>

				<FormSection icon="calendar-outline" title="When?">
					<DateField
						label="Delivery date"
						display={form.date_of_delivery}
						date={date}
						maximumDate={new Date()}
						onChange={setDeliveryDate}
						error={err("date_of_delivery")}
					/>
					<View style={{ flexDirection: "row", marginTop: 12 }}>
						<Chip label="Today" active={false} onPress={() => setDeliveryDate(new Date())} />
						<Chip
							label="Yesterday"
							active={false}
							onPress={() => setDeliveryDate(new Date(Date.now() - 86400000))}
						/>
					</View>
				</FormSection>

				{onHand > 0 && brandLabel ? (
					<View
						accessibilityLiveRegion="polite"
						style={{
							flexDirection: "row",
							alignItems: "center",
							backgroundColor: colors.brandSoft,
							borderRadius: 16,
							padding: 14,
						}}
					>
						<Ionicons name="information-circle" size={22} color={colors.brandText} />
						<AppText variant="caption" color="brandText" style={{ flex: 1, marginLeft: 10 }}>
							{form.quantity_brought ?? 0} delivered + {form.stock_found ?? 0} already there ={" "}
							<AppText variant="caption" color="brandText" style={{ fontFamily: "Poppins-SemiBold" }}>
								{onHand} pieces of {brandLabel}
							</AppText>{" "}
							on hand.
						</AppText>
					</View>
				) : null}
				{dialog}
			</FormModal>
		</SafeAreaView>
	);
};

export default Stock;
