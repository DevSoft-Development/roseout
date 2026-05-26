import { Suspense } from "react";
import CreatePasswordClient from "./CreatePasswordClient";

export default function CreatePasswordPage() {
  return <Suspense fallback={<main className="min-h-screen bg-[#090706] p-6 text-white">Loading password setup...</main>}><CreatePasswordClient /></Suspense>;
}
