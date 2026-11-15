/** Focused UI onboarding for the existing sections; never modify simulator state. */
export const TOUR_STEPS=Object.freeze([
  {page:'dashboard',target:'dashboard',title:'Mission overview',body:'This is HealthGuard’s command overview. Select an astronaut to review their simulated health indicators and PhysioAlert status.'},
  {page:'telemetry',target:'telemetry',title:'Crew telemetry',body:'Inspect the nine physiological readings, their recent trends, and grouped physiological and engineering simulator channels.'},
  {page:'body',target:'body',title:'Body Explorer',body:'Choose a body system to inspect the interactive anatomy. During a scripted scenario, relevant flagged regions are highlighted.'},
  {page:'routine',target:'routine',title:'Health Routine',body:'Complete simulated mission check-ins, learning challenges, and activity-based tasks for the selected crew member.'},
  {page:'research',target:'research',title:'Health Library',body:'Explore astronaut health explanations and historical NASA research. Historical records are separate from live fictional crew readings.'},
  {page:'mission',target:'mission',title:'Mission Control',body:'Review the simulated mission environment, crew status, engineering readings, and scenario controls.'},
  {page:'hud',target:'hud',title:'Mission HUD',body:'Preview the astronaut’s suit display for Moon and Mars missions, including simulated warnings and environmental indicators.'},
  {page:'dashboard',target:'scenario',title:'Scenario Lab',body:'Open Scenario Lab from the navigation to try a fictional event. Its alerts are demonstration-only, and closing the popup keeps you on the current page.'}
]);
export const TOUR_SEEN_KEY='healthguard.guidedTourSeen.v1';
export function getTourStep(index){return TOUR_STEPS[index]||null;}
export function isTourStepCountValid(){return new Set(TOUR_STEPS.map(step=>step.target)).size===TOUR_STEPS.length;}
