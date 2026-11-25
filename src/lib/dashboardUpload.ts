import { convexSiteUrl, resolveConvexUrl } from "./convexUrl";
import { translate } from "./i18n";

export async function uploadDashboardFile(
  token: string,
  guildId: string,
  file: File,
  target: { purpose: "greeting"; slot: string } | { purpose: "import" },
): Promise<void> {
  const site = import.meta.env.DEV
    ? convexSiteUrl()
    : resolveConvexUrl().replace(/\.convex\.cloud$/i, ".convex.site");
  const url = new URL("/dashboard/upload", site);
  url.searchParams.set("guild", guildId);
  url.searchParams.set("purpose", target.purpose);
  if (target.purpose === "greeting") url.searchParams.set("slot", target.slot);
  else url.searchParams.set("fileName", file.name.slice(0, 120));

  const response = await fetch(url, {
    method: "POST",
    credentials: "omit",
    redirect: "error",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": file.type || "application/octet-stream",
    },
    body: file,
  });
  if (!response.ok) {
    throw new Error(translate("Tải file thất bại"));
  }
}
