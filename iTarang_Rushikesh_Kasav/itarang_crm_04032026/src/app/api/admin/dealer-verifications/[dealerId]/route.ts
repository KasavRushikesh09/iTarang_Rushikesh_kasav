import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/index";
import { dealerOnboardingApplications } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

type RouteContext = {
  params: Promise<{ dealerId: string }>;
};

export async function GET(_req: NextRequest, context: RouteContext) {
  try {
    const { dealerId } = await context.params;

    const application = await db
      .select()
      .from(dealerOnboardingApplications)
      .where(eq(dealerOnboardingApplications.id, dealerId));

    const row = application[0];

    if (!row) {
      return NextResponse.json(
        {
          success: false,
          message: "Dealer onboarding application not found",
        },
        { status: 404 }
      );
    }

    const companyAddress =
      typeof row.businessAddress === "object" &&
      row.businessAddress &&
      "address" in row.businessAddress
        ? String((row.businessAddress as any).address || "")
        : "";

    return NextResponse.json({
      success: true,
      data: {
        id: row.id,
        dealerId: row.id,
        companyName: row.companyName,
        companyAddress,
        gstNumber: row.gstNumber,
        panNumber: row.panNumber,
        cinNumber: row.cinNumber,
        companyType: row.companyType,
        bankName: row.bankName || "Not available",
        accountNumber: row.accountNumber || "Not available",
        beneficiaryName: row.beneficiaryName || "Not available",
        ifscCode: row.ifscCode || "Not available",
        financeEnabled: row.financeEnabled,
        onboardingStatus: row.onboardingStatus,
        reviewStatus: row.reviewStatus,
        submittedAt: row.submittedAt,
        documents: [
            { name: "GST Certificate", url: "..." },
            { name: "PAN", url: "..." },
        ],
        agreement: row.financeEnabled
          ? {
              agreementId: null,
              signerName: null,
              signerEmail: null,
              status: "Not available",
              copyUrl: null,
            }
          : null,
          ownerName: row.ownerName || "Not available",
          ownerPhone: row.ownerPhone || "Not available",
          ownerEmail: row.ownerEmail || "Not available",
      },
    });
  } catch (error: any) {
    console.error("ADMIN DEALER VERIFICATION DETAIL ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        message: error?.message || "Failed to fetch dealer verification detail",
      },
      { status: 500 }
    );
  }
}