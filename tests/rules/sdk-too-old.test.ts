import { describe, expect, it } from 'vitest';
import { runChecks } from '../../lib/doctor';
import { fixtureTests } from '../helpers/rule-suite';

function issues(dependencies: string) {
  return runChecks({ code: '', dependencies }).issues;
}

describe('sdk-too-old', () => {
  fixtureTests('sdk-too-old');

  it('a caret range that allows the minimum is only "possible"', () => {
    const [issue] = issues('{ "dependencies": { "@flagsmith/flagsmith": "^12.3.0" } }');
    expect(issue?.confidence).toBe('possible');
  });

  it('a tilde range capped below the minimum is "certain"', () => {
    expect(issues('{ "dependencies": { "@flagsmith/flagsmith": "~12.3.0" } }')[0]?.confidence).toBe('certain');
  });

  it('reads requirements.txt', () => {
    expect(issues('requests==2.31.0\nflagsmith==6.2.0\n')[0]?.message).toContain('6.3.0');
    expect(issues('flagsmith==6.3.0\n')).toEqual([]);
  });

  it('reads go.mod, including old major versions', () => {
    expect(issues('require github.com/Flagsmith/flagsmith-go-client/v5 v5.2.0')[0]?.message).toContain('5.3.0');
    expect(issues('require github.com/Flagsmith/flagsmith-go-client/v3 v3.9.0')[0]?.confidence).toBe('certain');
    expect(issues('require github.com/Flagsmith/flagsmith-go-client/v5 v5.3.1')).toEqual([]);
  });

  it('reads pom.xml and build.gradle', () => {
    expect(issues('<artifactId>flagsmith-java-client</artifactId>\n<version>8.1.0</version>')).toHaveLength(1);
    expect(issues("implementation 'com.flagsmith:flagsmith-java-client:8.2.0'")).toEqual([]);
  });

  it('is "not checked" when no Flagsmith SDK is listed', () => {
    const result = runChecks({ code: '', dependencies: '{ "dependencies": { "react": "19.0.0" } }' });
    expect(result.notChecked.find((item) => item.ruleId === 'sdk-too-old')?.reason).toMatch(/No Flagsmith SDK/);
  });

  describe('code with no experiment calls gets a "possible" heads-up, not "certain"', () => {
    const oldSdk = '{ "dependencies": { "@flagsmith/flagsmith": "12.3.0" } }';
    const featureFlagsOnly =
      "import flagsmith from '@flagsmith/flagsmith';\nawait flagsmith.init({ environmentID: 'x' });\nif (flagsmith.hasFeature('new_nav')) showNav();";
    const sdkIssues = (code: string, dependencies = oldSdk) =>
      runChecks({ code, dependencies }).issues.filter((issue) => issue.ruleId === 'sdk-too-old');

    it('feature flags only: possible, says why, keeps the patch', () => {
      const [issue] = sdkIssues(featureFlagsOnly);
      expect(issue?.confidence).toBe('possible');
      expect(issue?.message).toContain('no experiment calls yet');
      expect(issue?.patch).toBeDefined();
    });

    it('the replaced flagsmith-nodejs package is also only a heads-up', () => {
      const code = "const Flagsmith = require('flagsmith-nodejs');\nconst client = new Flagsmith({ environmentKey: 'k' });\nclient.getFlags();";
      expect(sdkIssues(code, '{ "dependencies": { "flagsmith-nodejs": "^2.5.0" } }')[0]?.confidence).toBe('possible');
    });

    it('stays certain when the code reads an experiment flag', () => {
      const code = `${featureFlagsOnly}\nconst flag = flagsmith.getExperimentFlag('checkout');`;
      expect(sdkIssues(code)[0]?.confidence).toBe('certain');
    });

    it('stays certain when the code tracks a Flagsmith event', () => {
      expect(sdkIssues(`${featureFlagsOnly}\nflagsmith.trackEvent('purchase');`)[0]?.confidence).toBe('certain');
    });

    it('stays certain when the code turns on enableEvents', () => {
      const code = "import flagsmith from '@flagsmith/flagsmith';\nawait flagsmith.init({ environmentID: 'x', enableEvents: true });";
      expect(sdkIssues(code)[0]?.confidence).toBe('certain');
    });

    it('stays certain when the options object cannot be read (it might turn on events)', () => {
      const code = "import flagsmith from '@flagsmith/flagsmith';\nawait flagsmith.init({ ...options });";
      expect(sdkIssues(code)[0]?.confidence).toBe('certain');
    });

    it("an analytics tool's trackEvent does not count as an experiment call", () => {
      expect(sdkIssues(`${featureFlagsOnly}\nanalytics.trackEvent('purchase');`)[0]?.confidence).toBe('possible');
    });

    it('stays certain when there is no code or it does not parse (we cannot tell)', () => {
      expect(sdkIssues('')[0]?.confidence).toBe('certain');
      expect(sdkIssues('const = ;')[0]?.confidence).toBe('certain');
    });
  });
});
