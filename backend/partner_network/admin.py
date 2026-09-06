from django.contrib import admin

from partner_network.models import (
    PartnerNetworkSettings,
    ReferralBalanceAdjustment,
    ReferralBookingAttribution,
    ReferralCommission,
    ReferralCommissionRule,
    ReferralFeedbackRequest,
    ReferralPartner,
    ReferralPartnerAccess,
    ReferralPartnerLocation,
    ReferralPayout,
    ReferralPayoutAdjustmentLine,
    ReferralPayoutLine,
    ReferralProductAccess,
    ReferralQRCode,
    ReferralQRScan,
    ReferralSession,
)

for model in (
    PartnerNetworkSettings,
    ReferralPartner,
    ReferralPartnerLocation,
    ReferralProductAccess,
    ReferralPartnerAccess,
    ReferralQRCode,
    ReferralQRScan,
    ReferralSession,
    ReferralBookingAttribution,
    ReferralCommissionRule,
    ReferralCommission,
    ReferralFeedbackRequest,
    ReferralBalanceAdjustment,
    ReferralPayout,
    ReferralPayoutAdjustmentLine,
    ReferralPayoutLine,
):
    admin.site.register(model)
