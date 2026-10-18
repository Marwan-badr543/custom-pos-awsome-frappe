<template>
	<v-card flat class="invoice-section-card pos-themed-card dm-panel" data-testid="dm-delivery-panel">
		<!-- Header: what this is + whether it is ready -->
		<div class="dm-panel__head">
			<div class="dm-panel__title">
				<v-icon size="20" color="primary">mdi-truck-delivery-outline</v-icon>
				<h3 class="invoice-section-heading__title">{{ __("Home Delivery") }}</h3>
			</div>
			<v-chip
				v-if="!items.length"
				size="small"
				variant="tonal"
				color="grey"
				prepend-icon="mdi-cart-outline"
			>
				{{ __("Add items first") }}
			</v-chip>
			<v-chip
				v-else-if="loading"
				size="small"
				variant="tonal"
				color="primary"
			>
				<v-progress-circular indeterminate size="12" width="2" class="mr-2" />
				{{ __("Checking availability...") }}
			</v-chip>
			<v-chip
				v-else-if="missing.length"
				size="small"
				variant="tonal"
				color="warning"
				prepend-icon="mdi-alert-circle-outline"
			>
				{{ __("Still needed: {0}", [missing.join(", ")]) }}
			</v-chip>
			<v-chip v-else size="small" variant="flat" color="success" prepend-icon="mdi-check-circle">
				{{ __("Ready to place the order") }}
			</v-chip>
		</div>

		<!-- Step 1: address -->
		<section class="dm-step">
			<div class="dm-step__label">
				<span class="dm-step__num" :class="{ 'dm-step__num--done': addressComplete }">
					<v-icon v-if="addressComplete" size="14">mdi-check</v-icon>
					<template v-else>1</template>
				</span>
				<span>{{ __("Delivery address") }}</span>
				<span v-if="prefilled" class="dm-step__hint">
					<v-icon size="14">mdi-history</v-icon>
					{{ __("filled from the customer's last order") }}
				</span>
			</div>
			<div class="dm-address">
				<v-autocomplete
					v-model="address.area"
					:items="areas"
					:label="__('Area') + ' *'"
					density="compact"
					variant="outlined"
					hide-details="auto"
					prepend-inner-icon="mdi-map-marker-outline"
					class="dm-address__area pos-themed-input"
					:no-data-text="__('No delivery area found')"
					auto-select-first
				/>
				<v-text-field
					v-for="field in numberFields"
					:key="field.name"
					:model-value="address[field.name]"
					:label="field.label + ' *'"
					density="compact"
					variant="outlined"
					hide-details
					inputmode="numeric"
					autocomplete="off"
					class="dm-address__num pos-themed-input"
					@update:model-value="setNumber(field.name, $event)"
					@keypress="onlyDigits"
				/>
				<v-text-field
					v-model="address.address_title"
					:label="__('Address name')"
					:placeholder="__('e.g. Home, Office')"
					density="compact"
					variant="outlined"
					hide-details
					autocomplete="off"
					class="dm-address__title pos-themed-input"
				/>
			</div>
		</section>

		<!-- Step 2: delivery time slot (goods) -->
		<section v-if="profile.has_non_ac" class="dm-step">
			<div class="dm-step__label">
				<span class="dm-step__num" :class="{ 'dm-step__num--done': !!deliveryTime }">
					<v-icon v-if="deliveryTime" size="14">mdi-check</v-icon>
					<template v-else>2</template>
				</span>
				<span>{{ __("Delivery day and time") }}</span>
				<span v-if="deliveryTime" class="dm-step__chosen">
					{{ longDate(deliveryDate) }} · {{ timeLabel(deliveryTime) }}
				</span>
			</div>
			<div class="dm-days" role="listbox" :aria-label="__('Delivery day')">
				<button
					v-for="day in days"
					:key="day.date"
					type="button"
					class="dm-day"
					:class="{ 'dm-day--active': day.date === deliveryDate }"
					:aria-selected="day.date === deliveryDate"
					@click="deliveryDate = day.date"
				>
					<span class="dm-day__weekday">{{ day.weekday }}</span>
					<span class="dm-day__date">{{ day.label }}</span>
				</button>
			</div>
			<div v-if="!address.area" class="dm-empty">
				<v-icon size="18">mdi-map-marker-question-outline</v-icon>
				{{ __("Choose the area to see the free delivery times.") }}
			</div>
			<div v-else-if="slotsLoading" class="dm-empty">
				<v-progress-circular indeterminate size="16" width="2" />
				{{ __("Loading delivery times...") }}
			</div>
			<div v-else-if="!slots.length" class="dm-empty">
				<v-icon size="18">mdi-calendar-remove-outline</v-icon>
				{{ __("No delivery to {0} on this day. Pick another day.", [address.area]) }}
			</div>
			<div v-else class="dm-slots" role="listbox" :aria-label="__('Delivery time')">
				<button
					v-for="slot in slots"
					:key="slot.delivery_time"
					type="button"
					class="dm-slot"
					:class="{
						'dm-slot--active': slot.delivery_time === deliveryTime,
						'dm-slot--off': !slot.available,
						'dm-slot--low': slot.available && slot.remaining === 1,
					}"
					:disabled="!slot.available"
					:aria-selected="slot.delivery_time === deliveryTime"
					@click="deliveryTime = slot.delivery_time"
				>
					<span class="dm-slot__time">{{ timeLabel(slot.delivery_time) }}</span>
					<span class="dm-slot__note">{{ slotNote(slot) }}</span>
				</button>
			</div>
		</section>

		<!-- Step 3: AC installation day -->
		<section v-if="profile.has_ac" class="dm-step">
			<div class="dm-step__label">
				<span class="dm-step__num" :class="{ 'dm-step__num--done': !!acDate }">
					<v-icon v-if="acDate" size="14">mdi-check</v-icon>
					<template v-else>{{ profile.has_non_ac ? 3 : 2 }}</template>
				</span>
				<span>{{ __("AC installation day") }}</span>
				<v-chip size="x-small" variant="tonal" color="primary" class="ml-1">
					{{ __("{0} AC unit(s)", [profile.ac_units]) }}
				</v-chip>
				<span v-if="acDate" class="dm-step__chosen">{{ longDate(acDate) }}</span>
			</div>
			<div v-if="!acDays.length && !loading" class="dm-empty">
				<v-icon size="18">mdi-calendar-remove-outline</v-icon>
				{{ __("No installation days available.") }}
			</div>
			<div class="dm-days dm-days--ac" role="listbox" :aria-label="__('AC installation day')">
				<button
					v-for="day in acDays"
					:key="day.date"
					type="button"
					class="dm-day dm-day--tall"
					:class="{
						'dm-day--active': day.date === acDate,
						'dm-day--off': !day.available,
					}"
					:disabled="!day.available"
					:aria-selected="day.date === acDate"
					@click="acDate = day.date"
				>
					<span class="dm-day__weekday">{{ weekday(day.date) }}</span>
					<span class="dm-day__date">{{ shortDate(day.date) }}</span>
					<span class="dm-day__note">{{ acNote(day) }}</span>
				</button>
			</div>
		</section>

		<div v-if="items.length && !profile.has_ac && !profile.has_non_ac && !loading" class="dm-empty">
			<v-icon size="18">mdi-information-outline</v-icon>
			{{ __("These items need no delivery slot. Only the address is needed.") }}
		</div>
	</v-card>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import _ from "lodash";
import { dmCall, digitsOnly } from "../../../utils/deliveryManagement";
import { useDeliveryStore } from "../../../stores/deliveryStore";

declare const __: (_text: string, _args?: any[]) => string;
declare const frappe: any;

const props = defineProps({
	customer: { type: String, default: "" },
	items: { type: Array as () => any[], default: () => [] },
});

const deliveryStore = useDeliveryStore();

const REASONS: Record<string, string> = {
	area_disabled: __("Area closed"),
	not_a_working_hour: __("Closed"),
	too_soon: __("Too soon"),
	past_date: __("Past"),
	manually_disabled: __("Closed"),
	full: __("Full"),
	not_enough_capacity: __("Not enough room"),
};

const numberFields = [
	{ name: "block_no", label: __("Block No") },
	{ name: "road_no", label: __("Road No") },
	{ name: "building_no", label: __("Building No") },
] as const;

const areas = ref<string[]>([]);
const windowDays = ref(14);
const address = reactive({ area: null as string | null, address_title: "", block_no: "", road_no: "", building_no: "" });
const prefilled = ref(false);
let loadedCustomer: string | null = null;

const profile = ref({ has_ac: false, has_non_ac: false, ac_units: 0 });
const loading = ref(false);
const slots = ref<any[]>([]);
const slotsLoading = ref(false);
const acDays = ref<any[]>([]);
const deliveryDate = ref<string>(frappe.datetime.now_date());
const deliveryTime = ref<string | null>(null);
const acDate = ref<string | null>(null);

// ---------------------------------------------------------------- address

const addressComplete = computed(
	() => !!(address.area && address.block_no && address.road_no && address.building_no),
);

function setNumber(field: string, value: string) {
	(address as any)[field] = digitsOnly(value);
}

function onlyDigits(event: KeyboardEvent) {
	if (event.key && event.key.length === 1 && !digitsOnly(event.key)) event.preventDefault();
}

async function loadCustomerAddress(customer: string) {
	if (!customer || customer === loadedCustomer) return;
	loadedCustomer = customer;
	try {
		const found: any = (await dmCall("get_customer_delivery_address", { customer })) || {};
		if (customer !== props.customer) return; // another customer was chosen meanwhile
		address.area = found.area || null;
		address.address_title = found.address_title || "";
		address.block_no = digitsOnly(found.block_no);
		address.road_no = digitsOnly(found.road_no);
		address.building_no = digitsOnly(found.building_no);
		prefilled.value = !!(found.area || found.block_no);
	} catch (error) {
		console.warn("delivery_management: customer address not loaded", error);
	}
}

// ---------------------------------------------------------------- schedule

const itemsKey = computed(() =>
	props.items
		.map((i: any) => `${i.item_code}:${i.qty}:${i.conversion_factor || 1}`)
		.join("|"),
);

const days = computed(() => {
	const today = frappe.datetime.now_date();
	return Array.from({ length: windowDays.value }, (_v, i) => {
		const date = frappe.datetime.add_days(today, i);
		return { date, weekday: weekday(date), label: shortDate(date) };
	});
});

const missing = computed(() => {
	if (!props.items.length) return [];
	const list: string[] = [];
	if (!addressComplete.value) list.push(__("address"));
	if (profile.value.has_non_ac && !(deliveryDate.value && deliveryTime.value))
		list.push(__("delivery time"));
	if (profile.value.has_ac && !acDate.value) list.push(__("AC installation day"));
	return list;
});

const payload = computed(() => ({
	address_title: (address.address_title || "").trim(),
	area: address.area,
	block_no: address.block_no,
	road_no: address.road_no,
	building_no: address.building_no,
	delivery_date: profile.value.has_non_ac ? deliveryDate.value : null,
	delivery_time: profile.value.has_non_ac ? deliveryTime.value : null,
	ac_date: profile.value.has_ac ? acDate.value : null,
	missing: missing.value,
	valid: !loading.value && props.items.length > 0 && missing.value.length === 0,
}));

watch(payload, (value) => deliveryStore.setDelivery(value), { immediate: true, deep: true });

async function loadProfile() {
	const items = props.items
		.filter((i: any) => i?.item_code)
		.map((i: any) => ({
			item_code: i.item_code,
			qty: i.qty,
			conversion_factor: i.conversion_factor || 1,
		}));
	if (!items.length) {
		profile.value = { has_ac: false, has_non_ac: false, ac_units: 0 };
		return;
	}
	loading.value = true;
	try {
		profile.value = (await dmCall("get_cart_profile", { items })) || profile.value;
		await Promise.all([loadSlots(), loadAcDays()]);
	} catch (error) {
		console.warn("delivery_management: cart profile not loaded", error);
	} finally {
		loading.value = false;
	}
}
const loadProfileSoon = _.debounce(loadProfile, 300);

async function loadSlots() {
	if (!profile.value.has_non_ac || !address.area || !deliveryDate.value) {
		slots.value = [];
		return;
	}
	const area = address.area;
	const date = deliveryDate.value;
	slotsLoading.value = true;
	try {
		const result = (await dmCall("get_delivery_slots", { area, date })) || [];
		if (area !== address.area || date !== deliveryDate.value) return; // changed meanwhile
		slots.value = result;
		const chosen = result.find((s: any) => s.delivery_time === deliveryTime.value);
		if (!chosen || !chosen.available) deliveryTime.value = null;
	} finally {
		slotsLoading.value = false;
	}
}

async function loadAcDays() {
	if (!profile.value.has_ac) {
		acDays.value = [];
		return;
	}
	acDays.value =
		(await dmCall("get_ac_calendar", { units: profile.value.ac_units, days: windowDays.value })) || [];
	const chosen = acDays.value.find((d: any) => d.date === acDate.value);
	if (!chosen || !chosen.available) acDate.value = null;
}

watch(itemsKey, () => loadProfileSoon());
watch(
	() => props.items.length,
	(length) => {
		// Cart emptied = a new sale: forget the previous schedule.
		if (!length) {
			deliveryTime.value = null;
			acDate.value = null;
			deliveryDate.value = frappe.datetime.now_date();
		}
	},
);
watch(
	() => address.area,
	() => {
		deliveryTime.value = null;
		void loadSlots();
	},
);
watch(deliveryDate, () => {
	deliveryTime.value = null;
	void loadSlots();
});
watch(
	() => props.customer,
	(customer) => {
		prefilled.value = false;
		if (customer !== loadedCustomer) {
			address.area = null;
			address.address_title = "";
			address.block_no = "";
			address.road_no = "";
			address.building_no = "";
		}
		void loadCustomerAddress(customer);
	},
	{ immediate: true },
);
// After a failed submit (e.g. someone just took the last car).
watch(
	() => deliveryStore.refreshToken,
	() => Promise.all([loadSlots(), loadAcDays()]),
);

// ---------------------------------------------------------------- labels

function toDate(value: string) {
	return frappe.datetime.str_to_obj(value) as Date;
}
function weekday(date: string) {
	const today = frappe.datetime.now_date();
	if (date === today) return __("Today");
	if (date === frappe.datetime.add_days(today, 1)) return __("Tomorrow");
	return toDate(date).toLocaleDateString(undefined, { weekday: "short" });
}
function shortDate(date: string) {
	return toDate(date).toLocaleDateString(undefined, { day: "2-digit", month: "short" });
}
function longDate(date: string | null) {
	if (!date) return "";
	return `${weekday(date)} ${shortDate(date)}`;
}
function timeLabel(time: string | null) {
	if (!time) return "";
	const [h = 0, m = 0] = String(time).split(":").map(Number);
	const suffix = h >= 12 ? __("PM") : __("AM");
	return `${((h + 11) % 12) + 1}:${String(m || 0).padStart(2, "0")} ${suffix}`;
}
function reasonText(reasons: string[] = []) {
	return REASONS[reasons[reasons.length - 1] || ""] || __("Unavailable");
}
function slotNote(slot: any) {
	if (!slot.available) return reasonText(slot.reasons);
	return slot.remaining === 1 ? __("Last car") : __("{0} cars free", [slot.remaining]);
}
function acNote(day: any) {
	if (!day.available) return reasonText(day.reasons);
	return __("{0} free", [day.remaining]);
}

onMounted(async () => {
	try {
		const setup: any = await dmCall("get_delivery_setup");
		areas.value = setup?.areas || [];
		windowDays.value = Math.min(setup?.booking_window_days || 14, 30);
	} catch (error) {
		console.warn("delivery_management: setup not loaded", error);
	}
	void loadProfile();
});
</script>

<style scoped>
.dm-panel {
	padding: 12px 14px 14px;
	border-left: 3px solid var(--pos-primary);
}
.dm-panel__head {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	flex-wrap: wrap;
	margin-bottom: 10px;
}
.dm-panel__title {
	display: flex;
	align-items: center;
	gap: 8px;
}
.dm-step {
	padding: 10px 0 4px;
	border-top: 1px dashed var(--pos-border-light, var(--pos-border));
}
.dm-step:first-of-type {
	border-top: 0;
	padding-top: 0;
}
.dm-step__label {
	display: flex;
	align-items: center;
	gap: 8px;
	flex-wrap: wrap;
	font-weight: 600;
	color: var(--pos-text-primary);
	margin-bottom: 8px;
}
.dm-step__num {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 22px;
	height: 22px;
	border-radius: 50%;
	font-size: 12px;
	background: var(--pos-surface-muted);
	color: var(--pos-text-secondary);
	border: 1px solid var(--pos-border);
}
.dm-step__num--done {
	background: var(--pos-success, #2e7d32);
	border-color: transparent;
	color: #fff;
}
.dm-step__hint {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	font-weight: 400;
	font-size: 12px;
	color: var(--pos-text-muted, var(--pos-text-secondary));
}
.dm-step__chosen {
	margin-left: auto;
	font-weight: 600;
	color: var(--pos-primary);
}
.dm-address {
	display: grid;
	grid-template-columns: minmax(160px, 2fr) repeat(3, minmax(90px, 1fr)) minmax(140px, 1.5fr);
	gap: 8px;
}
@media (max-width: 1100px) {
	.dm-address {
		grid-template-columns: repeat(3, minmax(0, 1fr));
	}
	.dm-address__area,
	.dm-address__title {
		grid-column: span 3;
	}
}
.dm-days {
	display: flex;
	gap: 6px;
	overflow-x: auto;
	padding-bottom: 6px;
	scrollbar-width: thin;
}
.dm-day {
	flex: 0 0 auto;
	min-width: 64px;
	padding: 6px 8px;
	border-radius: var(--pos-radius-sm, 8px);
	border: 1px solid var(--pos-border);
	background: var(--pos-surface-raised, var(--pos-card-bg));
	color: var(--pos-text-primary);
	display: flex;
	flex-direction: column;
	align-items: center;
	line-height: 1.2;
	cursor: pointer;
	transition: border-color 0.15s, background 0.15s;
}
.dm-day:hover:not(:disabled) {
	border-color: var(--pos-primary);
}
.dm-day__weekday {
	font-size: 11px;
	text-transform: uppercase;
	color: var(--pos-text-secondary);
}
.dm-day__date {
	font-weight: 700;
	font-size: 14px;
}
.dm-day__note {
	font-size: 11px;
	margin-top: 2px;
	color: var(--pos-success, #2e7d32);
}
.dm-day--active {
	background: var(--pos-primary);
	border-color: var(--pos-primary);
	color: #fff;
}
.dm-day--active .dm-day__weekday,
.dm-day--active .dm-day__note {
	color: rgba(255, 255, 255, 0.85);
}
.dm-day--off {
	opacity: 0.45;
	cursor: not-allowed;
}
.dm-day--off .dm-day__note {
	color: var(--pos-error, #c62828);
}
.dm-slots {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(112px, 1fr));
	gap: 8px;
	margin-top: 4px;
}
.dm-slot {
	padding: 8px 10px;
	min-height: 52px;
	border-radius: var(--pos-radius-sm, 8px);
	border: 1px solid var(--pos-border);
	background: var(--pos-surface-raised, var(--pos-card-bg));
	color: var(--pos-text-primary);
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	justify-content: center;
	cursor: pointer;
	text-align: left;
	transition: border-color 0.15s, background 0.15s, box-shadow 0.15s;
}
.dm-slot:hover:not(:disabled) {
	border-color: var(--pos-primary);
	box-shadow: var(--pos-shadow-light, none);
}
.dm-slot__time {
	font-weight: 700;
	font-size: 15px;
}
.dm-slot__note {
	font-size: 12px;
	color: var(--pos-success, #2e7d32);
}
.dm-slot--low .dm-slot__note {
	color: #e65100;
	font-weight: 600;
}
.dm-slot--active {
	background: var(--pos-primary);
	border-color: var(--pos-primary);
	color: #fff;
}
.dm-slot--active .dm-slot__note {
	color: rgba(255, 255, 255, 0.9);
}
.dm-slot--off {
	cursor: not-allowed;
	background: var(--pos-surface-muted);
	color: var(--pos-text-secondary);
}
.dm-slot--off .dm-slot__time {
	text-decoration: line-through;
	font-weight: 500;
}
.dm-slot--off .dm-slot__note {
	color: var(--pos-error, #c62828);
}
.dm-empty {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 10px 12px;
	border-radius: var(--pos-radius-sm, 8px);
	background: var(--pos-surface-muted);
	color: var(--pos-text-secondary);
	font-size: 13px;
}
</style>
