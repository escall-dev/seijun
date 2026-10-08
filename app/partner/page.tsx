import { getAuthenticatedUser } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { PartnerDashboardView } from "@/components/partner/partner-dashboard-view"
import { getPartnerDashboardFullAction } from "@/app/actions/partner-shared"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Partner Dashboard | Seijun",
  description: "View shared cycle data from your connected partner.",
}

export default async function PartnerDashboardPage() {
  const user = await getAuthenticatedUser()

  if (!user) {
    redirect("/login?redirect=/partner")
  }

  const initialData = await getPartnerDashboardFullAction()
  return <PartnerDashboardView initialData={initialData} />
}
