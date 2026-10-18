/**
 * delivery_management: the stock a cashier can sell for the current POS type.
 * Invoice = this branch's warehouse, Order = the main store (actual - reserved stock).
 */
import { computed } from "vue";
import { storeToRefs } from "pinia";
import { useDeliveryStore } from "../../../stores/deliveryStore";
import { useInvoiceStore } from "../../../stores/invoiceStore";
import { isDeliveryManagementEnabled } from "../../../utils/deliveryManagement";

declare const __: (_text: string, _args?: any[]) => string;

export function useDeliveryStock() {
	const enabled = isDeliveryManagementEnabled();
	if (!enabled) {
		// Stock POS Awesome: touch no store, change nothing.
		return {
			enabled,
			type: computed(() => "Invoice"),
			dmQty: (_item: any): number | undefined => undefined,
			dmOut: (_item: any) => false,
			dmRemaining: (_itemCode: string, _cart: any[], _excludeRow?: any): number | undefined =>
				undefined,
			stockPlace: computed(() => ""),
		};
	}
	const deliveryStore = useDeliveryStore();
	const { invoiceType } = storeToRefs(useInvoiceStore());
	const type = computed(() => (invoiceType.value === "Order" ? "Order" : "Invoice"));
	const isReturn = computed(() => invoiceType.value === "Return");

	/** Sellable qty, or ``undefined`` when unknown (not loaded / no limit / app absent). */
	function dmQty(item: any): number | undefined {
		if (!item?.item_code || item.has_variants) return undefined;
		const qty = deliveryStore.qtyFor(item.item_code, type.value);
		return qty === null || qty === undefined ? undefined : Number(qty);
	}

	function dmOut(item: any): boolean {
		if (isReturn.value) return false;
		if (item?.has_variants) return false;
		// Non-stock items come back without a qty (no limit); a Product Bundle comes back
		// with what its components allow, so it is checked even though it is non-stock.
		const qty = dmQty(item);
		return qty !== undefined && qty <= 0;
	}

	/**
	 * Stock-UOM qty still free for ``itemCode`` after the cart lines (except ``excludeRow``);
	 * ``undefined`` = no limit known. Returns are not limited.
	 */
	function dmRemaining(itemCode: string, cart: any[], excludeRow?: any): number | undefined {
		if (isReturn.value || !itemCode) return undefined;
		const qty = deliveryStore.qtyFor(itemCode, type.value);
		if (qty === null || qty === undefined) return undefined;
		let used = 0;
		for (const line of cart || []) {
			if (!line || line === excludeRow || line.item_code !== itemCode) continue;
			used += Math.abs(
				Number(line.stock_qty) ||
					Number(line.qty || 0) * Number(line.conversion_factor || 1),
			);
		}
		return Number(qty) - used;
	}

	const stockPlace = computed(() =>
		type.value === "Order" ? __("the main store") : __("this branch"),
	);

	return { enabled, type, dmQty, dmOut, dmRemaining, stockPlace };
}
