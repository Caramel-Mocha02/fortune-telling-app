import { PageTitle } from "@/components/ui";
import { MenuCards } from "@/components/menu-cards";
import { requireUser } from "@/lib/supabase/server";
import { REFLECT_PAGES } from "@/lib/navigation";

export default async function ReflectPage() {
  await requireUser();
  return (
    <div className="space-y-6">
      <PageTitle sub="占いと、実際に起きたことを見比べてみましょう">ふりかえり</PageTitle>
      <MenuCards items={REFLECT_PAGES} />
    </div>
  );
}
