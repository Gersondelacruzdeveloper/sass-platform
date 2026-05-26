import api from "./axios";
import type { Subscription, SubscriptionPlan } from "../types/subscription";

export const getPlans = async (): Promise<SubscriptionPlan[]> => {
  const response = await api.get<SubscriptionPlan[]>("/subscriptions/plans/");
  return response.data;
};

export const getSubscriptions = async (): Promise<Subscription[]> => {
  const response = await api.get<Subscription[]>("/subscriptions/subscriptions/");
  return response.data;
};