/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
const sidebars = {
  docs: [
    {
      type: "category",
      label: "Getting Started",
      collapsible: false,
      items: [
        "intro/index",
        "intro/hardware",
        "intro/planning",
        "intro/installation",
        "intro/updating",
        "intro/camera-setup",
        "intro/video-pipeline",
        "intro/network",
        "intro/glossary",
      ],
    },
    {
      type: "category",
      label: "Using the Dashboard",
      collapsible: false,
      items: [
        "usage/live",
        "usage/review",
        "usage/explore",
        "usage/zone-editor",
        "usage/system",
      ],
    },
    {
      type: "category",
      label: "Configuration",
      collapsible: false,
      items: [
        "configuration/index",
        "configuration/detection",
        "configuration/tracking",
        "configuration/zones",
        "configuration/smoothing",
        "configuration/persistence",
        "configuration/capabilities",
        "configuration/environment",
      ],
    },
    {
      type: "category",
      label: "Platform",
      collapsible: false,
      items: ["platform/data-layer", "platform/api", "platform/media"],
    },
    {
      type: "category",
      label: "Deployment",
      collapsible: false,
      items: ["deployment/docker", "deployment/gpu-acceleration"],
    },
    {
      type: "category",
      label: "Development",
      collapsible: false,
      items: ["development/architecture", "development/modules", "development/roadmap"],
    },
  ],
};

export default sidebars;