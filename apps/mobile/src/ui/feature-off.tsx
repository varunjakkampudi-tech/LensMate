import { Notice, Page } from "./kit";

/**
 * Shown in place of a feature that is outside the active phase and switched off in Profile → Features. The code stays
 * in the app; nothing on this screen runs, listens or sends anything.
 */
export function FeatureOff({ title, name }: { title: string; name: string }) {
  return (
    <Page title={title} kicker="OUTSIDE THE ACTIVE PHASE">
      <Notice tone="warn" testID="feature-off-notice">
        {`${name} is switched off. Turn it on in Profile → Features if you want to use it.`}
      </Notice>
    </Page>
  );
}
