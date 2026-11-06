import type { NextConfig } from "next";
const config: NextConfig = {
  transpilePackages: ["@agentmeter/shared"],
  devIndicators: false,
};
export default config;
