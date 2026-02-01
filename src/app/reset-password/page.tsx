import { Suspense } from "react";
import ResetPasswordClient from "./ResetPasswordClient";

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={<div className="min-h-screen bg-slate-950 text-slate-50" />}
    >
      <ResetPasswordClient />
    </Suspense>
  );
}

