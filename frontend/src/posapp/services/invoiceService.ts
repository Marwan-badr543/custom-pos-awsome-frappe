import api from "./api";
import { unwrapApiResult, type ApiEnvelope } from "./api";
import type { InvoiceDoc, POSProfile } from "../types/models";
import { resolvePosDocumentDoctype } from "../utils/posDocumentMode";
import {
	DM_API,
	dmOrderType,
	isDeliveryManagementEnabled,
} from "../utils/deliveryManagement";
import { useDeliveryStore } from "../stores/deliveryStore";

function getSubmitInvoiceCall(
	data: any,
	invoiceDoc: InvoiceDoc | string,
	invoiceType: string,
	posProfile: POSProfile,
) {
	const doctype = resolvePosDocumentDoctype({
		invoiceType,
		posProfile,
	});
	if (
		isDeliveryManagementEnabled() &&
		(doctype === "Sales Invoice" || doctype === "POS Invoice") &&
		invoiceDoc &&
		typeof invoiceDoc === "object"
	) {
		// delivery_management picks serials, books the slot / AC day and, for Orders,
		// creates the Sales Order, then submits through POS Awesome's own submit_invoice
		// (always synchronously).
		const orderType = dmOrderType(invoiceType, posProfile, invoiceDoc);
		return {
			method: `${DM_API}.submit`,
			args: {
				data,
				invoice: invoiceDoc,
				order_type: orderType,
				delivery: orderType === "Order" ? useDeliveryStore().delivery : {},
			},
		};
	}

	const method =
		doctype === "Sales Order"
			? "posawesome.posawesome.api.sales_orders.submit_sales_order"
			: doctype === "Quotation"
				? "posawesome.posawesome.api.quotations.submit_quotation"
				: "posawesome.posawesome.api.invoices.submit_invoice";

	const args = {
		data,
		invoice: invoiceDoc,
		order: invoiceDoc,
		submit_in_background:
			posProfile.posa_allow_submissions_in_background_job,
	};

	return { method, args };
}

const invoiceService = {
	async getExchangeByRequestId(
		clientRequestId: string,
		posProfile: POSProfile,
	): Promise<any | null> {
		return unwrapApiResult(
			await api.callEnvelope(
				"posawesome.posawesome.api.exchange.get_item_exchange",
				{
					client_request_id: clientRequestId,
					pos_profile: posProfile.name,
				},
			),
		);
	},

	submitExchange(
		data: any,
		saleInvoice: InvoiceDoc | string,
		returnInvoice: InvoiceDoc | string,
		posProfile: POSProfile,
		clientRequestId: string,
	): Promise<ApiEnvelope<any>> {
		return api.callEnvelope(
			"posawesome.posawesome.api.exchange.submit_item_exchange",
			{
				data,
				sale_invoice: saleInvoice,
				return_invoice: returnInvoice,
				pos_profile: posProfile.name,
				client_request_id: clientRequestId,
			},
		);
	},

	submitInvoice(
		data: any,
		invoiceDoc: InvoiceDoc | string,
		invoiceType: string,
		posProfile: POSProfile,
	): Promise<ApiEnvelope<any>> {
		const { method, args } = getSubmitInvoiceCall(
			data,
			invoiceDoc,
			invoiceType,
			posProfile,
		);
		// A delivery Order creates several documents in one request: allow it more time.
		const options = method.startsWith(DM_API) ? { timeoutMs: 120_000 } : undefined;
		return api.callEnvelope(method, args, options);
	},

	async submitInvoiceData(
		data: any,
		invoiceDoc: InvoiceDoc | string,
		invoiceType: string,
		posProfile: POSProfile,
	): Promise<any> {
		return unwrapApiResult(
			await this.submitInvoice(data, invoiceDoc, invoiceType, posProfile),
		);
	},
};

export default invoiceService;
