import { redirect } from "next/navigation";

/**
 * §7.3 Routes — root redirects to /overview.
 */
export default function Home() {
  redirect("/overview");
}
