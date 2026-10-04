import { Card, PageTitle } from "@/components/ui";
import { requireUser } from "@/lib/supabase/server";
import type { BirthProfileRow } from "@/lib/db/types";
import { ProfileForm } from "./profile-form";
import { DataManagement } from "./data-management";

export default async function ProfilePage() {
  const { supabase } = await requireUser();
  const { data } = await supabase.from("birth_profiles").select("*").maybeSingle();
  return (
    <div>
      <PageTitle sub="占術の計算に使う基礎データです。変更しても過去の予測には影響しません。">プロフィール</PageTitle>
      <Card>
        <ProfileForm initial={(data as BirthProfileRow | null) ?? null} />
      </Card>
      <Card className="mt-6">
        <h2 className="mb-4 font-bold">データの管理</h2>
        <DataManagement />
      </Card>
    </div>
  );
}
