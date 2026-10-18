/**
 * delivery_management state shared by the cart, the item selector and payments:
 * the chosen delivery address + schedule, and the sellable stock per POS type.
 */
import { defineStore } from "pinia";
import { ref } from "vue";
import { dmCall, isDeliveryManagementEnabled } from "../utils/deliveryManagement";

export type DeliveryPayload = {
	address_title?: string;
	area?: string | null;
	block_no?: string;
	road_no?: string;
	building_no?: string;
	delivery_date?: string | null;
	delivery_time?: string | null;
	ac_date?: string | null;
	valid?: boolean;
	missing?: string[];
};

type AvailabilityMap = Record<string, number | null>;

/** POS rules of an item (delivery_management.api.pos.item_rules). */
export type ItemRule = { kind: "ac" | "other" | "mixed" | "neutral"; delivery_charge: boolean };
type AvailabilityResult = {
	invoice: AvailabilityMap;
	order: AvailabilityMap;
	rules?: Record<string, ItemRule>;
	delivery_charge_item?: string | null;
};

export const useDeliveryStore = defineStore("delivery", () => {
	const delivery = ref<DeliveryPayload>({});
	/** Sellable qty: ``invoice`` = branch warehouse, ``order`` = main store. null = no limit. */
	const availability = ref<{ invoice: AvailabilityMap; order: AvailabilityMap }>({
		invoice: {},
		order: {},
	});
	/** Bumped to ask the schedule panel to reload slots (e.g. after a failed submit). */
	const refreshToken = ref(0);
	/** Delivery kind (AC / other) and "has delivery charge" of each item seen. */
	const rules = ref<Record<string, ItemRule>>({});
	const deliveryChargeItem = ref<string | null>(null);
	const saving = ref(false);
	let pending = new Set<string>();
	let timer: ReturnType<typeof setTimeout> | null = null;
	let profileName = "";

	function setDelivery(value: DeliveryPayload | null | undefined) {
		delivery.value = value ? { ...value } : {};
	}

	function clearDelivery() {
		delivery.value = {};
	}

	function requestRefresh() {
		refreshToken.value += 1;
	}

	/** Queue item codes; one debounced call loads both types. */
	function loadAvailability(codes: string[], posProfile: string) {
		if (!isDeliveryManagementEnabled() || !posProfile) return;
		if (profileName && profileName !== posProfile) resetAvailability();
		profileName = posProfile;
		for (const code of codes || []) {
			if (code && !(code in availability.value.invoice)) pending.add(code);
		}
		if (!pending.size) return;
		if (timer) clearTimeout(timer);
		timer = setTimeout(flush, 250);
	}

	async function flush() {
		timer = null;
		const codes = Array.from(pending);
		pending = new Set();
		if (!codes.length) return;
		try {
			const result = await dmCall<AvailabilityResult>(
				"get_items_availability",
				{ item_codes: codes, pos_profile: profileName },
			);
			if (!result) return;
			keepRules(result);
			availability.value = {
				invoice: { ...availability.value.invoice, ...(result.invoice || {}) },
				order: { ...availability.value.order, ...(result.order || {}) },
			};
		} catch (error) {
			// Never block the cashier on a slow call: the server checks stock on submit.
			console.warn("delivery_management: availability not loaded", error);
		}
	}

	function resetAvailability() {
		availability.value = { invoice: {}, order: {} };
	}

	/** Item codes on the current page of the item selector. */
	let visibleCodes: string[] = [];
	function setVisibleCodes(codes: string[]) {
		visibleCodes = codes || [];
	}

	/** After a sale or a type change: reload the items on screen and in the cart (old
	 * numbers stay until the new ones arrive). Everything else is forgotten and loads
	 * again when it is shown, so a big catalogue never means one huge request. */
	async function stockChanged(codes: string[], posProfile: string) {
		if (!isDeliveryManagementEnabled() || !posProfile) return;
		const all = Array.from(new Set([...visibleCodes, ...(codes || [])].filter(Boolean)));
		if (!all.length) return;
		try {
			const result = await dmCall<AvailabilityResult>(
				"get_items_availability",
				// Item rules do not change with stock; only quantities are refreshed.
				{ item_codes: all, pos_profile: posProfile, rules: 0 },
			);
			if (result) keepRules(result);
			if (result) availability.value = { invoice: result.invoice || {}, order: result.order || {} };
		} catch (error) {
			console.warn("delivery_management: availability not refreshed", error);
		}
	}

	function keepRules(result: AvailabilityResult) {
		rules.value = { ...rules.value, ...(result.rules || {}) };
		if (result.delivery_charge_item !== undefined) deliveryChargeItem.value = result.delivery_charge_item || null;
	}

	/** Make sure the rules of these items are known (loads the missing ones now). */
	async function ensureRules(codes: string[], posProfile: string): Promise<void> {
		if (!isDeliveryManagementEnabled() || !posProfile) return;
		const missing = Array.from(new Set((codes || []).filter((c) => c && !(c in rules.value))));
		if (!missing.length && deliveryChargeItem.value !== null) return;
		const result = await dmCall<AvailabilityResult>("get_items_availability", {
			item_codes: missing.length ? missing : codes.slice(0, 1),
			pos_profile: posProfile,
		});
		if (!result) return;
		keepRules(result);
		availability.value = {
			invoice: { ...availability.value.invoice, ...(result.invoice || {}) },
			order: { ...availability.value.order, ...(result.order || {}) },
		};
	}

	/** Sellable qty for a POS type; ``undefined`` = not loaded yet, ``null`` = no limit. */
	function qtyFor(itemCode: string, type: string): number | null | undefined {
		const map = type === "Order" ? availability.value.order : availability.value.invoice;
		return itemCode in map ? map[itemCode] : undefined;
	}

	return {
		delivery,
		availability,
		refreshToken,
		saving,
		setDelivery,
		clearDelivery,
		requestRefresh,
		loadAvailability,
		resetAvailability,
		stockChanged,
		setVisibleCodes,
		qtyFor,
		rules,
		deliveryChargeItem,
		ensureRules,
	};
});
