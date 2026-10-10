import { Card, PageTitle } from "@/components/ui";
import { requireUser } from "@/lib/supabase/server";
import type { BirthProfileRow } from "@/lib/db/types";
import { ProfileForm } from "./profile-form";
import { DataManagement } from "./data-management";
import { MenuCards } from "@/components/menu-cards";
import { PALM_PAGE } from "@/lib/navigation";

export default async function ProfilePage() {
  const { supabase } = await requireUser();
  const { data } = await supabase.from("birth_profiles").select("*").maybeSingle();
  return (
    <div>
      <PageTitle sub="占いの計算に使う生年月日などです。変更しても、これまでの占いの結果は変わりません。">マイページ</PageTitle>
      <Card>
        <ProfileForm initial={(data as BirthProfileRow | null) ?? null} />
      </Card>
      <div className="mt-6">
        <MenuCards items={[PALM_PAGE]} />
      </div>
      <Card className="mt-6">
        <h2 className="mb-4 font-bold">データの管理</h2>
        <DataManagement />
      </Card>
    </div>
  );
}
