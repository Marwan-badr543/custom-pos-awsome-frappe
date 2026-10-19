<template>
	<div v-if="isInvoice" class="posa-form-section">
		<div class="posa-section-header">
			<v-icon size="small" class="section-icon">mdi-barcode-scan</v-icon>
			<span class="posa-section-title">{{ __("Serial Numbers (optional)") }}</span>
		</div>
		<div class="text-caption text-medium-emphasis mb-2">
			{{ __("Scan or choose the serials to sell. Leave empty and the oldest free serial is used.") }}
		</div>
		<div v-if="loading" class="text-caption">{{ __("Loading serials...") }}</div>
		<div v-for="code in codes" :key="code" class="posa-form-row">
			<div class="posa-form-field full-width">
				<v-combobox
					:model-value="selected(code)"
					:items="options[code] || []"
					:label="isBundle ? code : __('Serial No')"
					variant="outlined"
					density="compact"
					color="primary"
					class="pos-themed-input"
					prepend-inner-icon="mdi-barcode"
					multiple
					chips
					closable-chips
					hide-details
					:delimiters="[',', ' ']"
					v-model:search="typed[code]"
					@update:model-value="(value) => choose(code, value)"
					@blur="commitTyped(code)"
				></v-combobox>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
// delivery_management: on an Invoice the cashier may choose the serials of a line (or of a
// bundle's components); the server checks them and picks the rest. An Order reserves only
// the quantity: its serials are scanned on the Delivery Note. Kept apart from POS Awesome's
// own serial list, which ties the qty to the serials.
import { computed, ref, watch } from "vue";
import { dmCall, dmOrderType } from "../../../utils/deliveryManagement";

const props = defineProps<{ item: any; posProfile: any; invoiceType?: string; invoiceDoc?: any }>();

const __ = (window as any).__ || ((s: string) => s);
const options = ref<Record<string, string[]>>({});
const loading = ref(false);
const typed = ref<Record<string, string>>({});
const isInvoice = computed(
	() => dmOrderType(props.invoiceType || "", props.posProfile, props.invoiceDoc) === "Invoice",
);
const codes = computed(() => Object.keys(options.value));
// For a bundle the server returns its serialised components, not the bundle itself.
const isBundle = computed(() => codes.value.length > 0 && !codes.value.includes(props.item.item_code));

const selected = (code: string): string[] =>
	isBundle.value
		? props.item.dm_component_serials?.[code] || []
		: props.item.serial_no_selected || [];

const clean = (value: any): string[] => [
	...new Set((value || []).map((v: any) => String(v?.value ?? v).trim()).filter(Boolean)),
] as string[];

const choose = (code: string, value: any) => {
	if (isBundle.value) {
		props.item.dm_component_serials = { ...(props.item.dm_component_serials || {}), [code]: clean(value) };
	} else {
		props.item.serial_no_selected = clean(value);
	}
};

// A serial typed (or scanned) without pressing Enter is kept when the box loses focus.
const commitTyped = (code: string) => {
	const text = (typed.value[code] || "").trim();
	if (!text) return;
	choose(code, [...selected(code), text]);
	typed.value[code] = "";
};

watch(
	isInvoice,
	async (invoice) => {
		if (!invoice || codes.value.length) return;
		loading.value = true;
		try {
			options.value = await dmCall("get_free_serials", {
				item_code: props.item.item_code,
				pos_profile: props.posProfile?.name,
			});
		} finally {
			loading.value = false;
		}
	},
	{ immediate: true },
);
</script>
