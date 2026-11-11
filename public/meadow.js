/** Presentational enhancement layer. No network access, prompts, or agent state. */
import { companions, createSprite, createIcon, createMeadow, createMiniMeadow } from './pixel-art.js';

// Restricted/private browser contexts can reject localStorage. Chat must still work.
export function readPreference(key) { try { return localStorage.getItem(key); } catch { return null; } }
export function savePreference(key, value) { try { value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value); } catch { /* Session remains usable without browser preferences. */ } }
const $ = id => document.getElementById(id);

export function initMeadow() {
  for (const target of document.querySelectorAll('[data-sprite]')) target.replaceChildren(createSprite(target.dataset.sprite));
  for (const target of document.querySelectorAll('[data-icon]')) target.replaceChildren(createIcon(target.dataset.icon));
  $('meadow-scene').replaceChildren(createMeadow());
  $('mini-meadow').replaceChildren(createMiniMeadow());

  const saved = readPreference('tn_buddy');
  let buddy = companions.find(item => item.id === saved) || companions[0];
  const picker = $('buddy-picker');
  function paintBuddy(root = document) {
    for (const target of root.querySelectorAll('[data-current-buddy]')) target.replaceChildren(createSprite(buddy.id));
  }
  function selectBuddy(next, announce = false) {
    buddy = next;
    if (announce) savePreference('tn_buddy', buddy.id);
    $('buddy-name').textContent = `${buddy.name} the ${buddy.species}`;
    $('buddy-name').title = buddy.description;
    for (const button of picker.querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.buddy === buddy.id));
    paintBuddy();
    if (announce) $('buddy-announcement').textContent = `${buddy.name} the ${buddy.species} joined your trail. ${buddy.description}`;
  }
  for (const item of companions) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'buddy-button'; button.dataset.buddy = item.id;
    button.title = `${item.name} the ${item.species} · ${item.description}`;
    button.setAttribute('aria-label', `Choose ${item.name} the ${item.species}`);
    button.setAttribute('aria-pressed', 'false');
    button.append(createSprite(item.id));
    button.addEventListener('click', () => selectBuddy(item, true));
    picker.append(button);
  }
  selectBuddy(buddy);

  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let motionWanted = readPreference('tn_motion') !== 'off';
  function updateMotion() {
    const enabled = motionWanted && !reducedMotion.matches;
    document.body.dataset.motion = enabled ? 'on' : 'off';
    $('motion-toggle').setAttribute('aria-pressed', String(enabled));
    $('motion-toggle').setAttribute('aria-label', reducedMotion.matches ? 'Animations disabled by your system’s reduced motion setting' : enabled ? 'Pause decorative animations' : 'Enable decorative animations');
    $('motion-toggle').disabled = reducedMotion.matches;
    $('motion-toggle').title = reducedMotion.matches ? 'Your system’s reduced motion preference is respected.' : 'Pause or resume decorative motion. Agent progress remains visible.';
    $('motion-label').textContent = enabled ? 'Motion on' : 'Motion off';
    $('motion-icon').replaceChildren(createIcon(enabled ? 'pause' : 'play'));
  }
  $('motion-toggle').addEventListener('click', () => { motionWanted = !motionWanted; savePreference('tn_motion', motionWanted ? 'on' : 'off'); updateMotion(); });
  reducedMotion.addEventListener('change', updateMotion);
  updateMotion();

  const darkScheme = matchMedia('(prefers-color-scheme: dark)');
  let userTheme = readPreference('tn_theme');
  function updateTheme() {
    const isDark = userTheme === 'dark' || (userTheme !== 'light' && darkScheme.matches);
    const theme = isDark ? 'dark' : 'light';
    document.documentElement.dataset.theme = theme;
    document.body.dataset.theme = theme;
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) metaTheme.setAttribute('content', isDark ? '#181427' : '#eee9f8');
    const toggle = $('theme-toggle');
    if (toggle) {
      toggle.setAttribute('aria-pressed', String(isDark));
      toggle.setAttribute('aria-label', isDark ? 'Switch to day theme' : 'Switch to night theme');
      toggle.title = isDark ? 'Switch to daytime in the meadow.' : 'Switch to starry night in the meadow.';
      const label = $('theme-label');
      if (label) label.textContent = isDark ? 'Day' : 'Night';
      const icon = $('theme-icon');
      if (icon) icon.replaceChildren(createIcon(isDark ? 'sun' : 'moon'));
    }
  }
  const themeToggle = $('theme-toggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const isCurrentlyDark = document.body.dataset.theme === 'dark';
      userTheme = isCurrentlyDark ? 'light' : 'dark';
      savePreference('tn_theme', userTheme);
      updateTheme();
    });
  }
  darkScheme.addEventListener('change', () => {
    if (!userTheme) updateTheme();
  });
  updateTheme();
  const visibility = () => { document.body.dataset.pageHidden = String(document.hidden); };
  document.addEventListener('visibilitychange', visibility);
  visibility();

  // A keyboard-trapped mobile rail. Desktop retains ordinary complementary navigation.
  const mobile = matchMedia('(max-width: 900px)');
  let drawerOpen = false;
  let previousFocus = null;
  function syncDrawer() {
    const open = mobile.matches && drawerOpen;
    document.body.dataset.drawer = open ? 'open' : 'closed';
    $('sidebar-backdrop').hidden = !open;
    $('open-sidebar').setAttribute('aria-expanded', String(open));
    $('sidebar').inert = mobile.matches && !open;
    $('main').inert = open;
    if (open) { $('sidebar').setAttribute('role', 'dialog'); $('sidebar').setAttribute('aria-modal', 'true'); }
    else { $('sidebar').removeAttribute('role'); $('sidebar').removeAttribute('aria-modal'); }
  }
  function openSidebar() {
    if (!mobile.matches) { $('thread-search').focus(); return; }
    previousFocus = document.activeElement;
    drawerOpen = true; syncDrawer(); $('close-sidebar').focus();
  }
  function closeSidebar(restore = true) {
    const wasOpen = drawerOpen;
    drawerOpen = false; syncDrawer();
    if (restore && wasOpen && previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
  }
  $('open-sidebar').addEventListener('click', openSidebar);
  $('close-sidebar').addEventListener('click', () => closeSidebar());
  $('sidebar-backdrop').addEventListener('click', () => closeSidebar());
  mobile.addEventListener('change', () => { const hadFocus = $('sidebar').contains(document.activeElement); closeSidebar(false); if (mobile.matches && hadFocus) $('open-sidebar').focus(); });
  document.addEventListener('keydown', event => {
    if (!drawerOpen || !mobile.matches) return;
    if (event.key === 'Escape') { event.preventDefault(); closeSidebar(); }
    if (event.key === 'Tab') {
      const elements = [...$('sidebar').querySelectorAll('a[href], button:not(:disabled), input:not(:disabled), [tabindex="0"]')].filter(item => item.getClientRects().length);
      const first = elements[0], last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  });
  syncDrawer();

  $('about').addEventListener('click', () => {
    $('dialog-title').textContent = 'A LITTLE ABOUT THE MEADOW';
    const content = $('evidence-content'); content.replaceChildren();
    const art = document.createElement('div'); art.className = 'about-art';
    for (const item of companions) art.append(createSprite(item.id));
    const title = document.createElement('h2'); title.textContent = 'A playful world. A grounded answer.';
    content.append(art, title);
    const sections = [
      ['First, remember.', 'Tracy retrieves original conversations and saved source snapshots. Your earlier answer records what was said, not proof that it was correct.'],
      ['Then, check.', 'When a question needs current information, the agent uses web search, compares compatible claims, and validates supporting evidence. It distinguishes a verified change from a corrected answer, missing evidence, or conflicting sources.'],
      ['Keep the field notes.', 'Click a source number to inspect its exact quote and retrieval date. Click a date to read the original message. The research log shows execution steps, not private model reasoning.'],
      ['Little friends. No extra agents.', 'Your trail buddy is purely visual. Choosing a companion never changes your model, tools, memory, prompts, or answer. Motion can be paused and respects your system settings.'],
      ['Your history, honestly.', 'Conversations are stored unencrypted on this server and scoped to the browser’s session cookie. This is not account authentication. Use “Clear this browser’s history” to delete this session’s saved conversations and evidence.'],
    ];
    for (const [heading, body] of sections) { const h = document.createElement('h3'); h.textContent = heading; const p = document.createElement('p'); p.textContent = body; content.append(h, p); }
    $('evidence-dialog').showModal();
  });
  return {
    paintBuddy,
    closeSidebar,
    setView(hasMessages) { document.body.dataset.view = hasMessages ? 'conversation' : 'welcome'; $('welcome').hidden = hasMessages; },
    setBusy(busy) { document.body.dataset.busy = String(busy); },
  };
}
