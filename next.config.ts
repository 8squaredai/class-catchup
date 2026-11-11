import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The summary SKILL.md is read at runtime, so make sure it ships with every server route.
  outputFileTracingIncludes: {
    "/**": ["./skills/**/*"],
  },
};

export default nextConfig;
