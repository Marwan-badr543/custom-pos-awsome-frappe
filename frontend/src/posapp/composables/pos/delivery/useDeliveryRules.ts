/**
 * delivery_management rules for delivery Orders in the POS:
 *
 * An item with "Has Delivery Charge" brings the Delivery Charge Item (Delivery
 * Settings) into the order, once: never a second row, never qty 2.
 *
 * AC units and TV / other goods may share one order: the server makes one Delivery
 * Note per team (``orders.delivery_note.split_by_order_type``).
 *
 * Applies to dm Orders only (a branch Invoice has no delivery). The server checks
 * again on submit (``api.pos.check_pos_order_rules``).
 */
import { useDeliveryStore, type ItemRule } from "../../../stores/deliveryStore";
import { isDmOrder } from "../../../utils/deliveryManagement";

declare const __: (text: string, args?: any[]) => string;

export function useDeliveryRules() {
	const store = useDeliveryStore();

	function ruleOf(code: string | undefined): ItemRule | undefined {
		return code ? store.rules[code] : undefined;
	}

	function active(invoiceType: string, posProfile: any, doc?: any) {
		return isDmOrder(invoiceType, posProfile, doc);
	}

	/** Why ``item`` may not be added to this order (null = fine). Loads missing rules first. */
	async function blockReason(item: any, cartItems: any[], posProfile: any): Promise<string | null> {
		const codes = [item?.item_code, ...(cartItems || []).map((r) => r?.item_code)].filter(Boolean);
		try {
			await store.ensureRules(codes, posProfile?.name);
		} catch (e) {
			// Never stop a sale on a slow call: the server checks again on submit.
			console.warn("delivery_management: item rules not loaded", e);
			return null;
		}
		const charge = store.deliveryChargeItem;
		if (charge && item?.item_code === charge && (cartItems || []).some((r) => r?.item_code === charge)) {
			return __("The delivery charge is already in this order. One order pays one delivery.");
		}
		return null;
	}

	/** True when the cart has an item that brings the delivery charge, and the charge is not there yet. */
	function needsDeliveryCharge(cartItems: any[]): boolean {
		const charge = store.deliveryChargeItem;
		if (!charge) return false;
		const items = cartItems || [];
		return !items.some((r) => r?.item_code === charge) && items.some((r) => ruleOf(r?.item_code)?.delivery_charge);
	}

	/** Problems with the delivery charge rows (several rows, or qty above 1). */
	function chargeProblem(cartItems: any[]): string | null {
		const charge = store.deliveryChargeItem;
		if (!charge) return null;
		const rows = (cartItems || []).filter((r) => r?.item_code === charge);
		const qty = rows.reduce((s, r) => s + Math.abs(Number(r?.qty) || 0), 0);
		if (rows.length > 1 || qty > 1) {
			return __("The delivery charge can be in an order only once, with qty 1.");
		}
		return null;
	}

	return { active, ruleOf, blockReason, needsDeliveryCharge, chargeProblem, store };
}
