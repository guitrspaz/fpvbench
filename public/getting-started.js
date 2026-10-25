import { renderController } from './controller.js';
import { demoControllerComparison } from './demo-controller.js';

function element(tag, attributes = {}, ...children) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) {
    if (name === 'text') node.textContent = value;
    else if (name === 'class') node.className = value;
    else node.setAttribute(name, String(value));
  }
  node.append(...children.filter(child => child !== null));
  return node;
}

/** A read-only start page. Integration: mountGettingStarted(host, {onImport}); no workspace requests are made here. */
export function mountGettingStarted(host, { onImport = null } = {}) {
  host.replaceChildren();
  const introduction = element('section', { class: 'panel getting-started', 'aria-label': 'Getting started' },
    element('h2', { text: 'Understand your controls, one setup at a time' }),
    element('p', { text: 'A setup is a saved copy of your quad’s settings. FPVBench keeps those copies so you can understand the controls and remember what changed.' }));
  const steps = element('ol', { class: 'getting-started-steps' });
  for (const [title, description] of [
    ['Explore the example', 'See a Controller 3 and compare two made-up setups. You do not need a quad or a backup to try it.'],
    ['Save your first backup', 'Add your aircraft, then import a Betaflight text backup. Give it a name you will recognize, such as “Before changing my controls”.'],
    ['Check your controls', 'Open My controller. Choose a button, check its connection, and record what you observed. Suggested layouts still need your check.'],
  ]) steps.append(element('li', {}, element('h3', { text: title }), element('p', { text: description })));
  introduction.append(steps);
  const example = element('section', { class: 'panel demo-workspace', 'aria-label': 'Synthetic controller example', hidden: '' });
  const exampleTitle = element('h2', { tabindex: '-1', text: 'Example only · no real aircraft' });
  const picker = element('select', { 'aria-label': 'Example setup' },
    element('option', { value: 'after', text: 'Revised example' }),
    element('option', { value: 'before', text: 'Original example' }));
  const demoHost = element('div');
  const renderExample = () => {
    const comparison = demoControllerComparison();
    renderController(demoHost, {
      view: picker.value === 'before' ? comparison.before : comparison.after,
      comparison: picker.value === 'before' ? null : comparison,
      referenceLabel: 'Original example',
    });
  };
  picker.addEventListener('change', renderExample);
  example.append(exampleTitle,
    element('p', { class: 'proof-note', text: 'These are synthetic Betaflight 4.5.2 backups. The button layout is suggested and unverified. Exploring this example does not add aircraft, change your setups, or connect to hardware.' }),
    element('label', {}, 'Example setup', picker), demoHost);
  const tryExample = element('button', { type: 'button', class: 'primary', text: 'Try the example', 'aria-expanded': 'false' });
  tryExample.addEventListener('click', () => {
    example.hidden = false;
    tryExample.setAttribute('aria-expanded', 'true');
    renderExample();
    exampleTitle.focus();
    example.scrollIntoView({ block: 'start' });
  });
  const actions = element('div', { class: 'toolbar' }, tryExample);
  if (onImport) {
    const importButton = element('button', { type: 'button', class: 'secondary', text: 'Import my setup' });
    importButton.addEventListener('click', onImport);
    actions.append(importButton);
  }
  introduction.append(actions,
    element('details', { class: 'getting-started-import' },
      element('summary', { text: 'How do I make a Betaflight backup?' }),
      element('p', { text: 'In Betaflight Configurator, open the CLI and enter dump all. Save the returned text as a .txt file, then import that file here. This reads saved settings; FPVBench never writes settings to your quad.' }),
      element('p', { class: 'form-help', text: 'A full backup makes missing button assignments easier to distinguish from settings omitted by a diff all export. Unsupported firmware or linked mode conditions can still need review.' }),
      element('p', {}, 'You can also download the existing ', element('a', { href: '/examples/controller-original.txt', download: '', text: 'original controller example' }), ' and ', element('a', { href: '/examples/controller-revised.txt', download: '', text: 'revised controller example' }), ' to try importing into a sample aircraft. These are examples for reading, never files to apply to a quad.')),
    element('p', { class: 'form-help', text: 'Start with Controller 3 button interpretation on Betaflight 4.5.x. Other controllers and firmware can still have saved setup history, but this button guide may not describe them.' }));
  const recoveryHost = element('div');
  mountRecoveryGuide(recoveryHost);
  host.append(introduction, example, recoveryHost);
}

/** Novice recovery instructions using the existing stopped-server CLI; never runs a restore from the browser. */
export function mountRecoveryGuide(host) {
  host.replaceChildren();
  const panel = element('section', { class: 'panel recovery-guide', 'aria-label': 'Backup and recovery' },
    element('h2', { text: 'Keep a backup you can recover' }),
    element('p', { text: 'Download a complete workspace backup before an update or a move to another computer. It includes your saved setups, controller observations, flight records and notes.' }),
    element('a', { class: 'button secondary', href: '/api/export', download: '', text: 'Download workspace backup' }),
    element('p', { class: 'form-help', text: 'Keep this file private: original flight files can contain locations and device identifiers. Optional AI keys, AI history and local folder preferences are not included in the portable backup.' }));
  const restore = element('details', {}, element('summary', { text: 'How to restore a backup' }));
  const steps = element('ol');
  steps.append(
    element('li', {}, element('p', { text: 'Keep the downloaded backup file. If FPVBench still opens, download a backup of the current workspace too. Restoring replaces the workspace; it does not merge two workspaces.' })),
    element('li', {}, element('p', { text: 'Stop FPVBench before restoring. For a terminal launch, press Ctrl+C in the terminal running it. For the macOS background service, use Stop FPVBench or run this from the FPVBench folder:' }), element('pre', { class: 'notes' }, element('code', { text: 'npm run service:stop' }))),
    element('li', {}, element('p', { text: 'Open a terminal in the FPVBench folder. Run the restore command with the actual location of your downloaded file, keeping the quotes around the path:' }),
      element('p', { class: 'form-help', text: 'macOS or Linux path example:' }),
      element('pre', { class: 'notes' }, element('code', { text: 'npm run restore -- "/absolute/path/fpvbench-workspace.json"' })),
      element('p', { class: 'form-help', text: 'Windows PowerShell path example:' }),
      element('pre', { class: 'notes' }, element('code', { text: 'npm run restore -- "C:\\Users\\YOUR_NAME\\Downloads\\fpvbench-workspace.json"' }))),
    element('li', {}, element('p', { text: 'Read the result. FPVBench checks the backup before replacing your workspace and retains a backup of the previous valid workspace. If restoration stops, keep your files and read the error; do not replace workspace.sqlite with the JSON file.' })),
    element('li', {}, element('p', { text: 'Start FPVBench again using the same method and data directory as before. Check your aircraft, setups and flight records after reopening.' }), element('pre', { class: 'notes' }, element('code', { text: 'npm start' })), element('p', { class: 'form-help', text: 'For the macOS background service, use Start FPVBench or npm run service:start instead.' })),
  );
  restore.append(element('p', { text: 'Use a complete version 2 or 3 workspace export. A single setup text file cannot restore the whole workspace. Recovery currently uses a terminal.' }), steps,
    element('p', { class: 'proof-note', text: 'If you use FPVBENCH_DATA_DIR, use that same custom directory for restoration and restart. If the current workspace is corrupt, preserve the whole directory and restore into a new empty directory instead.' }));
  panel.append(restore);host.append(panel);
}
