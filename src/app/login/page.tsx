import { Card, PageTitle } from "@/components/ui";
import { LoginForm } from "./login-form";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { deleted } = await searchParams;
  return (
    <div className="mx-auto max-w-sm">
      <PageTitle sub="予測を立て、現実と照らし合わせ、検証を積み重ねるためのログ">予測ログ</PageTitle>
      {deleted === "1" && <p className="mb-4 text-sm text-muted">アカウントとすべてのデータを削除しました。</p>}
      <Card>
        <LoginForm />
      </Card>
    </div>
  );
}
