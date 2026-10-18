/**
 * delivery_management integration.
 *
 * When the delivery_management app is installed (``frappe.boot.delivery_management``)
 * and the POS Profile allows Orders:
 * - a new sale starts as an Order (home delivery);
 * - Orders stay Sales Invoice drafts and are submitted through
 *   ``delivery_management.api.pos.submit``, which creates the Sales Order, picks the
 *   serials, books the delivery slot / AC day, then submits the invoice;
 * - Invoices (branch pickup) also go through it, so serials are picked on the server.
 *
 * Without the app, POS Awesome behaves exactly as stock.
 */
import { parseBooleanSetting } from "./stock";
import api, { type CallOptions } from "../services/api";
import { useInvoiceStore } from "../stores/invoiceStore";

declare const frappe: any;

export const DM_API = "delivery_management.api.pos";

export function isDeliveryManagementEnabled(): boolean {
	return Boolean(
		typeof frappe !== "undefined" && frappe?.boot?.delivery_management?.enabled,
	);
}

/** True when this profile sells delivery Orders through delivery_management. */
export function dmOrdersEnabled(posProfile: any): boolean {
	return (
		isDeliveryManagementEnabled() &&
		parseBooleanSetting(posProfile?.posa_allow_sales_order)
	);
}

/** The type a new sale starts with. */
export function defaultInvoiceType(posProfile: any): string {
	if (dmOrdersEnabled(posProfile)) return "Order";
	return parseBooleanSetting(posProfile?.posa_default_sales_order)
		? "Order"
		: "Invoice";
}

/** True for a delivery Order handled by delivery_management (not a return). */
export function isDmOrder(
	invoiceType: string | null | undefined,
	posProfile: any,
	doc?: any,
): boolean {
	return (
		invoiceType === "Order" &&
		dmOrdersEnabled(posProfile) &&
		!parseBooleanSetting(doc?.is_return)
	);
}

/** An item exchange: submitted by POS Awesome itself, so the browser still picks serials. */
function exchangeInProgress(): boolean {
	try {
		return Boolean(useInvoiceStore().exchangeSession);
	} catch {
		return false;
	}
}

/** Sales (not returns, not exchanges) whose serial numbers are picked by the server. */
export function serialsPickedByServer(doc?: any, item?: any): boolean {
	return (
		isDeliveryManagementEnabled() &&
		!exchangeInProgress() &&
		!parseBooleanSetting(doc?.is_return) &&
		!parseBooleanSetting(item?.is_return) &&
		Number(item?.qty ?? 1) >= 0
	);
}

/** The POS type sent to the server: returns are always plain invoices. */
export function dmOrderType(invoiceType: string, posProfile: any, doc?: any) {
	return isDmOrder(invoiceType, posProfile, doc) ? "Order" : "Invoice";
}

// ---------------------------------------------------------------- Arabic digits

const ARABIC_DIGITS: Record<string, string> = {
	"٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
	"٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
	"۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4",
	"۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
};

/** Block / Road / Building: digits only, Arabic-Indic digits become 0-9. */
export function digitsOnly(value: unknown): string {
	return String(value ?? "")
		.replace(/[٠-٩۰-۹]/g, (d) => ARABIC_DIGITS[d] || "")
		.replace(/[^0-9]/g, "");
}

// ---------------------------------------------------------------- API

/** Calls ``delivery_management.api.pos.<method>``; throws ApiEnvelopeError with the server message. */
export function dmCall<T = any>(
	method: string,
	args: Record<string, any> = {},
	options: CallOptions = {},
): Promise<T> {
	return api.call<T>(`${DM_API}.${method}`, args, options);
}
