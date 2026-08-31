import { Link } from "react-router-dom";
import { Card, PageHeader } from "../components/ui";

export default function Terms() {
  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        title="Terms of Service"
        subtitle="Last updated: September 2026"
      />

      <Card className="p-6 space-y-5 text-sm leading-relaxed text-obs-fg-dim">
        <section className="space-y-2">
          <h3 className="font-display text-lg font-medium text-obs-fg">1. The service</h3>
          <p>
            Observatory is an on-premises video surveillance and detection system operated by
            Hypotenuse Analytics. It runs on equipment you control, processes footage locally, and
            does not transmit video to third-party cloud services.
          </p>
        </section>

        <section className="space-y-2">
          <h3 className="font-display text-lg font-medium text-obs-fg">2. Acceptable use</h3>
          <p>
            You agree to use the system lawfully and to obtain any consent required by applicable
            law before recording or processing footage of individuals. You are responsible for
            posting notices where required and for restricting access to authorised personnel.
          </p>
        </section>

        <section className="space-y-2">
          <h3 className="font-display text-lg font-medium text-obs-fg">3. No warranty</h3>
          <p>
            The software is provided on an "as is" and "as available" basis, without warranties of
            any kind, whether express or implied, including merchantability and fitness for a
            particular purpose. Detection output may contain errors and should not be the sole
            basis for safety-critical decisions.
          </p>
        </section>

        <section className="space-y-2">
          <h3 className="font-display text-lg font-medium text-obs-fg">4. Limitation of liability</h3>
          <p>
            To the fullest extent permitted by law, Hypotenuse Analytics shall not be liable for
            any indirect, incidental, special, or consequential damages, or for any loss of data,
            arising out of or in connection with the use of the service.
          </p>
        </section>

        <section className="space-y-2">
          <h3 className="font-display text-lg font-medium text-obs-fg">5. Termination</h3>
          <p>
            You may stop using the service at any time. This agreement remains in effect for any
            footage you have already recorded, and you remain responsible for its lawful retention
            and deletion.
          </p>
        </section>

        <section className="space-y-2">
          <h3 className="font-display text-lg font-medium text-obs-fg">6. Changes</h3>
          <p>
            We may revise these terms from time to time. Continued use of the service after changes
            take effect constitutes acceptance of the revised terms.
          </p>
        </section>

        <section className="space-y-1 border-t border-obs-line pt-4">
          <p className="text-xs text-obs-fg-faint">Contact: legal@hypotenuse.example · Hypotenuse Analytics</p>
          <p className="text-xs text-obs-fg-faint">
            <Link to="/privacy" className="text-obs-accent hover:text-obs-accent-strong">Read the privacy policy</Link>
          </p>
        </section>
      </Card>
    </div>
  );
}
