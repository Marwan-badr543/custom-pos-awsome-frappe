import { parseBooleanSetting } from "./stock";
import { dmOrdersEnabled } from "./deliveryManagement";

export type PosDocumentMode = "Invoice" | "Order" | "Quotation" | "Return" | string;

interface ResolvePosDocumentDoctypeOptions {
	invoiceType?: PosDocumentMode | null;
	posProfile?: Record<string, any> | null;
}

export function resolvePosDocumentDoctype({
	invoiceType,
	posProfile,
}: ResolvePosDocumentDoctypeOptions) {
	if (invoiceType === "Quotation") {
		return "Quotation";
	}

	// delivery_management: an Order stays a Sales Invoice draft; the server creates the
	// Sales Order on submit (see utils/deliveryManagement.ts).
	if (invoiceType === "Order" && dmOrdersEnabled(posProfile)) {
		return "Sales Invoice";
	}

	if (
		invoiceType === "Order" &&
		(parseBooleanSetting(posProfile?.posa_allow_sales_order) ||
			parseBooleanSetting(posProfile?.posa_create_only_sales_order))
	) {
		return "Sales Order";
	}

	if (parseBooleanSetting(posProfile?.create_pos_invoice_instead_of_sales_invoice)) {
		return "POS Invoice";
	}

	return "Sales Invoice";
}
