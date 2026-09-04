/** @type {import('next').NextConfig} */
export default {
  // The engine is consumed as TypeScript source, not a build artifact.
  transpilePackages: ['@trace/rack-engine', '@trace/requirement'],
  webpack: (config) => {
    // Engine imports carry .js extensions (NodeNext). Map them back to source
    // so webpack resolves ./spec.js to spec.ts.
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      '.js': ['.ts', '.tsx', '.js'],
    };
    return config;
  },
};
