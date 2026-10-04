import { Card, PageTitle } from "@/components/ui";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <div className="mx-auto max-w-sm">
      <PageTitle sub="予測を立て、現実と照らし合わせ、検証を積み重ねるためのログ">予測ログ</PageTitle>
      <Card>
        <LoginForm />
      </Card>
    </div>
  );
}
