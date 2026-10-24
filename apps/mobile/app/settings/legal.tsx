import { Page, Body, Notice, H2, Card } from "../../src/ui/kit";
import { STRINGS } from "../../src/strings";

/**
 * Legal and privacy, in full. The Profile page shows a short summary and links here. The text is the same text that
 * used to sit on the Profile page, moved unchanged.
 */
export default function LegalScreen() {
  return (
    <Page title="Legal and privacy" kicker="WHAT LENSMATE SENDS AND KEEPS">
      <Card>
        <H2>What is sent to the cloud</H2>
        {STRINGS.cloudDisclosure.map((line) => (
          <Body key={line} size={14}>
            {line}
          </Body>
        ))}
      </Card>
      <Notice tone="info">
        Never built, at any time: face or voice identification, identifying people, always-on
        camera, background recording, covert interview help.
      </Notice>
    </Page>
  );
}
