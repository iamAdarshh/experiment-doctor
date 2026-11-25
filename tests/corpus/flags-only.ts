// Ordinary feature flags with no experiment: plain reads and enableAnalytics are fine here.
import flagsmith from '@flagsmith/flagsmith';

await flagsmith.init({ environmentID: 'env_abc123', enableAnalytics: true });
export const darkMode = flagsmith.hasFeature('dark_mode');
export const banner = flagsmith.getValue('banner_text');
