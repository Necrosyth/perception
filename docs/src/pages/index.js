import React from "react";
import Layout from "@theme/Layout";
import Link from "@docusaurus/Link";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";

const cards = [
  {
    title: "What is Surveillance Intelligence Lab?",
    href: "/docs/intro",
    body: "Overview of the product, the platform, and what each container does.",
  },
  {
    title: "Quick start",
    href: "/docs/intro/installation",
    body: "Bring the whole stack up with docker compose and see live video in minutes.",
  },
  {
    title: "Configuration reference",
    href: "/docs/configuration",
    body: "Every key in aina.yaml — cameras, zones, detection, tracking, persistence.",
  },
  {
    title: "Using the dashboard",
    href: "/docs/usage/live",
    body: "Live grid, review, semantic explore, zone editor, and system health.",
  },
  {
    title: "API reference",
    href: "/docs/platform/api",
    body: "REST endpoints for cameras, zones, tracks, and events.",
  },
  {
    title: "GPU acceleration",
    href: "/docs/deployment/gpu-acceleration",
    body: "Edge (Jetson) and AWS (T4 / A10G) deployment, TensorRT engine caching.",
  },
  {
    title: "Architecture",
    href: "/docs/development/architecture",
    body: "The module system, orchestrator dependency graph, and no-coupling rules.",
  },
  {
    title: "Roadmap",
    href: "/docs/development/roadmap",
    body: "Planned capabilities: loitering, semantic search, face recognition, ANPR.",
  },
];

export default function Home() {
  const { siteConfig } = useDocusaurusContext();
  return (
    <Layout title={siteConfig.title} description={siteConfig.tagline}>
      <header className="hero hero--primary">
        <div className="container">
          <div className="hero__badge">Hypotenuse Analytics</div>
          <h1 className="hero__title">Surveillance Intelligence Lab</h1>
          <p className="hero__subtitle">
            Real-time computer-vision surveillance intelligence for loading docks, parking lots,
            and facilities — detect, track, and search what the cameras saw.
          </p>
          <p className="hero__tagline">Predict. Protect. Verify.</p>
          <div style={{ marginTop: "1.5rem", display: "flex", gap: "0.75rem" }}>
            <Link className="button button--primary button--lg" to="/docs/intro/installation">
              Get started
            </Link>
            <Link className="button button--secondary button--lg" to="/docs/intro">
              Read the docs
            </Link>
          </div>
        </div>
      </header>
      <main>
        <div className="container">
          <div className="card-grid">
            {cards.map((c) => (
              <Link key={c.href} to={c.href}>
                <h3>{c.title}</h3>
                <p>{c.body}</p>
              </Link>
            ))}
          </div>
        </div>
      </main>
    </Layout>
  );
}