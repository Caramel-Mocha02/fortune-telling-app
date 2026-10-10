import { Card } from "@/components/ui";
import { LogoMark } from "@/components/logo";
import { APP_NAME, APP_TAGLINE } from "@/lib/brand";
import { LoginForm } from "./login-form";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { deleted } = await searchParams;
  return (
    <div className="mx-auto max-w-sm">
      <div className="mb-6 flex flex-col items-center gap-3 text-center">
        <LogoMark className="h-16 w-16" />
        <h1 className="text-2xl font-bold">{APP_NAME}</h1>
        <p className="text-sm text-muted">{APP_TAGLINE}</p>
      </div>
      {deleted === "1" && <p className="mb-4 text-sm text-muted">アカウントとすべてのデータを削除しました。</p>}
      <Card>
        <LoginForm />
      </Card>
    </div>
  );
}
