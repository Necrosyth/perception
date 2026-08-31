import { Link } from "react-router-dom";
import { Card, PageHeader } from "../components/ui";

export default function Privacy() {
  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        title="Privacy Policy"
        subtitle="Last updated: September 2026"
      />

      <Card className="p-6 space-y-5 text-sm leading-relaxed text-obs-fg-dim">
        <section className="space-y-2">
          <h3 className="font-display text-lg font-medium text-obs-fg">1. On-device processing</h3>
          <p>
            Observatory processes all video and detection data on equipment that you operate. Video
            frames are analyzed locally and are not uploaded to, or processed by, any cloud
            provider.
          </p>
        </section>

        <section className="space-y-2">
          <h3 className="font-display text-lg font-medium text-obs-fg">2. What we collect</h3>
          <p>
            When you contact us or register for support, we may collect the email address and
            technical details you provide. We do not collect or store your recorded footage on our
            systems.
          </p>
        </section>

        <section className="space-y-2">
          <h3 className="font-display text-lg font-medium text-obs-fg">3. Retention controls</h3>
          <p>
            Footage retention is governed by the settings you configure. You may enable automatic
            cleanup, adjust retention windows, and delete recordings at any time through the
            dashboard.
          </p>
        </section>

        <section className="space-y-2">
          <h3 className="font-display text-lg font-medium text-obs-fg">4. Automated redaction</h3>
          <p>
            The service may automatically blur faces and licence plates where you have enabled
            those features. You are responsible for ensuring compliance with local privacy law
            regarding the footage you record.
          </p>
        </section>

        <section className="space-y-2">
          <h3 className="font-display text-lg font-medium text-obs-fg">5. Your rights</h3>
          <p>
            Depending on your jurisdiction, you may have rights to access, correct, or delete
            personal data processed through the service. Operators can exercise these rights using
            the dashboard or by contacting the system administrator.
          </p>
        </section>

        <section className="space-y-2">
          <h3 className="font-display text-lg font-medium text-obs-fg">6. Contact</h3>
          <p>
            Questions about this policy can be directed to privacy@hypotenuse.example.
          </p>
        </section>

        <section className="space-y-1 border-t border-obs-line pt-4">
          <p className="text-xs text-obs-fg-faint">Hypotenuse Analytics · One Observatory Way</p>
          <p className="text-xs text-obs-fg-faint">
            <Link to="/terms" className="text-obs-accent hover:text-obs-accent-strong">Read the terms of service</Link>
          </p>
        </section>
      </Card>
    </div>
  );
}
