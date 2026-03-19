import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { dealerOnboardingApplications, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { generateTemporaryPassword } from "@/lib/auth/generateTemporaryPassword";
import { hashPassword } from "@/lib/auth/hashPassword";
import { sendDealerWelcomeEmail } from "@/lib/email/sendDealerWelcomeEmail";
import { supabaseAdmin } from "@/lib/supabase/admin";

type RouteContext = {
  params: Promise<{ dealerId: string }>;
};

function generateDealerCode() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const random = Math.floor(100 + Math.random() * 900);
  return `ACC-ITARANG-${yyyy}${mm}${dd}-${random}`;
}

function resolveDealerLoginEmail(application: any) {
  return application?.ownerEmail?.trim?.() || null;
}

export async function POST(_req: NextRequest, context: RouteContext) {
  try {
    const { dealerId } = await context.params;

    const existing = await db
      .select()
      .from(dealerOnboardingApplications)
      .where(eq(dealerOnboardingApplications.id, dealerId));

    const application = existing[0];

    if (!application) {
      return NextResponse.json(
        {
          success: false,
          message: "Dealer onboarding application not found",
        },
        { status: 404 }
      );
    }

    const dealerCode = application.dealerCode || generateDealerCode();
    const dealerLoginEmail = resolveDealerLoginEmail(application);

    console.log("APPROVE EMAIL WILL GO TO:", dealerLoginEmail);

    if (!dealerLoginEmail) {
      return NextResponse.json(
        {
          success: false,
          message: "Dealer owner email is missing in onboarding record.",
        },
        { status: 400 }
      );
    }

    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await hashPassword(temporaryPassword);

    await db
      .update(dealerOnboardingApplications)
      .set({
        onboardingStatus: "approved",
        reviewStatus: "approved",
        dealerAccountStatus: "active",
        approvedAt: new Date(),
        rejectedAt: null,
        rejectionReason: null,
        correctionRemarks: null,
        rejectionRemarks: null,
        dealerCode,
        updatedAt: new Date(),
      })
      .where(eq(dealerOnboardingApplications.id, dealerId));

    // Create or update Supabase Auth user
    const { data: authUsers, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    if (listError) {
      console.error("SUPABASE AUTH LIST USERS ERROR:", listError);
    }

    const existingAuthUser = authUsers?.users?.find(
      (u) => u.email?.toLowerCase() === dealerLoginEmail.toLowerCase()
    );

    if (existingAuthUser) {
      const { error: updateAuthError } = await supabaseAdmin.auth.admin.updateUserById(
        existingAuthUser.id,
        {
          password: temporaryPassword,
          email_confirm: true,
          user_metadata: {
            role: "dealer",
            dealer_code: dealerCode,
          },
        }
      );

      if (updateAuthError) {
        console.error("SUPABASE AUTH UPDATE ERROR:", updateAuthError);
        return NextResponse.json(
          {
            success: false,
            message: `Failed to update auth user: ${updateAuthError.message}`,
          },
          { status: 500 }
        );
      }
    } else {
      const { error: createAuthError } = await supabaseAdmin.auth.admin.createUser({
        email: dealerLoginEmail,
        password: temporaryPassword,
        email_confirm: true,
        user_metadata: {
          role: "dealer",
          dealer_code: dealerCode,
        },
      });

      if (createAuthError) {
        console.error("SUPABASE AUTH CREATE ERROR:", createAuthError);
        return NextResponse.json(
          {
            success: false,
            message: `Failed to create auth user: ${createAuthError.message}`,
          },
          { status: 500 }
        );
      }
    }

    const existingUserRows = await db
      .select()
      .from(users)
      .where(eq(users.email, dealerLoginEmail));

    const existingUser = existingUserRows[0];

    if (existingUser) {
      await db
        .update(users)
        .set({
          name: application.ownerName || application.companyName,
          role: "dealer",
          dealer_id: dealerCode,
          phone: application.ownerPhone || null,
          is_active: true,
          password_hash: passwordHash,
          must_change_password: true,
          updated_at: new Date(),
        })
        .where(eq(users.id, existingUser.id));
    } else {
      await db.insert(users).values({
        id: crypto.randomUUID(),
        email: dealerLoginEmail,
        name: application.ownerName || application.companyName,
        role: "dealer",
        dealer_id: dealerCode,
        phone: application.ownerPhone || null,
        avatar_url: null,
        password_hash: passwordHash,
        must_change_password: true,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      });
    }

    let emailSent = false;
    let emailError: string | null = null;

    try {
      const mailResult = await sendDealerWelcomeEmail({
        toEmail: dealerLoginEmail,
        dealerName: application.ownerName || application.companyName || "Dealer",
        companyName: application.companyName || "iTarang Dealer",
        dealerId: dealerCode,
        userId: dealerLoginEmail,
        password: temporaryPassword,
        loginUrl: process.env.DEALER_LOGIN_URL || "http://localhost:3000/login",
        supportEmail: process.env.DEALER_SUPPORT_EMAIL || "support@itarang.com",
        supportPhone: process.env.DEALER_SUPPORT_PHONE || "+91-0000000000",
      });

      console.log("DEALER WELCOME EMAIL SUCCESS:", mailResult);
      emailSent = true;
    } catch (mailError: any) {
      emailError = mailError?.message || "Unknown email error";
      console.error("DEALER WELCOME EMAIL ERROR:", mailError);
    }

    return NextResponse.json({
      success: true,
      message: emailSent
        ? "Dealer approved successfully and welcome email sent"
        : "Dealer approved successfully, but welcome email failed",
      dealerCode,
      emailSent,
      emailTarget: dealerLoginEmail,
      emailError,
    });
  } catch (error: any) {
    console.error("APPROVE DEALER ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        message: error?.message || "Approve failed",
      },
      { status: 500 }
    );
  }
}