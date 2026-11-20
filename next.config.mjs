import { buildId } from "./build-id.mjs";

/**
 * Statisk export (spec: ingen server, inga API-routes). HTTP-huvuden kan inte sättas av Next i exportläge; de ligger i vercel.json.
 * `trailingSlash` ger /walk/index.html, som alla statiska värdar serverar utan omskrivningsregler.
 */
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  trailingSlash: true,
  reactStrictMode: true,
  images: { unoptimized: true },
  env: { NEXT_PUBLIC_BUILD_ID: buildId() },
};
export default nextConfig;
