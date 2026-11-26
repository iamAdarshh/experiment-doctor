import flagsmith from '@flagsmith/flagsmith';
import { FLAGS } from './flags.js';
import { renderOneLiner, renderSteps, renderOsPicker } from './install-views.js';

export function installVariant() {
  return flagsmith.getExperimentFlag(FLAGS.installSection)?.value ?? 'one_liner';
}

export function renderInstall(root) {
  switch (installVariant()) {
    case 'os_picker':
      return renderOsPicker(root);
    case 'steps':
      return renderSteps(root);
    default:
      return renderOneLiner(root);
  }
}

export function theme() {
  return flagsmith.hasFeature(FLAGS.darkMode) ? 'dark' : 'light';
}
