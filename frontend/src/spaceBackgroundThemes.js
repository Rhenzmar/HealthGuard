/** Decorative workspace themes. They do not change the selected mission scenario. */
export const BACKGROUND_THEMES = Object.freeze([
  {id:'glow',label:'Soft glow',description:'Quiet blue ambient lighting'},
  {id:'earth',label:'Earth',description:'Blue atmospheric horizon'},
  {id:'moon',label:'Moon',description:'Cool lunar light'},
  {id:'mars',label:'Mars',description:'Subtle copper desert light'}
]);
export const DEFAULT_BACKGROUND = 'glow';
export const BACKGROUND_KEY = 'healthguard.workspaceBackground.v1';
export const WORKSPACE_BACKGROUND_PAGES = Object.freeze(['telemetry','body','routine','research','mission']);
export function normalizeBackground(value) {
  return BACKGROUND_THEMES.some(theme=>theme.id===value)?value:DEFAULT_BACKGROUND;
}
