import React from "react";
import Layout from "@theme/Layout";
import Link from "@docusaurus/Link";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";

const cards = [
  {
    title: "Product Architecture",
    href: "/docs/intro",
    body: "Comprehensive overview of the platform, edge microservices, container topology, and zero-cloud local CV pipeline.",
  },
  {
    title: "Quick Start & Deployment",
    href: "/docs/intro/installation",
    body: "Deploy the whole stack via Docker Compose with hardware acceleration and verify real-time video streams in minutes.",
  },
  {
    title: "Configuration Reference",
    href: "/docs/configuration",
    body: "Full aina.yaml schema: camera ingest, polygon zone matrix, ByteTrack tracker heuristics, and disk retention rings.",
  },
  {
    title: "Dashboard & Operator Guide",
    href: "/docs/usage/live",
    body: "Live matrix feeds, Birds Eye composite restream, semantic explore, interactive zone drawing, and alert dispatch.",
  },
  {
    title: "Platform REST API",
    href: "/docs/platform/api",
    body: "High-throughput endpoints for cameras, zone events, tracking coordinates, embeddings, and clip extractions.",
  },
  {
    title: "GPU Acceleration & TensorRT",
    href: "/docs/deployment/gpu-acceleration",
    body: "Edge deployment on NVIDIA Jetson, Orin, and desktop/datacenter GPUs with automated TensorRT engine compilation.",
  },
  {
    title: "Module Engine Architecture",
    href: "/docs/development/architecture",
    body: "Event-driven orchestrator architecture, asynchronous pipeline graphs, and building custom perception modules.",
  },
  {
    title: "Roadmap & Release Notes",
    href: "/docs/development/roadmap",
    body: "Upcoming features: multi-modal zero-shot search, dynamic face anonymization, and automated ANPR gate triggers.",
  },
];

export default function Home() {
  const { siteConfig } = useDocusaurusContext();
  return (
    <Layout title={siteConfig.title} description={siteConfig.tagline}>
      <header className="hero hero--primary">
        <div className="container">
          <div className="hero__badge">
            <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "#2fbfa4", marginRight: 6 }} />
            Hypotenuse Analytics · Documentation
          </div>
          <h1 className="hero__title">Surveillance Intelligence Lab</h1>
          <p className="hero__subtitle">
            Enterprise computer-vision surveillance platform for loading docks, facilities, and perimeter security — detect, track, and semantically search visual memory.
          </p>
          <p className="hero__tagline">Predict. Protect. Verify.</p>
          <div style={{ marginTop: "2rem", display: "flex", gap: "1rem", flexWrap: "wrap" }}>
            <Link className="button button--primary button--lg" to="/docs/intro/installation" style={{ fontWeight: 700, borderRadius: 10, padding: "0.8rem 1.8rem", boxShadow: "0 0 20px rgba(47,191,164,0.3)" }}>
              Get Started →
            </Link>
            <Link className="button button--secondary button--lg" to="/docs/intro" style={{ fontWeight: 600, borderRadius: 10, padding: "0.8rem 1.8rem", background: "rgba(255,255,255,0.05)", borderColor: "rgba(255,255,255,0.15)" }}>
              Architecture Overview
            </Link>
          </div>
        </div>
      </header>
      <main>
        <div className="container">
          <div className="card-grid">
            {cards.map((c) => (
              <Link key={c.href} to={c.href}>
                <h3>
                  <span>{c.title}</span>
                  <span style={{ fontSize: "0.9rem", color: "#2fbfa4" }}>↗</span>
                </h3>
                <p>{c.body}</p>
              </Link>
            ))}
          </div>
        </div>
      </main>
    </Layout>
  );
}