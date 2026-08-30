// @ts-check
import { themes } from "prism-react-renderer";

const lightCodeTheme = themes.github;
const darkCodeTheme = themes.dracula;

/** @type {import('@docusaurus/types').Config} */
export default {
  title: "Surveillance Intelligence Lab",
  tagline: "Predict. Protect. Verify.",
  favicon: "img/hypotenuse-logo.png",
  url: "https://hypotenuseanalytics.com",
  baseUrl: "/docs/",

  organizationName: "necrosyth",
  projectName: "hypotenuse",

  onBrokenLinks: "throw",
  onBrokenMarkdownLinks: "warn",

  i18n: {
    defaultLocale: "en",
    locales: ["en"],
  },

  presets: [
    [
      "classic",
      {
        docs: {
          sidebarPath: "./sidebars.js",
          routeBasePath: "/",
          editUrl: "https://github.com/Necrosyth/hypotenuse",
        },
        blog: false,
        theme: {
          customCss: "./src/css/custom.css",
        },
      },
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      image: "img/hypotenuse-logo.png",
      navbar: {
        title: "Hypotenuse Analytics",
        logo: {
          alt: "Hypotenuse Analytics",
          src: "img/hypotenuse-logo.png",
        },
        items: [
          {
            type: "docSidebar",
            sidebarId: "docs",
            position: "left",
            label: "Documentation",
          },
          {
            href: "https://github.com/Necrosyth/hypotenuse",
            label: "GitHub",
            position: "right",
          },
        ],
      },
      footer: {
        style: "dark",
        links: [
          {
            title: "Product",
            items: [
              { label: "What is Surveillance Intelligence Lab?", to: "/docs/intro" },
              { label: "Quick start", to: "/docs/intro/installation" },
              { label: "Configuration", to: "/docs/configuration" },
            ],
          },
          {
            title: "Platform",
            items: [
              { label: "API reference", to: "/docs/platform/api" },
              { label: "Data layer", to: "/docs/platform/data-layer" },
              { label: "GPU acceleration", to: "/docs/deployment/gpu-acceleration" },
            ],
          },
          {
            title: "Development",
            items: [
              { label: "Architecture", to: "/docs/development/architecture" },
              { label: "Writing modules", to: "/docs/development/modules" },
              { label: "Roadmap", to: "/docs/development/roadmap" },
            ],
          },
        ],
        copyright: `Copyright © ${new Date().getFullYear()} Hypotenuse Analytics. Predict. Protect. Verify.`,
      },
      prism: {
        theme: lightCodeTheme,
        darkTheme: darkCodeTheme,
        additionalLanguages: ["nginx", "docker", "yaml", "bash", "sql"],
      },
      colorMode: {
        defaultMode: "dark",
        respectPrefersColorScheme: true,
      },
    }),
};