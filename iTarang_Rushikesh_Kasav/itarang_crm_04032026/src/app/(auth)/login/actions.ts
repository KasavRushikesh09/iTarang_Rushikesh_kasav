"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function login(formData: FormData) {
  const supabase = await createClient();

  const data = {
    email: formData.get("email") as string,
    password: formData.get("password") as string,
  };

  const { error } = await supabase.auth.signInWithPassword(data);

  if (error) {
    redirect("/login?error=Could not authenticate user");
  }

  const matchedUsers = await db
    .select()
    .from(users)
    .where(eq(users.email, data.email));

  const appUser = matchedUsers[0];

  if (!appUser) {
    redirect("/login?error=User record not found");
  }

  if (!appUser.is_active) {
    redirect("/login?error=User is inactive");
  }

  revalidatePath("/", "layout");

  if (appUser.must_change_password) {
    redirect("/change-password");
  }

  if (appUser.role === "dealer") {
    redirect("/dealer-portal");
  }

  if (appUser.role === "admin") {
    redirect("/admin");
  }

  redirect("/");
}

export async function signup(formData: FormData) {
  const supabase = await createClient();

  const data = {
    email: formData.get("email") as string,
    password: formData.get("password") as string,
  };

  const { error } = await supabase.auth.signUp(data);

  if (error) {
    redirect("/login?error=Could not authenticate user");
  }

  revalidatePath("/", "layout");
  redirect("/");
}