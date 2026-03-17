import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/index";
import { dealerOnboardingApplications } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

type RouteContext = {
  params: Promise<{ dealerId: string }>;
};

export async function POST(_req: NextRequest, context: RouteContext) {
  try {
    const { dealerId } = await context.params;

    await db
      .update(dealerOnboardingApplications)
      .set({
        onboardingStatus: "completed",
        reviewStatus: "approved",
        dealerAccountStatus: "active",
        approvedAt: new Date(),
      })
      .where(eq(dealerOnboardingApplications.id, dealerId));

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("APPROVE DEALER ERROR:", error);
    return NextResponse.json(
      { success: false, message: error?.message || "Approve failed" },
      { status: 500 }
    );
  }
}