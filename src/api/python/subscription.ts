// @/src/api/python/subscriptions.ts

import { AxiosResponse } from "axios";
import { API } from "@/src/api/python";

export const inAppPurchaseSuccess = async (userId: string, receipt: string): Promise<AxiosResponse<any>> => {
  return API.post("/in_app_purchase_success", { user_id: userId, receipt: encodeURIComponent(receipt) });
};

export const stripeCheckoutSuccess = async (sessionId: string, userId: string, host: string): Promise<AxiosResponse<any>> => {
  return API.get("/stripe_checkout_success", { params: { session_id: sessionId, user_id: userId, host } });
};

export const handleStripeSubscriptionInvoicePaid = async (payload: any, sigHeader: string): Promise<AxiosResponse<any>> => {
  return API.post("/webhook-stripe-subscription-invoice-paid", payload, { headers: { 'Stripe-Signature': sigHeader } });
};

export const handleStripeCheckoutSessionCompleted = async (payload: any, sigHeader: string): Promise<AxiosResponse<any>> => {
  return API.post("/webhook-stripe-checkout-session-completed", payload, { headers: { 'Stripe-Signature': sigHeader } });
};

export const getStripePrices = async (test: boolean): Promise<AxiosResponse<any>> => {
  return API.get("/stripe-prices", { params: { test } });
};

export const paypalCheckoutSuccess = async (payId: string, userId: string, host: string): Promise<AxiosResponse<any>> => {
  return API.get("/paypal_checkout_success", { params: { pay_id: payId, user_id: userId, host } });
};

export const updateOrAddSubscription = async (email: string, type: string, paymentProcessor: string, paymentId: string, notes?: string): Promise<AxiosResponse<any>> => {
  return API.post("/admin/update_or_add_subscription", { email, type, payment_processor: paymentProcessor, payment_id: paymentId, notes });
};

export const checkUserSubscription = async (email: string): Promise<AxiosResponse<any>> => {
  return API.get("/admin/check_user_subscription", { params: { email } });
};

export const cancelSubscriptionAtEndOfPeriod = async (customerId: string): Promise<AxiosResponse<any>> => {
  return API.post("/cancel-subscription-at-end-of-period", { customer_id: customerId });
};