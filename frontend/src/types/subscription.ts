import type { Organisation } from "./organisation";

export interface SubscriptionPlan {
  id: number;
  name: string;
  slug: string;
  price: string;
  currency: string;
  interval: "monthly" | "yearly";
  max_users: number;
  max_modules: number;
  stripe_price_id?: string | null;
  is_active: boolean;
}

export interface Subscription {
  id: number;
  organisation: Organisation | number;
  organisation_name: string;
  plan: SubscriptionPlan | number;
  plan_name: string;
  status: "trialing" | "active" | "past_due" | "cancelled" | "expired";
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  current_period_start?: string | null;
  current_period_end?: string | null;
  trial_ends_at?: string | null;
  cancel_at_period_end: boolean;
  created_at: string;
  updated_at: string;
}